'use client';

import { BN } from '@coral-xyz/anchor';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, SYSVAR_RENT_PUBKEY, SystemProgram } from '@solana/web3.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deriveGroupPDA,
  deriveMemberPDA,
  describeAnchorError,
  getAnchorProvider,
  getEscrowAddress,
  getSplitSolFacade,
  getWalletTokenAddress,
  type SplitSolProgramFacade,
} from '@/lib/solana/anchor';
import { isProgramConfigured, requireTestTokenMint } from '@/lib/solana/constants';
import type { OnchainGroupAccount, OnchainMemberAccount } from '@/lib/types/solana';

export interface CreateGroupInput {
  groupIdBytes: Uint8Array;
  /** Сумма счёта в минимальных единицах токена */
  totalAmount: bigint;
  /** Доля создателя, micro-единицы */
  ownerShare: bigint;
  memberCount: number;
  recipient: PublicKey;
}

export interface CreateGroupResult {
  signature: string;
  groupPda: PublicKey;
  memberPda: PublicKey;
  escrowAddress: PublicKey;
}

export interface JoinGroupResult {
  signature: string;
  memberPda: PublicKey;
  tokenAccount: PublicKey;
}

export interface PayShareResult {
  signature: string;
  memberPda: PublicKey;
  amount: bigint;
}

export interface SettleResult {
  signature: string;
  amount: bigint;
  recipient: PublicKey;
}

export interface CancelResult {
  signature: string;
  refunded: bigint;
}

export interface UseAnchorProgramResult {
  program: SplitSolProgramFacade | null;
  publicKey: PublicKey | null;
  isReady: boolean;
  /** Человекочитаемая причина, почему on-chain недоступен. */
  unavailableReason: string | null;

  createGroup: (input: CreateGroupInput) => Promise<CreateGroupResult>;
  joinGroup: (groupPda: PublicKey, shareAmount: bigint) => Promise<JoinGroupResult>;
  payShare: (groupPda: PublicKey) => Promise<PayShareResult>;
  settleGroup: (groupPda: PublicKey) => Promise<SettleResult>;
  cancelGroup: (groupPda: PublicKey, memberPdas: PublicKey[]) => Promise<CancelResult>;

  fetchGroup: (groupPda: PublicKey) => Promise<OnchainGroupAccount | null>;
  fetchMember: (groupPda: PublicKey, wallet: PublicKey) => Promise<OnchainMemberAccount | null>;
  subscribeToGroupEvents: (
    groupPda: PublicKey,
    callback: (event: { group: string; payer: string; amount: string; paidCount: number }) => void,
  ) => () => void;
}

const PROGRAM_ACCOUNTS = {
  systemProgram: SystemProgram.programId,
  tokenProgram: TOKEN_PROGRAM_ID,
  associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  rent: SYSVAR_RENT_PUBKEY,
} as const;

/**
 * Хук для всех on-chain вызовов Anchor-программы.
 *
 * Возвращает `program: null`, если программа не задеплоена — интерфейс в этом
 * случае показывает подсказку вместо падения (см. `isReady`).
 */
export function useAnchorProgram(): UseAnchorProgramResult {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const [publicKey, setPublicKey] = useState<PublicKey | null>(anchorWallet?.publicKey ?? null);

  useEffect(() => {
    setPublicKey(anchorWallet?.publicKey ?? null);
  }, [anchorWallet]);

  const program = useMemo<SplitSolProgramFacade | null>(() => {
    if (!anchorWallet || !isProgramConfigured()) return null;
    return getSplitSolFacade(getAnchorProvider(connection, anchorWallet));
  }, [anchorWallet, connection]);

  const requireProgram = useCallback(() => {
    if (!program) {
      throw new Error(
        'Anchor-программа недоступна. Выполните `anchor deploy` и укажите NEXT_PUBLIC_PROGRAM_ID в .env.local.',
      );
    }
    if (!publicKey) {
      throw new Error('Сначала подключите кошелёк');
    }
    return { program, publicKey };
  }, [program, publicKey]);

  const createGroup = useCallback(
    async (input: CreateGroupInput): Promise<CreateGroupResult> => {
      const { program: p, publicKey: owner } = requireProgram();
      const mint = requireTestTokenMint();

      const [groupPda] = deriveGroupPDA(owner, input.groupIdBytes);
      const [memberPda] = deriveMemberPDA(groupPda, owner);
      const escrowAddress = getEscrowAddress(groupPda, mint);

      try {
        const signature = await p.methods
          .createGroup({
            groupId: Array.from(input.groupIdBytes),
            totalAmount: new BN(input.totalAmount.toString()),
            memberCount: input.memberCount,
            ownerShare: new BN(input.ownerShare.toString()),
            recipient: input.recipient,
          })
          .accounts({
            owner,
            group: groupPda,
            member: memberPda,
            tokenMint: mint,
            escrowTokenAccount: escrowAddress,
            ...PROGRAM_ACCOUNTS,
          })
          .rpc({ commitment: 'confirmed' });

        return { signature, groupPda, memberPda, escrowAddress };
      } catch (error) {
        throw new Error(describeAnchorError(error));
      }
    },
    [requireProgram],
  );

  const joinGroup = useCallback(
    async (groupPda: PublicKey, shareAmount: bigint): Promise<JoinGroupResult> => {
      const { program: p, publicKey: joiner } = requireProgram();
      const mint = requireTestTokenMint();
      const [memberPda] = deriveMemberPDA(groupPda, joiner);
      const tokenAccount = getWalletTokenAddress(joiner, mint);

      try {
        const signature = await p.methods
          .joinGroup(new BN(shareAmount.toString()))
          .accounts({
            joiner,
            group: groupPda,
            member: memberPda,
            tokenMint: mint,
            joinerTokenAccount: tokenAccount,
            ...PROGRAM_ACCOUNTS,
          })
          .rpc({ commitment: 'confirmed' });

        return { signature, memberPda, tokenAccount };
      } catch (error) {
        throw new Error(describeAnchorError(error));
      }
    },
    [requireProgram],
  );

  const payShare = useCallback(
    async (groupPda: PublicKey): Promise<PayShareResult> => {
      const { program: p, publicKey: payer } = requireProgram();
      const mint = requireTestTokenMint();
      const [memberPda] = deriveMemberPDA(groupPda, payer);
      const escrowAddress = getEscrowAddress(groupPda, mint);
      const payerTokenAccount = getWalletTokenAddress(payer, mint);

      const member = await p.account.member(memberPda);
      const amount = BigInt(member?.shareAmount.toString() ?? '0');

      try {
        const signature = await p.methods
          .payShare()
          .accounts({
            payer,
            group: groupPda,
            member: memberPda,
            tokenMint: mint,
            payerTokenAccount,
            escrowTokenAccount: escrowAddress,
            ...PROGRAM_ACCOUNTS,
          })
          .rpc({ commitment: 'confirmed' });

        return { signature, memberPda, amount };
      } catch (error) {
        throw new Error(describeAnchorError(error));
      }
    },
    [requireProgram],
  );

  const settleGroup = useCallback(
    async (groupPda: PublicKey): Promise<SettleResult> => {
      const { program: p, publicKey: owner } = requireProgram();
      const mint = requireTestTokenMint();
      const group = await p.account.group(groupPda);
      if (!group) throw new Error('On-chain аккаунт группы не найден');

      const recipient = group.recipient;
      const recipientTokenAccount = getWalletTokenAddress(recipient, mint);
      const escrowAddress = getEscrowAddress(groupPda, mint);

      try {
        const signature = await p.methods
          .settleGroup()
          .accounts({
            owner,
            group: groupPda,
            recipient,
            tokenMint: mint,
            escrowTokenAccount: escrowAddress,
            recipientTokenAccount,
            ...PROGRAM_ACCOUNTS,
          })
          .rpc({ commitment: 'confirmed' });

        return { signature, amount: BigInt(group.totalAmount.toString()), recipient };
      } catch (error) {
        throw new Error(describeAnchorError(error));
      }
    },
    [requireProgram],
  );

  const cancelGroup = useCallback(
    async (groupPda: PublicKey, memberPdas: PublicKey[]): Promise<CancelResult> => {
      const { program: p, publicKey: owner } = requireProgram();
      const mint = requireTestTokenMint();
      const group = await p.account.group(groupPda);
      if (!group) throw new Error('On-chain аккаунт группы не найден');
      const escrowAddress = getEscrowAddress(groupPda, mint);
      const refunded = group.paidAmounts.reduce<bigint>(
        (sum, value) => sum + BigInt(value.toString()),
        0n,
      );

      try {
        const signature = await p.methods
          .cancelGroup()
          .accounts({
            owner,
            group: groupPda,
            escrowTokenAccount: escrowAddress,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .remainingAccounts(
            memberPdas.map((address) => ({ pubkey: address, isSigner: false, isWritable: true })),
          )
          .rpc({ commitment: 'confirmed' });

        return { signature, refunded };
      } catch (error) {
        throw new Error(describeAnchorError(error));
      }
    },
    [requireProgram],
  );

  const fetchGroup = useCallback(
    (groupPda: PublicKey) => (program ? program.account.group(groupPda) : Promise.resolve(null)),
    [program],
  );

  const fetchMember = useCallback(
    async (groupPda: PublicKey, wallet: PublicKey) => {
      if (!program) return null;
      const [memberPda] = deriveMemberPDA(groupPda, wallet);
      return program.account.member(memberPda);
    },
    [program],
  );

  const subscribeToGroupEvents = useCallback(
    (groupPda: PublicKey, callback: (event: { group: string; payer: string; amount: string; paidCount: number }) => void) => {
      if (!program) return () => undefined;
      const target = groupPda.toString();
      return program.onSharePaid((event) => {
        if (event.group === target) callback(event);
      });
    },
    [program],
  );

  const unavailableReason = useMemo(() => {
    if (!isProgramConfigured()) {
      return 'Программа не задеплоена: задайте NEXT_PUBLIC_PROGRAM_ID в .env.local (anchor deploy).';
    }
    if (!anchorWallet) return 'Подключите кошелёк, чтобы работать с блокчейном.';
    return null;
  }, [anchorWallet]);

  return {
    program,
    publicKey,
    isReady: program !== null && publicKey !== null,
    unavailableReason,
    createGroup,
    joinGroup,
    payShare,
    settleGroup,
    cancelGroup,
    fetchGroup,
    fetchMember,
    subscribeToGroupEvents,
  };
}
