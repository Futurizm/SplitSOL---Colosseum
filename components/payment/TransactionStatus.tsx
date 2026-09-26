'use client';

import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Wallet } from 'lucide-react';
import { motion } from 'framer-motion';
import type { TransactionPhase } from '@/lib/hooks/useTransaction';
import { explorerTxUrl } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

const STEPS: { phase: TransactionPhase; label: string }[] = [
  { phase: 'wallet', label: 'Подпись в кошельке' },
  { phase: 'pending', label: 'Ожидание блока' },
  { phase: 'confirmed', label: 'Подтверждено' },
];

const ORDER: Record<TransactionPhase, number> = {
  idle: -1,
  wallet: 0,
  pending: 1,
  confirmed: 2,
  failed: -1,
};

export interface TransactionStatusProps {
  phase: TransactionPhase;
  signature?: string | null;
  error?: string | null;
  className?: string;
  compact?: boolean;
}

/** Live-статус on-chain транзакции. */
export function TransactionStatus({
  phase,
  signature,
  error,
  className,
  compact = false,
}: TransactionStatusProps) {
  if (phase === 'idle') return null;

  if (phase === 'failed') {
    return (
      <div
        className={cn(
          'flex items-start gap-2 rounded-xl border border-error/30 bg-error/10 p-3 text-sm text-error',
          className,
        )}
        role="alert"
      >
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p className="font-medium">Транзакция не прошла</p>
          {error ? <p className="mt-0.5 break-words text-xs opacity-90">{error}</p> : null}
        </div>
      </div>
    );
  }

  const current = ORDER[phase];

  if (compact) {
    return (
      <span className={cn('inline-flex items-center gap-2 text-sm', className)}>
        {phase === 'confirmed' ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-warning" />
        )}
        {phase === 'confirmed' ? 'Подтверждено' : 'Подтверждаем…'}
      </span>
    );
  }

  return (
    <div className={cn('space-y-3 rounded-xl border border-border bg-secondary/30 p-4', className)}>
      <ol className="space-y-2">
        {STEPS.map((step, index) => {
          const done = current > index;
          const active = current === index;

          return (
            <li key={step.phase} className="flex items-center gap-2.5 text-sm">
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full border text-[10px]',
                  done && 'border-success bg-success/15 text-success',
                  active && 'border-warning bg-warning/15 text-warning',
                  !done && !active && 'border-border text-muted-foreground',
                )}
              >
                {done ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : active ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  index + 1
                )}
              </span>
              <span className={cn(done || active ? 'text-foreground' : 'text-muted-foreground')}>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {signature ? (
        <a
          href={explorerTxUrl(signature)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 break-all font-mono text-xs text-muted-foreground hover:text-foreground"
        >
          {signature.slice(0, 20)}…
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ) : null}
    </div>
  );
}

export interface PaymentCelebrationProps {
  amount: string;
  show: boolean;
}

/** Конфетти-анимация при успешной оплате. */
export function PaymentCelebration({ amount, show }: PaymentCelebrationProps) {
  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      className="flex flex-col items-center gap-2 rounded-2xl border border-success/30 bg-success/10 p-6 text-center"
    >
      <motion.div
        initial={{ rotate: -12, scale: 0.7 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 14 }}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-success/20"
      >
        <CheckCircle2 className="h-7 w-7 text-success" />
      </motion.div>
      <p className="font-display text-lg font-semibold">Оплачено {amount}</p>
      <p className="text-xs text-muted-foreground">
        <Wallet className="mr-1 inline h-3 w-3" />
        Статус обновился у всех участников группы
      </p>
    </motion.div>
  );
}

export default TransactionStatus;
