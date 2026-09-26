'use client';

import { Check, Clock3, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';
import type { MemberStatus } from '@/lib/types/database';

const CONFIG: Record<
  MemberStatus,
  { label: string; icon: typeof Check; className: string; dot: string }
> = {
  paid: {
    label: 'Оплачено',
    icon: Check,
    className: 'text-success',
    dot: 'bg-success',
  },
  pending: {
    label: 'Ожидает',
    icon: Clock3,
    className: 'text-warning',
    dot: 'bg-warning',
  },
  cancelled: {
    label: 'Отменён',
    icon: XCircle,
    className: 'text-error',
    dot: 'bg-error',
  },
};

export interface PaymentStatusProps {
  status: MemberStatus;
  /** Подсветить анимацией при только что произошедшей оплате. */
  justPaid?: boolean;
  className?: string;
}

/** Статус оплаты участника. */
export function PaymentStatus({ status, justPaid = false, className }: PaymentStatusProps) {
  const config = CONFIG[status] ?? CONFIG.pending;
  const Icon = config.icon;

  return (
    <motion.span
      initial={justPaid ? { scale: 0.7, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 18 }}
      className={cn('inline-flex items-center gap-1.5 text-xs font-medium', config.className, className)}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </motion.span>
  );
}

export { CONFIG as PAYMENT_STATUS_CONFIG };
export default PaymentStatus;
