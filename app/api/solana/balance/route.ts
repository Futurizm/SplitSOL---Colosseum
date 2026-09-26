import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServerUser } from '@/lib/utils/api-auth';
import { apiError, guardDevnet, rateLimitResponse, requestKey } from '@/lib/api/http';
import { rateLimit } from '@/lib/api/rateLimit';
import { getConnection } from '@/lib/solana/connection';
import { getTestTokenSymbol, requireTestTokenMint } from '@/lib/solana/constants';
import { fromMicroUnits, getTestTokenDecimalsSafe } from '@/lib/utils/format';
import { getTokenBalance } from '@/lib/solana/token';

export const dynamic = 'force-dynamic';

/**
 * GET /api/solana/balance?address=…&mint=…
 *
 * Балансы SOL и tUSDC. Нужен для экранов, где нет доступа к кошельку
 * (например, профиль другого участника).
 */
export async function GET(request: Request) {
  const devnetError = guardDevnet();
  if (devnetError) return devnetError;

  const url = new URL(request.url);
  const address = url.searchParams.get('address');

  if (!address) return apiError('Нужен параметр address', 400);

  const limit = rateLimit(`${await requestKey(request)}:balance`, { limit: 30, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);

  const { PublicKey } = await import('@solana/web3.js');
  let owner: import('@solana/web3.js').PublicKey;
  try {
    owner = new PublicKey(address);
  } catch {
    return apiError('Некорректный адрес', 400);
  }

  const connection = getConnection();

  try {
    const lamports = await connection.getBalance(owner, 'confirmed');
    const mint = requireTestTokenMint();
    const token = await getTokenBalance(connection, owner, mint);
    const decimals = getTestTokenDecimalsSafe();

    return NextResponse.json({
      success: true,
      address: owner.toBase58(),
      sol: lamports / 1_000_000_000,
      token: {
        mint: token.mint,
        symbol: getTestTokenSymbol(),
        decimals: token.decimals || decimals,
        amount: token.amount.toString(),
        ui: fromMicroUnits(token.amount.toString(), token.decimals || decimals).toFixed(6),
      },
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Не удалось получить баланс',
      502,
    );
  }
}

/** Текущий пользователь нужен только чтобы отличать публичный запрос. */
export async function HEAD() {
  const supabase = createClient();
  const user = await getServerUser(supabase);
  return new NextResponse(null, { status: user ? 200 : 401 });
}
