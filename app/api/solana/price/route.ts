import { NextResponse } from 'next/server';
import axios from 'axios';
import { apiError, guardDevnet, rateLimitResponse, requestKey } from '@/lib/api/http';
import { rateLimit } from '@/lib/api/rateLimit';

export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 60_000;
const FALLBACK_PRICE = 145;

let cached: { price: number; change24h: number | null; fetchedAt: number } | null = null;
let inFlight: Promise<{ price: number; change24h: number | null }> | null = null;

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price';
const COINGECKO_PARAMS = { ids: 'solana', vs_currencies: 'usd', include_24hr_change: 'true' };

/**
 * GET /api/solana/price — курс SOL/USD.
 *
 * Нужен только для перевода сумм в привычные единицы: сами платежи всегда в
 * tUSDC. Поэтому при недоступности CoinGecko возвращаем кэшированное значение
 * (или безопасную константу), а не ошибку.
 */
export async function GET(request: Request) {
  const devnetError = guardDevnet();
  if (devnetError) return devnetError;

  const limit = rateLimit(`${await requestKey(request)}:price`, { limit: 60, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);

  const now = Date.now();
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({
      success: true,
      price: cached.price,
      change24h: cached.change24h,
      source: 'cache',
      updatedAt: cached.fetchedAt,
    });
  }

  if (!inFlight) {
    inFlight = axios
      .get<{ solana?: { usd?: number; usd_24h_change?: number } }>(COINGECKO_URL, {
        params: COINGECKO_PARAMS,
        timeout: 5000,
      })
      .then((response) => {
        const price = response.data?.solana?.usd ?? FALLBACK_PRICE;
        const change24h = response.data?.solana?.usd_24h_change ?? null;
        cached = { price, change24h, fetchedAt: Date.now() };
        return { price, change24h };
      })
      .catch(() => {
        const price = cached?.price ?? FALLBACK_PRICE;
        const change24h = cached?.change24h ?? null;
        cached = { price, change24h, fetchedAt: Date.now() };
        return { price, change24h };
      })
      .finally(() => {
        inFlight = null;
      });
  }

  const { price, change24h } = await inFlight;

  if (price <= 0) return apiError('Не удалось получить курс SOL', 502);

  return NextResponse.json({
    success: true,
    price,
    change24h,
    source: 'coingecko',
    updatedAt: cached?.fetchedAt ?? Date.now(),
  });
}
