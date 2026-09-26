'use client';

import { ArrowRight, Wallet } from 'lucide-react';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatMicro } from '@/lib/utils/format';

export interface ConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amountMicro: bigint | string;
  currency: string;
  /** Адрес эскроу — именно туда уходят деньги. */
  escrowAddress: string;
  recipientLabel?: string;
  onConfirm: () => void | Promise<void>;
  isBusy?: boolean;
}

/**
 * Подтверждение оплаты. Показывает адрес эскроу, чтобы пользователь видел,
 * что деньги уходят не «куда-то», а в смарт-контракт группы.
 */
export function ConfirmationModal({
  open,
  onOpenChange,
  amountMicro,
  currency,
  escrowAddress,
  recipientLabel,
  onConfirm,
  isBusy = false,
}: ConfirmationModalProps) {
  const [armed, setArmed] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Подтвердите оплату</AlertDialogTitle>
          <AlertDialogDescription>
            Средства уйдут в эскроу-аккаунт группы. Пока все участники не оплатили свои доли,
            никто не сможет их забрать — это гарантия, что деньги дойдут до получателя.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 rounded-xl border border-border bg-secondary/40 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Сумма</span>
            <span className="tabular font-display text-2xl font-bold">
              {formatMicro(amountMicro, currency, 6, 6)}
            </span>
          </div>

          {recipientLabel ? (
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Группа</span>
              <span className="truncate font-medium">{recipientLabel}</span>
            </div>
          ) : null}

          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Эскроу on-chain</span>
            <p className="break-all rounded-lg bg-background/60 p-2 font-mono text-[11px]">
              <Wallet className="mr-1.5 inline h-3 w-3" />
              {escrowAddress}
            </p>
          </div>
        </div>

        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={armed}
            onChange={(event) => setArmed(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border accent-solana-green"
          />
          Я проверил сумму и адрес эскроу
        </label>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isBusy}>Отмена</AlertDialogCancel>
          <AlertDialogAction
            disabled={!armed || isBusy}
            onClick={(event) => {
              event.preventDefault();
              void onConfirm();
            }}
          >
            {isBusy ? 'Обработка…' : 'Оплатить'}
            {!isBusy ? <ArrowRight className="h-4 w-4" /> : null}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ConfirmationModal;
