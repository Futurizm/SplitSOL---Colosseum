import { NextResponse } from 'next/server';
import { assertDevnetOnly, getRpcEndpoint } from '@/lib/solana/constants';
import type { RateLimitResult } from './rateLimit';

/** Стандартный ответ с ошибкой. */
export function apiError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error: message, ...extra }, { status });
}

/**
 * Любой серверный обработчик Solana обязан проверить, что мы не уехали в
 * mainnet. Это страховка от опечатки в NEXT_PUBLIC_SOLANA_RPC_URL.
 */
export function guardDevnet() {
  try {
    assertDevnetOnly(getRpcEndpoint());
    return null;
  } catch (error) {
    return apiError((error as Error).message, 400);
  }
}

/** Ключ rate limit: пользователь из сессии, иначе IP. */
export async function requestKey(request: Request): Promise<string> {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? 'local';
  return `ip:${ip}`;
}

export function rateLimitResponse(result: RateLimitResult) {
  return NextResponse.json(
    { success: false, error: 'Слишком много запросов. Подождите немного.' },
    { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } },
  );
}
