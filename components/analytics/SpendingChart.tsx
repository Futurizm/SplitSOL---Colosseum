'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fromMicroUnits } from '@/lib/utils/format';
import { getTestTokenDecimals } from '@/lib/solana/constants';

export interface SpendingPoint {
  /** ISO-дата (YYYY-MM-DD) */
  date: string;
  /** Сумма в micro-единицах */
  micro: string;
  label?: string;
}

/** График трат по времени (Recharts). */
export function SpendingChart({ data, currency = 'tUSDC' }: { data: SpendingPoint[]; currency?: string }) {
  const decimals = getTestTokenDecimals();

  const chartData = useMemo(
    () =>
      data.map((point) => ({
        date: point.label ?? point.date.slice(5),
        fullDate: point.date,
        amount: Number(fromMicroUnits(point.micro, decimals).toFixed(4)),
      })),
    [data, decimals],
  );

  const total = chartData.reduce((sum, point) => sum + point.amount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Динамика трат</CardTitle>
        <CardDescription>
          Оплаченные доли по дням · всего {total.toFixed(2)} {currency}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Пока нет оплаченных счетов
          </p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="spendingBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#9945FF" />
                    <stop offset="100%" stopColor="#14F195" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#8B8B9E', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#8B8B9E', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={{
                    background: '#1C1C28',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [`${value.toFixed(2)} ${currency}`, 'Сумма']}
                />
                <Bar dataKey="amount" fill="url(#spendingBar)" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SpendingChart;
