'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { QrCode, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ConfirmationModal } from './ConfirmationModal';
import { PaymentCelebration, TransactionStatus } from './TransactionStatus';
import { useAnchorProgram } from '@/lib/hooks/useAnchorProgram';
import { useTransaction } from '@/lib/hooks/useTransaction';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { formatMicro, fromMicroUnits } from '@/lib/utils/format';
import { getTestTokenDecimals } from '@/lib/solana/constants';
import type { Supabase } from '@/lib/supabase/types';

export interface PayButtonProps {
  groupId: string;
  groupPda: string;
  groupName: string;
  escrowAddress: string;
  memberId: string;
  /** Доля участника в micro-единицах. */
  shareMicro: bigint | string;
  currency: string;
  disabled?: boolean;
  /** Ссылка на страницу QR для этого участника. */
  qrHref?: string;
  onPaid?: () => void | Promise<void>;
}

/**
 * Кнопка оплаты доли.
 *
 * Основной путь — Anchor-инструкция `pay_share`: точная сумма, атомарно,
 * статус фиксируется в смарт-контракте. QR (Solana Pay) — альтернатива для
 * мобильных, там верификация идёт через /api/transactions/verify.
 */
export function PayButton({
  groupId,
  groupPda,
  groupName,
  escrowAddress,
  memberId,
  shareMicro,
  currency,
  disabled = false,
  qrHref,
  onPaid,
}: PayButtonProps) {
  const { publicKey } = useWallet();
  const { supabase } = useSupabase();
  const { payShare, isReady, unavailableReason } = useAnchorProgram();
  const { success, error: showError } = useToast();
  const [isConfirming, setIsConfirming] = useState(false);

  const tx = useTransaction(
    async () => {
      success('Оплата подтверждена', `${formatMicro(shareMicro, currency)} ушли в эскроу группы.`);
      await onPaid?.();
    },
    (message) => showError('Оплата не прошла', message),
  );

  const humanAmount = fromMicroUnits(shareMicro.toString(), getTestTokenDecimals());
  const isDisabled = disabled || !publicKey || !isReady || tx.isBusy;

  const handlePay = async () => {
    setIsConfirming(false);

    await tx.run(async () => {
      const result = await payShare(new PublicKey(groupPda));
      // on-chain оплата прошла — фиксируем статус в БД.
      // Ошибка записи не должна ломать UX: статус догонит при синхронизации.
      await markMemberPaid(supabase, memberId, result.signature);
      return result;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => setIsConfirming(true)}
          disabled={isDisabled}
          loading={tx.isBusy}
          size="lg"
          className="flex-1"
        >
          <Wallet className="h-4 w-4" />
          Оплатить {formatMicro(shareMicro, currency)}
        </Button>

        {qrHref ? (
          <Button asChild variant="outline" size="lg">
            <Link href={`${qrHref}?member=${memberId}`}>
              <QrCode className="h-4 w-4" />
              QR
            </Link>
          </Button>
        ) : null}
      </div>

      {unavailableReason && !publicKey ? (
        <p className="text-xs text-warning">{unavailableReason}</p>
      ) : null}

      {tx.phase !== 'idle' ? (
        <TransactionStatus phase={tx.phase} signature={tx.signature} error={tx.error} />
      ) : null}

      {tx.phase === 'confirmed' ? (
        <PaymentCelebration show amount={`${humanAmount.toFixed(2)} ${currency}`} />
      ) : null}

      <p className="text-[11px] text-muted-foreground">
        Группа <span className="font-medium text-foreground">{groupName}</span> · on-chain PDA{' '}
        <span className="font-mono">{groupPda.slice(0, 6)}…</span> · id {groupId.slice(0, 8)}…
      </p>

      <ConfirmationModal
        open={isConfirming}
        onOpenChange={setIsConfirming}
        amountMicro={shareMicro}
        currency={currency}
        escrowAddress={escrowAddress}
        recipientLabel={groupName}
        onConfirm={handlePay}
        isBusy={tx.isBusy}
      />
    </div>
  );
}

/** Проставляет статус «оплачено» в БД после подтверждения транзакции. */
async function markMemberPaid(
  supabase: Supabase | null,
  memberId: string,
  signature: string,
): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from('group_members')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      tx_signature: signature,
    })
    .eq('id', memberId);

  if (error) {
    console.error('Не удалось обновить статус участника в БД:', error.message);
  }
}

export default PayButton;
