import type { PublicKey } from '@solana/web3.js';

/** Статус on-chain группы. Зеркалит `GroupStatus` в Anchor-программе. */
export type OnchainGroupStatus = 'active' | 'settled' | 'cancelled';

/** Формат аккаунта, возвращаемого Anchor-клиентом. */
export interface OnchainGroupAccount {
  owner: PublicKey;
  groupId: number[];
  totalAmount: { toString(): string };
  committedAmount: { toString(): string };
  tokenMint: PublicKey;
  recipient: PublicKey;
  memberCount: number;
  joinedCount: number;
  paidCount: number;
  status: { active: Record<string, never> } | { settled: Record<string, never> } | { cancelled: Record<string, never> };
  bump: number;
  paidMembers: PublicKey[];
  paidAmounts: { toString(): string }[];
}

export interface OnchainMemberAccount {
  group: PublicKey;
  wallet: PublicKey;
  tokenAccount: PublicKey;
  shareAmount: { toString(): string };
  hasPaid: boolean;
  isCreator: boolean;
  refunded: boolean;
  bump: number;
}

export interface OnchainGroupSummary {
  address: string;
  owner: string;
  groupId: string;
  totalAmount: bigint;
  committedAmount: bigint;
  tokenMint: string;
  recipient: string;
  memberCount: number;
  joinedCount: number;
  paidCount: number;
  status: OnchainGroupStatus;
  collectedAmount: bigint;
}

export interface SolanaPayParams {
  recipient: string;
  /** Сумма в человеческих единицах, например "10.5" */
  amount: string;
  reference?: string;
  label: string;
  message: string;
  memo: string;
}

export interface SolanaPayResult {
  url: string;
  reference: string;
}

export type ExplorerCluster = 'devnet' | 'localnet' | 'testnet' | 'mainnet-beta';

export interface TransactionVerification {
  signature: string;
  valid: boolean;
  reason?: string;
  amount?: bigint;
  recipient?: string;
  reference?: string;
  slot?: number;
  blockTime?: number | null;
  fee?: bigint;
  /** Текст memo из транзакции, если он был. */
  usedMemo?: string;
}

export interface TokenBalance {
  mint: string;
  amount: bigint;
  decimals: number;
  /** Человекочитаемое представление. */
  uiAmount: string;
}
