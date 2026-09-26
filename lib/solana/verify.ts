import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import {
  PublicKey,
  TransactionInstruction,
  type Connection,
  type VersionedTransaction,
} from '@solana/web3.js';
import type { TransactionVerification } from '@/lib/types/solana';
import {
  COMPUTE_BUDGET_PROGRAM_ID,
  LEGACY_MEMO_PROGRAM_ID,
  MEMO_PROGRAM_ID,
  TOKEN_INSTRUCTION_DISCRIMINANT,
} from './constants';

/**
 * Верификация платежей на сервере.
 *
 * Клиенту доверять нельзя: он может прислать подпись чужой транзакции.
 * Поэтому сервер сам читает транзакцию из кластера и проверяет:
 *   1. транзакция существует и завершилась успешно;
 *   2. reference-ключ Solana Pay (если он был) присутствует в аккаунтах;
 *   3. есть перевод нужного токена, в нужном количестве, от ожидаемого
 *      отправителя ожидаемому получателю (эскроу PDA);
 *   4. memo содержит id группы.
 *
 * Про `validateTransfer` из @solana/pay: он проверяет, что получатель
 * *одобрил* запрос на перевод (pull-модель). У нас push-модель — участник
 * платит сам, — поэтому инструкции разбираются вручную. Заодно так видно
 * SPL-токен, а не только SOL.
 */

export interface ExpectedTransfer {
  /** Кто должен платить. */
  sender: PublicKey;
  /** Куда должен уйти токен (ATA эскроу). */
  recipientTokenAccount: PublicKey;
  /** Mint SPL-токена. */
  mint: PublicKey;
  /** Ожидаемая сумма в минимальных единицах. */
  amount: bigint;
  /**
   * Допустимое расхождение в минимальных единицах.
   * 1 нужен для платежей по QR: кошелёк округляет 6-значную сумму через float.
   */
  tolerance?: bigint;
  /** reference-ключ Solana Pay, если платёж шёл через QR. */
  reference?: PublicKey | null;
  /** memo, которое должен содержать платёж (id группы). */
  memo?: string | null;
}

export class TransactionVerificationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'TransactionVerificationError';
    this.code = code;
  }
}

/** Приводит любое сообщение транзакции к инструкциям с публичными ключами. */
function extractInstructions(tx: VersionedTransaction): TransactionInstruction[] {
  const message = tx.message as unknown as {
    staticAccountKeys: PublicKey[];
    instructions?: { programIdIndex: number; accounts: number[]; data: Uint8Array }[];
    compiledInstructions?: { programIdIndex: number; accounts: number[]; data: Uint8Array }[];
    isAccountSigner(index: number): boolean;
    isAccountWritable(index: number): boolean;
  };

  const keys = message.staticAccountKeys;
  // У legacy Message поле `instructions`, у MessageV0 — `compiledInstructions`.
  const compiled = message.instructions ?? message.compiledInstructions ?? [];

  return compiled.map((instruction) => {
    const data = instruction.data;
    return new TransactionInstruction({
      programId: keys[instruction.programIdIndex]!,
      keys: instruction.accounts.map((index) => ({
        pubkey: keys[index]!,
        isSigner: message.isAccountSigner(index),
        isWritable: message.isAccountWritable(index),
      })),
      data: Buffer.from(data),
    });
  });
}

/** Все публичные ключи, упомянутые в транзакции (для поиска reference). */
function extractAccountKeys(tx: VersionedTransaction): PublicKey[] {
  const message = tx.message as unknown as {
    staticAccountKeys: PublicKey[];
    accountKeys?: PublicKey[];
  };
  return message.staticAccountKeys ?? message.accountKeys ?? [];
}

function decodeU64LE(data: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 7; i >= 0; i -= 1) {
    value = (value << 8n) | BigInt(data[offset + i] ?? 0);
  }
  return value;
}

function readLengthPrefixedString(data: Uint8Array, offset: number): string {
  const length = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, true);
  return new TextDecoder().decode(data.slice(offset + 4, offset + 4 + length));
}

function sameAddress(left: PublicKey, right: PublicKey): boolean {
  return left.toBase58() === right.toBase58();
}

function absoluteDiff(left: bigint, right: bigint): bigint {
  return left > right ? left - right : right - left;
}

export interface VerifyOptions {
  commitment?: 'confirmed' | 'finalized';
}

export async function verifyTransfer(
  connection: Connection,
  signature: string,
  expected: ExpectedTransfer,
  options: VerifyOptions = {},
): Promise<TransactionVerification> {
  const response = await connection.getTransaction(signature, {
    commitment: options.commitment ?? 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (!response) {
    throw new TransactionVerificationError('TX_NOT_FOUND', 'Транзакция не найдена в кластере');
  }
  if (response.meta?.err) {
    throw new TransactionVerificationError(
      'TX_FAILED',
      `Транзакция завершилась ошибкой: ${JSON.stringify(response.meta.err)}`,
    );
  }

  const tx = response as unknown as VersionedTransaction;

  // 1. reference-ключ Solana Pay: по спецификации это публичный ключ, который
  //    просто присутствует в списке аккаунтов транзакции.
  const accountKeys = extractAccountKeys(tx);
  const hasReference = expected.reference
    ? accountKeys.some((key) => sameAddress(key, expected.reference!))
    : true;

  if (expected.reference && !hasReference) {
    throw new TransactionVerificationError(
      'REFERENCE_MISSATCH',
      'В транзакции нет reference-ключа Solana Pay — вероятно, платёж был не по нашей ссылке',
    );
  }

  // 2. Разбор инструкций.
  const instructions = extractInstructions(tx);
  let matchedAmount = 0n;
  let memoText: string | null = null;
  let matched = false;

  for (const instruction of instructions) {
    const programId = instruction.programId;

    if (sameAddress(programId, MEMO_PROGRAM_ID) && instruction.data.length >= 4) {
      memoText = readLengthPrefixedString(instruction.data, 0);
      continue;
    }
    if (sameAddress(programId, LEGACY_MEMO_PROGRAM_ID)) {
      memoText = new TextDecoder().decode(instruction.data);
      continue;
    }
    if (
      sameAddress(programId, COMPUTE_BUDGET_PROGRAM_ID) ||
      sameAddress(programId, ASSOCIATED_TOKEN_PROGRAM_ID)
    ) {
      continue;
    }
    if (!sameAddress(programId, TOKEN_PROGRAM_ID)) continue;

    const discriminant = instruction.data[0];
    const isTransfer = discriminant === TOKEN_INSTRUCTION_DISCRIMINANT.transfer;
    const isChecked = discriminant === TOKEN_INSTRUCTION_DISCRIMINANT.transferChecked;
    if (!isTransfer && !isChecked) continue;

    const source = instruction.keys[0]?.pubkey;
    const destination = instruction.keys[1]?.pubkey;
    if (!source || !destination) continue;
    if (!sameAddress(source, expected.sender)) continue;
    if (!sameAddress(destination, expected.recipientTokenAccount)) continue;

    // transfer:      [disc(1) | amount(8)]
    // transferChecked: [disc(1) | decimals(1) | amount(8) | mint(32)]
    const amountOffset = isChecked ? 2 : 1;
    const amount = decodeU64LE(instruction.data, amountOffset);

    if (isChecked) {
      const mint = new PublicKey(instruction.data.slice(amountOffset + 8, amountOffset + 40));
      if (!sameAddress(mint, expected.mint)) continue;
    }

    if (absoluteDiff(amount, expected.amount) > (expected.tolerance ?? 0n)) continue;

    matched = true;
    matchedAmount = amount;
    break;
  }

  if (!matched) {
    throw new TransactionVerificationError(
      'TRANSFER_NOT_FOUND',
      'В транзакции нет перевода ожидаемой суммы от указанного отправителя получателю',
    );
  }

  // 3. memo должен содержать id группы, если он задан.
  if (expected.memo && !memoText?.includes(expected.memo)) {
    throw new TransactionVerificationError('MEMO_MISMATCH', 'memo не содержит id группы');
  }

  return {
    signature,
    valid: true,
    amount: matchedAmount,
    recipient: expected.recipientTokenAccount.toBase58(),
    reference: expected.reference?.toBase58(),
    slot: response.slot,
    blockTime: response.blockTime,
    fee: response.meta?.fee != null ? BigInt(response.meta.fee) : undefined,
    usedMemo: memoText ?? undefined,
  };
}

export { getAssociatedTokenAddressSync };
