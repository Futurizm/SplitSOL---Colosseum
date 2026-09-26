'use client';

import { ArrowUpRight, CircleDollarSign, Clock3, Users } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { GroupCard } from '@/components/groups/GroupCard';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GroupCardSkeleton, StatCardSkeleton } from '@/components/ui/skeleton';
import { useGroups } from '@/lib/hooks/useGroup';
import { useSolanaPrice } from '@/lib/hooks/useSolanaPrice';
import { getTestTokenDecimals } from '@/lib/solana/constants';
import { fromMicroUnits } from '@/lib/utils/format';

export function DashboardClient() {
  const { user, isConfigured: supabaseReady } = useSupabase();
  const { publicKey } = useWallet();
  const { groups, isLoading } = useGroups('active');
  const price = useSolanaPrice();

  const [paidTotal, setPaidTotal] = useState<bigint>(0n);
  const [debtTotal, setDebtTotal] = useState<bigint>(0n);
  const [myGroupsCount, setMyGroupsCount] = useState(0);

  // Сводные суммы считаются из уже загруженных групп — без лишнего запроса.
  useEffect(() => {
    let paid = 0n;
    let debt = 0n;
    let mine = 0;

    for (const group of groups) {
      for (const member of group.members ?? []) {
        const isMe =
          (publicKey !== null && member.guest_wallet === publicKey.toBase58()) ||
          (Boolean(user) && member.user_id === user?.id);

        if (member.status === 'paid') paid += BigInt(member.share_amount || '0');
        if (isMe && member.status === 'pending') debt += BigInt(member.share_amount || '0');
        if (isMe) mine += 1;
      }
    }

    setPaidTotal(paid);
    setDebtTotal(debt);
    setMyGroupsCount(mine);
  }, [groups, publicKey, user]);

  const decimals = getTestTokenDecimals();
  const totalBilled = groups.reduce((sum, group) => sum + BigInt(group.total_amount || '0'), 0n);

  const stats = useCallback(
    () => [
      { icon: Users, label: 'Активных групп', value: String(groups.length), hint: `вы участвуете в ${myGroupsCount}` },
      {
        icon: CircleDollarSign,
        label: 'Оплачено',
        value: `${fromMicroUnits(paidTotal.toString(), decimals).toFixed(2)} tUSDC`,
        hint: 'подтверждено on-chain',
        accent: true,
      },
      {
        icon: Clock3,
        label: 'Осталось заплатить',
        value: `${fromMicroUnits(debtTotal.toString(), decimals).toFixed(2)} tUSDC`,
        hint: debtTotal > 0n ? 'проверьте списки' : 'всё оплачено',
      },
      {
        icon: ArrowUpRight,
        label: 'Сумма активных счетов',
        value: `$${fromMicroUnits(totalBilled.toString(), decimals).toFixed(2)}`,
        hint: price.solUsd ? `SOL $${price.solUsd.toFixed(2)}` : 'курс SOL недоступен',
      },
    ],
    [groups.length, myGroupsCount, paidTotal, debtTotal, totalBilled, decimals, price.solUsd],
  );

  return (
    <div className="space-y-6">
      {!supabaseReady ? (
        <Card className="border-warning/30 bg-warning/[0.06]">
          <CardContent className="p-4 text-sm text-warning">
            База данных не настроена. Заполните <code className="font-mono">.env.local</code>{' '}
            (SETUP.md, шаг 2) — и группы появятся здесь.
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          stats().map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Активные группы</h2>
          <Button asChild variant="outline" size="sm">
            <Link href="/groups">Все группы</Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <GroupCardSkeleton />
            <GroupCardSkeleton />
            <GroupCardSkeleton />
          </div>
        ) : groups.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {groups.map((group) => (
              <GroupCard key={group.id} group={group} />
            ))}
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Пока нет активных групп</CardTitle>
              <CardDescription>
                Создайте первую группу, добавьте участников и отправьте им ссылку-приглашение.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/groups/new">Создать группу</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

interface StatCardProps {
  icon: typeof Users;
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}

function StatCard({ icon: Icon, label, value, hint, accent = false }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <p
          className={`tabular mt-2 font-display text-2xl font-bold ${accent ? 'text-solana-green' : ''}`}
        >
          {value}
        </p>
        {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export default DashboardClient;
