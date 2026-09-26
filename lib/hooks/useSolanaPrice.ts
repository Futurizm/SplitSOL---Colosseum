'use client';

import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface SolPrice {
  /** Курс SOL → USD. */
  solUsd: number | null;
  /** Базовый курс tUSDC → USD, всегда 1 (tUSDC — тестовый аналог доллара). */
  tusdcUsd: number;
  change24h: number | null;
  updatedAt: number | null;
  source: 'coingecko' | 'fallback' | 'none';
}

const FALLBACK_SOL_PRICE = 145;
const REFRESH_MS = 60_000;

/**
 * Курс SOL для конвертации сумм в привычные единицы.
 *
 * Данные приходят с нашего же API-роута `/api/solana/price` (там же есть
 * кэш и rate limit). При недоступности используется безопасное значение по
 * умолчанию — суммы в tUSDC от него не зависят.
 */
export function useSolanaPrice(): SolPrice & { refresh: () => void } {
  const [price, setPrice] = useState<SolPrice>({
    solUsd: null,
    tusdcUsd: 1,
    change24h: null,
    updatedAt: null,
    source: 'none',
  });
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await axios.get<{ price: number | null; change24h: number | null }>(
        '/api/solana/price',
        { signal: controller.signal, timeout: 8000 },
      );
      const solUsd =
        typeof response.data?.price === 'number' && response.data.price > 0
          ? response.data.price
          : FALLBACK_SOL_PRICE;

      setPrice({
        solUsd,
        tusdcUsd: 1,
        change24h: response.data?.change24h ?? null,
        updatedAt: Date.now(),
        source: typeof response.data?.price === 'number' ? 'coingecko' : 'fallback',
      });
    } catch (error) {
      if ((error as Error).name === 'CanceledError') return;
      setPrice((prev) => ({
        ...prev,
        solUsd: prev.solUsd ?? FALLBACK_SOL_PRICE,
        updatedAt: Date.now(),
        source: 'fallback',
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      window.clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [refresh]);

  return { ...price, refresh: () => void refresh() };
}

/** Конвертация суммы в tUSDC → USD (1:1 для тестового токена). */
export function toUsd(amount: number, price: SolPrice): number {
  void price;
  return amount;
}
