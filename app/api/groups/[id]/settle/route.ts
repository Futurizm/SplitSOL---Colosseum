import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getServerUser } from '@/lib/utils/api-auth';
import { apiError, guardDevnet, rateLimitResponse } from '@/lib/api/http';
import { rateLimit } from '@/lib/api/rateLimit';
import { getConnection } from '@/lib/solana/connection';
import { requireTestTokenMint } from '@/lib/solana/constants';
import { getEscrowAddress, IDL } from '@/lib/solana/anchor';
import { getAccount } from '@solana/spl-token';

export const dynamic = 'force-dynamic';

const settleSchema = z.object({
  groupId: z.string().uuid(),
  /** Подпись Anchor-транзакции settle_group, отправленной кошельком. */
  signature: z.string().trim().min(64).max(128).optional(),
  /** Досрочно отметить без подписи — только если on-chain статус уже settled. */
  syncOnly: z.boolean().optional(),
});

/**
 * POST /api/groups/[id]/settle — фиксация закрытия группы.
 *
 * Клиент отправляет Anchor-транзакцию `settle_group` (её подписывает кошелёк),
 * затем вызывает этот роут. Сервер независимо проверяет on-chain статус группы и
 * только потом пишет `status = 'settled'`.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const devnetError = guardDevnet();
  if (devnetError) return devnetError;

  const parsed = settleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? 'Некорректные данные', 400);
  }
  if (parsed.data.groupId !== params.id) {
    return apiError('Идентификатор группы не совпадает', 400);
  }

  const supabase = createClient();
  const user = await getServerUser(supabase);
  if (!user) return apiError('Требуется авторизация', 401);

  const limit = rateLimit(`settle:${user.id}`, { limit: 5, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  if (groupError) return apiError(groupError.message, 500);
  if (!group) return apiError('Группа не найдена', 404);
  if (group.created_by !== user.id) {
    return apiError('Только создатель группы может рассчитать её', 403);
  }
  if (group.status !== 'active') return apiError('Группа уже закрыта', 409);
  if (!group.onchain_group_pda) {
    return apiError('У группы нет on-chain аккаунта', 409);
  }

  // ── Независимая проверка on-chain состояния ───────────────────────────────
  const connection = getConnection();
  const { PublicKey } = await import('@solana/web3.js');
  const groupPda = new PublicKey(group.onchain_group_pda);
  const escrowAddress = getEscrowAddress(groupPda, requireTestTokenMint());

  let onchainStatus: 'active' | 'settled' | 'cancelled' | 'unknown' = 'unknown';
  let onchainPaid = 0;
  let onchainMembers = 0;

  try {
    const account = await connection.getAccountInfo(groupPda, 'confirmed');
    if (account) {
      // Декодируем аккаунт тем же кодером, что и клиент.
      const { BorshAccountsCoder } = await import('@coral-xyz/anchor');
      const coder = new BorshAccountsCoder(IDL as never);
      const decoded = coder.decode('Group', account.data);
      const data = decoded as unknown as {
        status: Record<string, unknown>;
        paidCount: number;
        memberCount: number;
      };
      onchainStatus = Object.keys(data.status)[0] as 'active' | 'settled' | 'cancelled';
      onchainPaid = data.paidCount;
      onchainMembers = data.memberCount;
    }
  } catch (error) {
    return apiError(
      `Не удалось прочитать on-chain состояние группы: ${(error as Error).message}`,
      502,
    );
  }

  if (onchainStatus === 'unknown') {
    return apiError(
      'On-chain аккаунт группы не найден. Проверьте, что программа задеплоена и PDA совпадает.',
      409,
    );
  }

  if (onchainStatus !== 'settled') {
    if (parsed.data.syncOnly) {
      return apiError(`On-chain статус группы: ${onchainStatus}`, 409, {
        onchainStatus,
        paidCount: onchainPaid,
        memberCount: onchainMembers,
      });
    }
    return apiError(
      `Группа ещё не рассчитана on-chain (статус ${onchainStatus}, оплачено ${onchainPaid}/${onchainMembers}). Сначала выполните settle_group в кошельке.`,
      409,
      { onchainStatus, paidCount: onchainPaid, memberCount: onchainMembers },
    );
  }

  // Дополнительно убеждаемся, что эскроу пуст — деньги ушли получателю.
  const escrowInfo = await connection.getAccountInfo(escrowAddress, 'confirmed');
  const remaining = escrowInfo ? (await getAccount(connection, escrowAddress)).amount : 0n;
  if (remaining > 0n) {
    return apiError(`В эскроу осталось ${remaining} micro-токенов — расчёт неполный.`, 409);
  }

  const { data, error } = await supabase
    .from('groups')
    .update({ status: 'settled', settled_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return apiError(error.message, 500);

  await supabase.from('activity_feed').insert({
    group_id: params.id,
    user_id: user.id,
    action: 'paid',
    metadata: { type: 'settled', signature: parsed.data.signature ?? null },
  });

  return NextResponse.json({ success: true, group: data, onchainStatus });
}
