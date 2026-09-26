'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CATEGORY_META } from '@/components/groups/GroupCard';
import { fromMicroUnits } from '@/lib/utils/format';
import { getTestTokenDecimals } from '@/lib/solana/constants';
import type { GroupCategory } from '@/lib/types/database';

const COLORS: Record<GroupCategory, string> = {
  restaurant: '#9945FF',
  travel: '#14F195',
  shopping: '#FFB800',
  other: '#4A4A5E',
};

export interface CategorySlice {
  category: GroupCategory;
  micro: string;
  count?: number;
}

/** Разбивка трат по категориям. */
export function CategoryBreakdown({ data, currency = 'tUSDC' }: { data: CategorySlice[]; currency?: string }) {
  const decimals = getTestTokenDecimals();

  const chartData = useMemo(
    () =>
      data.map((slice) => ({
        name: CATEGORY_META[slice.category]?.label ?? slice.category,
        value: Number(fromMicroUnits(slice.micro, decimals).toFixed(4)),
        color: COLORS[slice.category],
        count: slice.count ?? 0,
      })),
    [data, decimals],
  );

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>По категориям</CardTitle>
        <CardDescription>Куда уходят деньги · всего {total.toFixed(2)} {currency}</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="flex h-56 items-center justify-center text-sm text-muted-foreground">
            Пока нет данных
          </p>
        ) : (
          <>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: '#1C1C28',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(value: number, name: string) => [
                      `${value.toFixed(2)} ${currency}`,
                      name,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <ul className="mt-4 space-y-2">
              {chartData.map((entry) => (
                <li key={entry.name} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="flex-1 text-muted-foreground">{entry.name}</span>
                  <span className="tabular font-mono">
                    {entry.value.toFixed(2)} {currency}
                  </span>
                  <span className="tabular w-12 text-right text-xs text-muted-foreground">
                    {total > 0 ? ((entry.value / total) * 100).toFixed(0) : 0}%
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export { COLORS as CATEGORY_COLORS };
export default CategoryBreakdown;
