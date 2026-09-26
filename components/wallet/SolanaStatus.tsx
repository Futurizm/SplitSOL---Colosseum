'use client';

import { useConnection } from '@solana/wallet-adapter-react';
import { Activity, CircleAlert, Radio } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { getTestTokenDecimals, getTestTokenSymbol, isTestTokenConfigured } from '@/lib/solana/constants';

/**
 * Индикатор состояния devnet-кластера: подключён ли RPC и создан ли tUSDC.
 * Показывает проблему сразу, а не в момент попытки оплаты.
 */
export function SolanaStatus() {
  const { connection } = useConnection();
  const [state, setState] = useState<'checking' | 'online' | 'offline'>('checking');
  const [slot, setSlot] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    const check = async () => {
      try {
        const currentSlot = await connection.getSlot();
        if (!active) return;
        setSlot(currentSlot);
        setState('online');
      } catch {
        if (!active) return;
        setState('offline');
      }
    };

    void check();
    const interval = window.setInterval(() => void check(), 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [connection]);

  const isOnline = state === 'online';
  const tokenReady = isTestTokenConfigured();

  const label = !isOnline
    ? 'Devnet RPC недоступен'
    : tokenReady
      ? `Devnet · слот ${slot ?? '…'} · токен ${getTestTokenSymbol()} (${getTestTokenDecimals()} dec)`
      : 'Devnet подключён, но тUSDC ещё не создан';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="hidden items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground sm:inline-flex"
          aria-live="polite"
        >
          {isOnline ? (
            <Radio className="h-3.5 w-3.5 text-success" />
          ) : state === 'checking' ? (
            <Activity className="h-3.5 w-3.5 animate-pulse" />
          ) : (
            <CircleAlert className="h-3.5 w-3.5 text-error" />
          )}
          <span className="font-mono">devnet</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export default SolanaStatus;
