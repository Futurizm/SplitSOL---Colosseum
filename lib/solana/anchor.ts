import { AnchorProvider, BN, Program, setProvider, type Idl } from '@coral-xyz/anchor';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey, type Connection } from '@solana/web3.js';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import idlJson from './idl/splitsol.json';
import {
  COMMITMENT,
  GROUP_SEED_PREFIX,
  MEMBER_SEED_PREFIX,
  getProgramId,
  getProgramIdOrNull,
  isProgramConfigured,
  isTestTokenConfigured,
  requireTestTokenMint,
} from './constants';
import type {
  OnchainGroupAccount,
  OnchainGroupStatus,
  OnchainGroupSummary,
  OnchainMemberAccount,
} from '@/lib/types/solana';

/**
 * Тонкая обёртка над Anchor-клиентом.
 *
 * IDL лежит в `lib/solana/idl/splitsol.json` — после `anchor build` его нужно
 * обновить: `node scripts/refresh-idl.mjs`.
 */

export const IDL = idlJson as unknown as Idl;

export { isProgramConfigured, isTestTokenConfigured, getProgramId, getProgramIdOrNull, requireTestTokenMint };

export function getAnchorProvider(connection: Connection, wallet: AnchorWallet): AnchorProvider {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: COMMITMENT,
    preflightCommitment: COMMITMENT,
    skipPreflight: false,
  });
  setProvider(provider);
  return provider;
}

export function getSplitSolProgram(provider: AnchorProvider): Program {
  return new Program(resolveIdl(), provider);
}

/**
 * Anchor 0.30 берёт program ID из поля `address` самого IDL. Подставляем туда
 * значение из env, чтобы не нужно было перегенерировать IDL после каждого
 * деплоя.
 */
export function resolveIdl(): Idl {
  const address = getProgramId().toBase58();
  return { ...IDL, address, metadata: { ...IDL.metadata, address } } as Idl;
}

/** Программа из уже готового provider'а (используется в тестах). */
export function getProgramFromProvider(provider: AnchorProvider): Program {
  return getSplitSolProgram(provider);
}

// ─────────────────────────────────────────────────────────────────────────────
// Типизированная фасадка поверх untyped IDL
//
// Anchor генерирует TS-типы из `target/types/splitsol` только после
// `anchor build`, поэтому в репозитории их нет и `program.methods.*` не
// типизируется. Фасадка описывает нужную часть поверхности API программы —
// вызовы в приложении остаются полностью типизированными.
// ─────────────────────────────────────────────────────────────────────────────

export interface RemainingAccount {
  pubkey: PublicKey;
  isSigner: boolean;
  isWritable: boolean;
}

export interface InstructionBuilder {
  accounts(accounts: Record<string, PublicKey>): InstructionBuilder;
  remainingAccounts(accounts: RemainingAccount[]): InstructionBuilder;
  rpc(options?: { commitment?: string }): Promise<string>;
  simulate(): Promise<{ logs: string[] | null }>;
}

export interface CreateGroupArgs {
  groupId: number[];
  totalAmount: BN;
  memberCount: number;
  ownerShare: BN;
  recipient: PublicKey;
}

/** Untyped-обёртка над сгенерированным клиентом: IDL-типов в репозитории нет. */
type RawMethod = (...args: never[]) => InstructionBuilder;

interface RawAccounts {
  group: { fetch(address: PublicKey): Promise<unknown> };
  member: { fetch(address: PublicKey): Promise<unknown> };
}

export interface SplitSolProgramFacade {
  programId: PublicKey;
  connection: Connection;
  provider: AnchorProvider;
  methods: {
    createGroup(args: CreateGroupArgs): InstructionBuilder;
    joinGroup(shareAmount: BN): InstructionBuilder;
    payShare(): InstructionBuilder;
    settleGroup(): InstructionBuilder;
    cancelGroup(): InstructionBuilder;
  };
  account: {
    group(address: PublicKey): Promise<OnchainGroupAccount | null>;
    member(address: PublicKey): Promise<OnchainMemberAccount | null>;
  };
  /** Подписка на Anchor-событие SharePaid. Возвращает функцию отписки. */
  onSharePaid(
    callback: (event: { group: string; payer: string; amount: string; paidCount: number }) => void,
  ): () => void;
}

export function getSplitSolFacade(provider: AnchorProvider): SplitSolProgramFacade {
  const program = getSplitSolProgram(provider);
  const methods = program.methods as unknown as Record<string, RawMethod>;
  const accounts = program.account as unknown as RawAccounts;

  return {
    programId: program.programId,
    connection: provider.connection,
    provider,
    methods: {
      createGroup: (args) => methods['createGroup']!(args as never),
      joinGroup: (shareAmount) => methods['joinGroup']!(shareAmount as never),
      payShare: () => methods['payShare']!(),
      settleGroup: () => methods['settleGroup']!(),
      cancelGroup: () => methods['cancelGroup']!(),
    },
    account: {
      async group(address) {
        try {
          return (await accounts.group.fetch(address)) as OnchainGroupAccount;
        } catch {
          return null;
        }
      },
      async member(address) {
        try {
          return (await accounts.member.fetch(address)) as OnchainMemberAccount;
        } catch {
          return null;
        }
      },
    },
    onSharePaid(callback) {
      const id = program.addEventListener('SharePaid', (event: unknown) => {
        const payload = event as {
          group: PublicKey;
          payer: PublicKey;
          amount: { toString(): string };
          paidCount: number;
        };
        callback({
          group: payload.group.toString(),
          payer: payload.payer.toString(),
          amount: payload.amount.toString(),
          paidCount: payload.paidCount,
        });
      });
      return () => program.removeEventListener(id);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PDA helpers — должны совпадать с сидами в Rust-коде программы
// ─────────────────────────────────────────────────────────────────────────────

/** Первые 8 байт UUID → group_id для PDA-сидов. */
export function groupIdBytesFromUuid(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '').slice(0, 16);
  if (hex.length !== 16) throw new Error('Некорректный UUID для group_id');
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

/** Обратное преобразование для отображения: 8 байт → hex. */
export function groupIdBytesToHex(bytes: Uint8Array | number[]): string {
  const view = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  return Buffer.from(view).toString('hex');
}

export function deriveGroupPDA(
  owner: PublicKey,
  groupId: Uint8Array | number[],
  programId: PublicKey = getProgramId(),
): [PublicKey, number] {
  const bytes = groupId instanceof Uint8Array ? groupId : Uint8Array.from(groupId);
  if (bytes.length !== 8) {
    throw new Error('group_id должен содержать ровно 8 байт');
  }
  return PublicKey.findProgramAddressSync(
    [Buffer.from(GROUP_SEED_PREFIX), owner.toBuffer(), Buffer.from(bytes)],
    programId,
  );
}

export function deriveMemberPDA(
  group: PublicKey,
  wallet: PublicKey,
  programId: PublicKey = getProgramId(),
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(MEMBER_SEED_PREFIX), group.toBuffer(), wallet.toBuffer()],
    programId,
  );
}

/** ATA токена для владельца. `allowOwnerOffCurve` нужен для PDA-эскроу. */
export function getEscrowAddress(group: PublicKey, mint?: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint ?? requireTestTokenMint(), group, true);
}

/** ATA кошелька пользователя (может не существовать — тогда его надо создать). */
export function getWalletTokenAddress(wallet: PublicKey, mint?: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint ?? requireTestTokenMint(), wallet, false);
}

// ─────────────────────────────────────────────────────────────────────────────
// Декодирование аккаунтов
// ─────────────────────────────────────────────────────────────────────────────

export function decodeGroupStatus(status: OnchainGroupAccount['status']): OnchainGroupStatus {
  if (status && typeof status === 'object') {
    if ('active' in status) return 'active';
    if ('settled' in status) return 'settled';
    if ('cancelled' in status) return 'cancelled';
  }
  return 'active';
}

export function toGroupSummary(address: PublicKey, account: OnchainGroupAccount): OnchainGroupSummary {
  const paidAmounts = account.paidAmounts.map((value) => BigInt(value.toString()));
  return {
    address: address.toString(),
    owner: account.owner.toString(),
    groupId: groupIdBytesToHex(account.groupId),
    totalAmount: BigInt(account.totalAmount.toString()),
    committedAmount: BigInt(account.committedAmount.toString()),
    tokenMint: account.tokenMint.toString(),
    recipient: account.recipient.toString(),
    memberCount: account.memberCount,
    joinedCount: account.joinedCount,
    paidCount: account.paidCount,
    status: decodeGroupStatus(account.status),
    collectedAmount: paidAmounts.reduce<bigint>((sum, value) => sum + value, 0n),
  };
}

/** Человекочитаемый текст ошибки Anchor (парсит program error из логов). */
export function describeAnchorError(error: unknown): string {
  if (!error) return 'Неизвестная ошибка';
  const raw = error instanceof Error ? error.message : String(error);

  const custom = raw.match(/custom program error: 0x([0-9a-fA-F]+)/);
  if (custom?.[1]) {
    const code = Number.parseInt(custom[1], 16);
    const known = IDL.errors?.find((item) => item.code === code);
    if (known) return known.msg || known.name;
    return `Ошибка программы #${code}`;
  }

  const logs = raw.match(/AnchorError[^\n]*/);
  if (logs?.[0]) return logs[0];

  return raw.length > 240 ? `${raw.slice(0, 240)}…` : raw;
}
