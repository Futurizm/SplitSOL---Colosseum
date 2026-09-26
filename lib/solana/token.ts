import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
} from '@solana/spl-token';
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  type Connection,
  type TransactionInstruction,
} from '@solana/web3.js';
import { fromMicroUnits } from '@/lib/utils/format';
import { getTestTokenSymbol } from './constants';
import type { TokenBalance } from '@/lib/types/solana';

/** Базовые утилиты SPL Token, общие для любого mint'а. */

export async function getMintInfo(connection: Connection, mint: PublicKey) {
  const info = await getMint(connection, mint);
  return {
    mint: info.address.toString(),
    decimals: info.decimals,
    supply: info.supply.toString(),
    uiSupply: fromMicroUnits(info.supply, info.decimals).toFixed(6),
    isInitialized: info.isInitialized,
    mintAuthority: info.mintAuthority?.toString() ?? null,
    freezeAuthority: info.freezeAuthority?.toString() ?? null,
  };
}

export async function getTokenBalance(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
): Promise<TokenBalance> {
  const address = getAssociatedTokenAddressSync(mint, owner, true);
  const account = await connection.getAccountInfo(address);
  if (!account) {
    const mintInfo = await getMint(connection, mint).catch(() => null);
    return {
      mint: mint.toString(),
      amount: 0n,
      decimals: mintInfo?.decimals ?? 0,
      uiAmount: '0',
    };
  }

  const tokenAccount = await getAccount(connection, address);
  const decimals = await getMint(connection, mint)
    .then((m) => m.decimals)
    .catch(() => 0);

  return {
    mint: mint.toString(),
    amount: tokenAccount.amount,
    decimals,
    uiAmount: fromMicroUnits(tokenAccount.amount, decimals).toFixed(6),
  };
}

/** Баланс произвольного (не обязательно ATA) токен-аккаунта. */
export async function getTokenAccountBalance(
  connection: Connection,
  tokenAccount: PublicKey,
): Promise<bigint> {
  try {
    const parsed = await getAccount(connection, tokenAccount);
    return parsed.amount;
  } catch {
    return 0n;
  }
}

export async function tokenAccountExists(
  connection: Connection,
  tokenAccount: PublicKey,
): Promise<boolean> {
  return (await connection.getAccountInfo(tokenAccount)) !== null;
}

/** Создаёт ATA, если её ещё нет. Возвращает адрес ATA в любом случае. */
export async function ensureAssociatedTokenAccount(
  connection: Connection,
  payer: PublicKey,
  mint: PublicKey,
  owner: PublicKey,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
): Promise<PublicKey> {
  const address = getAssociatedTokenAddressSync(mint, owner, true);

  if (await tokenAccountExists(connection, address)) return address;

  const transaction = new Transaction().add(
    createAssociatedTokenAccountInstruction(payer, address, owner, mint, ASSOCIATED_TOKEN_PROGRAM_ID),
  );
  transaction.feePayer = payer;
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const signed = await signTransaction(transaction);
  await connection.sendRawTransaction(signed.serialize(), { preflightCommitment: 'confirmed' });
  return address;
}

/** Инструкции для ленивого создания набора ATA одним батчем. */
export function buildCreateAtaInstructions(
  payer: PublicKey,
  mints: PublicKey[],
  owners: PublicKey[],
): TransactionInstruction[] {
  const instructions: TransactionInstruction[] = [];
  for (const mint of mints) {
    for (const owner of owners) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          payer,
          getAssociatedTokenAddressSync(mint, owner, true),
          owner,
          mint,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      );
    }
  }
  return instructions;
}

/** Создание ATA серверным кошельком (например, mint authority'ом). */
export { createAssociatedTokenAccount, getAssociatedTokenAddressSync, LAMPORTS_PER_SOL, PublicKey, SystemProgram };

/** Подпись токена в интерфейсе. */
export function tokenLabel(mint: PublicKey | null): string {
  if (!mint) return getTestTokenSymbol();
  return `${getTestTokenSymbol()}…${mint.toBase58().slice(-4)}`;
}
