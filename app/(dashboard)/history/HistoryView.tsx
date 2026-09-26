'use client';

import { Download, ExternalLink, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { explorerTxUrl, formatDateTime, formatMicro, shortAddress } from '@/lib/utils/format';
import { getTestTokenDecimals } from '@/lib/solana/constants';
import { getTestTokenSymbol } from '@/lib/solana/constants';
import { fromMicroUnits } from '@/lib/utils/format';
import type { Transaction } from '@/lib/types/database';

const STATUS_VARIANT = {
  confirmed: 'success',
  pending: 'warning',
  failed: 'destructive',
} as const;

/** История платежей пользователя + экспорт в CSV. */
export function HistoryView() {
  const { supabase, user, isConfigured } = useSupabase();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !user) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    // Сначала собираем свои участия, затем транзакции по этим группам.
    const { data: members, error: memberError } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id);

    if (memberError) {
      setError(memberError.message);
      setIsLoading(false);
      return;
    }

    const groupIds = [...new Set((members ?? []).map((m) => m.group_id))];
    if (groupIds.length === 0) {
      setTransactions([]);
      setIsLoading(false);
      return;
    }

    const { data, error: queryError } = await supabase
      .from('transactions')
      .select('*')
      .in('group_id', groupIds)
      .order('created_at', { ascending: false })
      .limit(200);

    if (queryError) {
      setError(queryError.message);
    } else {
      setTransactions((data ?? []) as Transaction[]);
    }
    setIsLoading(false);
  }, [supabase, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = () => {
    const header = 'date,group_id,amount,currency,from,to,signature,status';
    const rows = transactions.map((tx) =>
      [
        tx.created_at,
        tx.group_id,
        tx.amount,
        tx.currency,
        tx.from_wallet,
        tx.to_wallet,
        tx.tx_signature ?? '',
        tx.status,
      ].join(','),
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `splitsol-history-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!isConfigured) {
    return (
      <Card className="border-warning/30 bg-warning/[0.06]">
        <CardContent className="p-4 text-sm text-warning">
          База не настроена — история появится после подключения Supabase.
        </CardContent>
      </Card>
    );
  }

  const decimals = getTestTokenDecimals();
  const symbol = getTestTokenSymbol();
  const totalPaid = transactions
    .filter((tx) => tx.status === 'confirmed')
    .reduce<bigint>((sum, tx) => sum + BigInt(tx.amount || '0'), 0n);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Всего операций</p>
              <p className="tabular font-display text-2xl font-bold">{transactions.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Подтверждено на сумму</p>
              <p className="tabular font-display text-2xl font-bold text-solana-green">
                {fromMicroUnits(totalPaid.toString(), decimals).toFixed(2)} {symbol}
              </p>
            </CardContent>
          </Card>
        </div>

        <Button variant="outline" onClick={exportCsv} disabled={transactions.length === 0}>
          <Download className="h-4 w-4" />
          Экспорт CSV
        </Button>
      </div>

      {error ? (
        <Card className="border-error/30 bg-error/[0.06]">
          <CardContent className="p-4 text-sm text-error">{error}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Транзакции</CardTitle>
          <CardDescription>Каждая запись подтверждена on-chain и доступна в Explorer</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : transactions.length > 0 ? (
            <ul className="space-y-2">
              {transactions.map((tx) => (
                <li
                  key={tx.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-card/50 p-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="tabular font-mono">
                      {formatMicro(tx.amount, tx.currency, decimals, 6)} {symbol}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(tx.created_at)} · {shortAddress(tx.from_wallet)} →{' '}
                      {shortAddress(tx.to_wallet)}
                    </p>
                  </div>

                  <Badge variant={STATUS_VARIANT[tx.status]}>{tx.status}</Badge>

                  {tx.tx_signature ? (
                    <a
                      href={explorerTxUrl(tx.tx_signature)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                    >
                      {tx.tx_signature.slice(0, 10)}…
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}

                  {tx.status === 'pending' ? <Loader2 className="h-3.5 w-3.5 animate-spin text-warning" /> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Транзакций пока нет. Они появятся здесь после первой оплаты.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default HistoryView;
