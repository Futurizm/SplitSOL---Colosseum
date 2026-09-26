import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { getConnection } from '@/lib/solana/connection';
import { airdropSol, hasMintAuthority, mintTestTokens } from '@/lib/solana/airdrop';
import { isValidSolanaAddress } from '@/lib/utils/validation';
import { apiError, guardDevnet, rateLimitResponse, requestKey } from '@/lib/api/http';
import { rateLimit } from '@/lib/api/rateLimit';

export const dynamic = 'force-dynamic';

const MAX_SOL_PER_REQUEST = 2;

interface AirdropBody {
  recipient?: string;
  amount?: number;
  sol?: number;
}

async function parseBody(request: Request): Promise<AirdropBody | null> {
  try {
    return (await request.json()) as AirdropBody;
  } catch {
    return null;
  }
}

/**
 * Devnet-фасадка: раздача бесплатных tUSDC и SOL.
 *
 * tUSDC минтит серверный клюpair с mint authority. Приватные ключи кошельков
 * пользователей приложению не известны и не нужны — плательщик всегда подписывает
 * транзакцию сам.
 */
export async function POST(request: Request) {
  const devnetError = guardDevnet();
  if (devnetError) return devnetError;

  if (!hasMintAuthority()) {
    return apiError(
      'DEVNET_MINT_AUTHORITY_SECRET не задан на сервере — раздача токенов недоступна (SETUP.md, шаг 5).',
      503,
    );
  }

  const limit = rateLimit(await requestKey(request), { limit: 5, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);

  const body = await parseBody(request);
  if (!body?.recipient || !isValidSolanaAddress(body.recipient)) {
    return apiError('Некорректный адрес получателя', 400);
  }

  const amount = Math.min(Math.max(Math.floor(body.amount ?? 100), 1), 10_000);

  try {
    const result = await mintTestTokens(getConnection(), new PublicKey(body.recipient), amount);
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Не удалось минтить токены', 500);
  }
}

/** PUT — airdrop SOL для комиссий. */
export async function PUT(request: Request) {
  const devnetError = guardDevnet();
  if (devnetError) return devnetError;

  const limit = rateLimit(`sol:${await requestKey(request)}`, { limit: 3, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);

  const body = await parseBody(request);
  if (!body?.recipient || !isValidSolanaAddress(body.recipient)) {
    return apiError('Некорректный адрес получателя', 400);
  }

  const sol = Math.min(Math.max(Number(body.sol ?? 1), 0.1), MAX_SOL_PER_REQUEST);

  try {
    const result = await airdropSol(getConnection(), new PublicKey(body.recipient), sol);
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Airdrop недоступен', 500);
  }
}
