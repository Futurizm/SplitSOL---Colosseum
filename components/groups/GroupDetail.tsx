'use client';

import { motion } from 'framer-motion';
import { Copy, QrCode, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { MemberList } from './MemberList';
import { useToast } from '@/components/ui/toast';
import { formatMicro, plural, shortAddress } from '@/lib/utils/format';
import { inviteLink } from '@/lib/utils/invite';
import type { GroupMember, GroupWithMembers } from '@/lib/types/database';

export interface GroupDetailProps {
  group: GroupWithMembers;
  currentWallet?: string | null;
  justPaidMemberId?: string | null;
  onPay?: (member: GroupMember) => void;
  children?: React.ReactNode;
}

export function GroupDetail({
  group,
  currentWallet,
  justPaidMemberId,
  onPay,
  children,
}: GroupDetailProps) {
  const { success } = useToast();
  const [copied, setCopied] = useState(false);

  const members = group.members ?? [];
  const paid = members.filter((member) => member.status === 'paid').length;
  const total = members.length;
  const progress = total > 0 ? (paid / total) * 100 : 0;
  const paidAmount = members
    .filter((member) => member.status === 'paid')
    .reduce<bigint>((sum, member) => sum + BigInt(member.share_amount || '0'), 0n);

  const link = inviteLink(group.invite_code);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      success('Ссылка скопирована', 'Отправьте её участникам — по ней они присоединятся к группе.');
    } catch {
      success('Не удалось скопировать', 'Скопируйте ссылку вручную.');
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-2xl">{group.name}</CardTitle>
                {group.description ? (
                  <CardDescription className="mt-1">{group.description}</CardDescription>
                ) : null}
              </div>
              <Badge variant={group.status === 'settled' ? 'success' : 'default'}>
                {group.status === 'active' ? 'Активна' : group.status === 'settled' ? 'Рассчитана' : 'Отменена'}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Прогресс оплаты</p>
                <p className="font-display text-4xl font-bold">
                  {paid}
                  <span className="text-2xl text-muted-foreground">/{total}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {total} {plural(total, 'участник', 'участника', 'участников')} оплатили
                </p>
              </div>

              <div className="text-right">
                <p className="text-xs text-muted-foreground">Собрано</p>
                <p className="tabular font-mono text-lg text-solana-green">
                  {formatMicro(paidAmount.toString(), group.currency)}
                </p>
                <p className="tabular font-mono text-xs text-muted-foreground">
                  из {formatMicro(group.total_amount, group.currency)}
                </p>
              </div>
            </div>

            <Progress value={progress} aria-label={`Оплачено ${paid} из ${total}`} />

            {paid === total && total > 0 ? (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success"
              >
                Все доли оплачены — можно закрыть группу и отправить средства получателю.
              </motion.p>
            ) : null}

            {group.restaurant_wallet ? (
              <p className="text-xs text-muted-foreground">
                Получатель: <span className="font-mono text-foreground">{shortAddress(group.restaurant_wallet, 6, 6)}</span>
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-solana-green" />
              Участники
            </CardTitle>
            <CardDescription>Статусы обновляются в реальном времени</CardDescription>
          </CardHeader>
          <CardContent>
            <MemberList
              members={members}
              currency={group.currency}
              currentWallet={currentWallet}
              justPaidMemberId={justPaidMemberId}
              onPay={onPay}
            />
          </CardContent>
        </Card>

        {children}
      </div>

      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Приглашение</CardTitle>
            <CardDescription>Ссылка и QR для мобильных</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-border bg-secondary/40 p-3">
              <p className="text-xs text-muted-foreground">Код приглашения</p>
              <p className="font-mono text-2xl font-bold tracking-widest">{group.invite_code}</p>
            </div>

            <p className="break-all rounded-lg bg-background/60 p-2 font-mono text-[11px] text-muted-foreground">
              {link}
            </p>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => void copyLink()}>
                <Copy className="h-4 w-4" />
                {copied ? 'Скопировано' : 'Копировать'}
              </Button>
              <Button asChild variant="ghost" size="icon" aria-label="QR группы">
                <Link href={`/groups/${group.id}/qr`}>
                  <QrCode className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            {group.onchain_group_pda ? (
              <p className="text-[11px] text-muted-foreground">
                on-chain PDA:{' '}
                <span className="font-mono">{shortAddress(group.onchain_group_pda, 6, 6)}</span>
              </p>
            ) : (
              <p className="text-[11px] text-warning">
                Группа создана только в базе — on-chain аккаунт не найден.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default GroupDetail;
