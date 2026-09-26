'use client';

import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { LAMPORTS_PER_SOL } from '@/lib/solana/constants';
import { getTokenBalance } from '@/lib/solana/token';
import { getTestTokenMintOrNull, getTestTokenSymbol, isTestTokenConfigured } from '@/lib/solana/constants';
import { explorerAddressUrl } from '@/lib/utils/format';

/** Баланс SOL и tUSDC кошелька. */
export function WalletBalance() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const [sol, setSol] = useState<number | null>(null);
  const [tokens, setTokens] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!publicKey) return;
    setIsRefreshing(true);
    try {
      const lamports = await connection.getBalance(publicKey, 'confirmed');
      setSol(lamports / LAMPORTS_PER_SOL);

      const mint = getTestTokenMintOrNull();
      if (mint) {
        const balance = await getTokenBalance(connection, publicKey, mint);
        setTokens((Number(balance.amount) / 10 ** (balance.decimals || 6)).toFixed(2));
      }
    } catch {
      setSol(null);
    } finally {
      setIsRefreshing(false);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    void refresh();
    if (!publicKey) return;
    const interval = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(interval);
  }, [refresh, publicKey]);

  if (!publicKey) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Баланс кошелька</p>
        <p className="tabular font-mono text-sm">
          {sol === null ? '…' : `${sol.toFixed(4)} SOL`}
        </p>
      </div>

      {isTestTokenConfigured() ? (
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{getTestTokenSymbol()}</p>
          <p className="tabular font-mono text-sm">{tokens ?? '…'}</p>
        </div>
      ) : null}

      <Button
        variant="ghost"
        size="icon"
        onClick={() => void refresh()}
        disabled={isRefreshing}
        aria-label="Обновить баланс"
      >
        <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
      </Button>

      <a
        href={explorerAddressUrl(publicKey.toBase58())}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        Explorer
      </a>
    </div>
  );
}

export default WalletBalance;
