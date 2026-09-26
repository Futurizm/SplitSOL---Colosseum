'use client';

import { motion } from 'framer-motion';
import { ExternalLink, Wallet } from 'lucide-react';
import type { GroupMember } from '@/lib/types/database';
import { Avatar, AvatarFallback, AvatarImage, initials } from '@/components/ui/avatar';
import { PaymentStatus } from './PaymentStatus';
import { explorerTxUrl, formatMicro, shortAddress } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

export interface MemberListProps {
  members: GroupMember[];
  currency: string;
  /** Кошелёк текущего пользователя — подсвечиваем его строку. */
  currentWallet?: string | null;
  /** id участника, который только что оплатил. */
  justPaidMemberId?: string | null;
  onPay?: (member: GroupMember) => void;
  emptyHint?: string;
}

/** Список участников с live-статусами оплаты. */
export function MemberList({
  members,
  currency,
  currentWallet,
  justPaidMemberId,
  onPay,
  emptyHint = 'Участники появятся, как только группа будет создана.',
}: MemberListProps) {
  if (members.length === 0) {
    return <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{emptyHint}</p>;
  }

  return (
    <ul className="space-y-2">
      {members.map((member, index) => {
        const isMe =
          currentWallet != null &&
          (member.guest_wallet === currentWallet ||
            (member.user_id != null && currentWallet === member.guest_wallet));
        const isJustPaid = member.id === justPaidMemberId;
        const label = member.guest_name ?? 'Участник';

        return (
          <motion.li
            key={member.id}
            layout
            initial={isJustPaid ? { backgroundColor: 'rgba(20, 241, 149, 0.12)' } : false}
            animate={{ backgroundColor: 'rgba(20, 241, 149, 0)' }}
            transition={{ duration: 1.6 }}
            className={cn(
              'flex items-center gap-3 rounded-xl border border-border bg-card/50 p-3 transition-colors',
              isMe && 'border-solana-purple/40',
            )}
          >
            <span className="w-5 shrink-0 text-center font-mono text-xs text-muted-foreground">
              {index + 1}
            </span>

            <Avatar className="h-9 w-9">
              {member.user_id ? <AvatarImage /> : null}
              <AvatarFallback>{initials(label)}</AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{label}</p>
                {member.role === 'owner' ? (
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    создатель
                  </span>
                ) : null}
                {isMe ? (
                  <span className="rounded bg-solana-purple/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-solana-purple">
                    вы
                  </span>
                ) : null}
              </div>
              {member.guest_wallet ? (
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  <Wallet className="mr-1 inline h-3 w-3" />
                  {shortAddress(member.guest_wallet)}
                </p>
              ) : null}
            </div>

            <div className="shrink-0 text-right">
              <p className="tabular font-mono text-sm">{formatMicro(member.share_amount, currency)}</p>
              <p className="text-[11px] text-muted-foreground">
                {Number(member.share_percentage || 0).toFixed(1)}%
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1">
              <PaymentStatus status={member.status} justPaid={isJustPaid} />
              {member.tx_signature ? (
                <a
                  href={explorerTxUrl(member.tx_signature)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  tx <ExternalLink className="h-2.5 w-2.5" />
                </a>
              ) : null}
            </div>

            {onPay && member.status === 'pending' ? (
              <button
                type="button"
                onClick={() => onPay(member)}
                className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-solana-green/50 hover:text-solana-green"
              >
                Оплатить
              </button>
            ) : null}
          </motion.li>
        );
      })}
    </ul>
  );
}

export default MemberList;
