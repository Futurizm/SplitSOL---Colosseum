'use client';

import { useMemo } from 'react';
import { CategoryBreakdown, type CategorySlice } from '@/components/analytics/CategoryBreakdown';
import { SpendingChart, type SpendingPoint } from '@/components/analytics/SpendingChart';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { useGroups } from '@/lib/hooks/useGroup';
import { getTestTokenDecimals, getTestTokenSymbol } from '@/lib/solana/constants';
import { fromMicroUnits } from '@/lib/utils/format';
import type { GroupCategory } from '@/lib/types/database';

export function AnalyticsView() {
  const { isConfigured } = useSupabase();
  const { groups, isLoading } = useGroups();
  const decimals = getTestTokenDecimals();
  const symbol = getTestTokenSymbol();

  const spendingByDay = useMemo<SpendingPoint[]>(() => {
    const buckets = new Map<string, bigint>();

    for (const group of groups) {
      for (const member of group.members ?? []) {
        if (member.status !== 'paid') continue;
        const day = (member.paid_at ?? member.joined_at).slice(0, 10);
        buckets.set(day, (buckets.get(day) ?? 0n) + BigInt(member.share_amount || '0'));
      }
    }

    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, micro]) => ({ date, micro: micro.toString() }));
  }, [groups]);

  const byCategory = useMemo<CategorySlice[]>(() => {
    const buckets = new Map<GroupCategory, { micro: bigint; count: number }>();

    for (const group of groups) {
      for (const member of group.members ?? []) {
        if (member.status !== 'paid') continue;
        const current = buckets.get(group.category) ?? { micro: 0n, count: 0 };
        current.micro += BigInt(member.share_amount || '0');
        current.count += 1;
        buckets.set(group.category, current);
      }
    }

    return [...buckets.entries()].map(([category, value]) => ({
      category,
      micro: value.micro.toString(),
      count: value.count,
    }));
  }, [groups]);

  const totalPaid = useMemo(
    () =>
      groups.reduce(
        (sum, group) =>
          sum +
          (group.members ?? [])
            .filter((member) => member.status === 'paid')
            .reduce<bigint>((inner, member) => inner + BigInt(member.share_amount || '0'), 0n),
        0n,
      ),
    [groups],
  );

  const paidCount = useMemo(
    () =>
      groups.reduce(
        (sum, group) => sum + (group.members ?? []).filter((m) => m.status === 'paid').length,
        0,
      ),
    [groups],
  );

  if (!isConfigured) {
    return (
      <Card className="border-warning/30 bg-warning/[0.06]">
        <CardContent className="p-4 text-sm text-warning">
          База не настроена — аналитика появится после подключения Supabase.
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Всего оплачено</p>
            <p className="tabular font-display text-2xl font-bold text-solana-green">
              {fromMicroUnits(totalPaid.toString(), decimals).toFixed(2)} {symbol}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Платежей</p>
            <p className="tabular font-display text-2xl font-bold">{paidCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Средний чек</p>
            <p className="tabular font-display text-2xl font-bold">
              {paidCount > 0
                ? fromMicroUnits(
                    (totalPaid / BigInt(paidCount)).toString(),
                    decimals,
                  ).toFixed(2)
                : '0.00'}{' '}
              {symbol}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SpendingChart data={spendingByDay} currency={symbol} />
        <CategoryBreakdown data={byCategory} currency={symbol} />
      </div>
    </div>
  );
}

export default AnalyticsView;
