import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getConnection } from '@/lib/solana/connection';
import { getEscrowAddress } from '@/lib/solana/anchor';
import { requireTestTokenMint } from '@/lib/solana/constants';
import { TransactionVerificationError, verifyTransfer } from '@/lib/solana/verify';
import { createServiceClient } from '@/lib/supabase/server';
import { apiError, guardDevnet, rateLimitResponse, requestKey } from '@/lib/api/http';
import { rateLimit } from '@/lib/api/rateLimit';
import type { Transaction } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  signature: z.string().trim().min(64, 'Некорректная подпись транзакции').max(128),
  groupId: z.string().uuid(),
  memberId: z.string().uuid(),
  /** Кто, по мнению клиента, оплатил. Сервер сверяет это с on-chain данными. */
  senderWallet: z.string().trim().optional(),
  /** reference-ключ Solana Pay, если платёж шёл по QR. */
  reference: z.string().trim().optional(),
});

/**
 * Верификация платежа и обновление статуса участника.
 *
 * Клиенту нельзя доверять: сервер сам читает транзакцию из сети и проверяет,
 * что перевод именно ожидаемой суммы и именно от указанного кошелька в эскроу
 * группы. Только после этого статус меняется на «paid».
 */
export async function POST(request: Request) {
  const devnetError = guardDevnet();
  if (devnetError) return devnetError;

  const limit = rateLimit(await requestKey(request), { limit: 10, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? 'Некорректные данные', 400);
  }

  const { signature, groupId, memberId, senderWallet, reference } = parsed.data;

  const supabase = createServiceClient();

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('*')
    .eq('id', groupId)
    .maybeSingle();

  if (groupError) return apiError(groupError.message, 500);
  if (!group) return apiError('Группа не найдена', 404);
  if (group.status !== 'active') return apiError('Группа уже закрыта', 409);
  if (!group.onchain_group_pda) {
    return apiError('У группы нет on-chain аккаунта', 409);
  }

  const { data: member, error: memberError } = await supabase
    .from('group_members')
    .select('*')
    .eq('id', memberId)
    .maybeSingle();

  if (memberError) return apiError(memberError.message, 500);
  if (!member || member.group_id !== groupId) return apiError('Участник не найден', 404);
  if (member.status === 'paid') {
    return apiError('Доля уже оплачена', 409, { alreadyPaid: true });
  }

  const sender = member.guest_wallet ?? senderWallet;
  if (!sender) {
    return apiError('У участника не указан кошелёк — заполните его при присоединении', 400);
  }

  // Уже была верифицирована? Не плодим дубли.
  const { data: duplicate } = await supabase
    .from('transactions')
    .select('id')
    .eq('tx_signature', signature)
    .maybeSingle();
  if (duplicate) return apiError('Эта транзакция уже учтена', 409);

  const connection = getConnection();
  const { PublicKey } = await import('@solana/web3.js');
  const mint = requireTestTokenMint();
  const groupPda = new PublicKey(group.onchain_group_pda);

  try {
    const verification = await verifyTransfer(connection, signature, {
      sender: new PublicKey(sender),
      recipientTokenAccount: getEscrowAddress(groupPda, mint),
      mint,
      amount: BigInt(member.share_amount),
      // Платёж по QR проходит через float-округление в кошельке и может
      // прийти на 1 micro-unit меньше.
      tolerance: 1n,
      reference: reference ? new PublicKey(reference) : null,
      memo: group.id,
    });

    const paidMicro = verification.amount ?? BigInt(member.share_amount);

    // 1. Статус участника
    const { error: updateError } = await supabase
      .from('group_members')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        tx_signature: signature,
      })
      .eq('id', memberId)
      .eq('status', 'pending');

    if (updateError) return apiError(updateError.message, 500);

    // 2. Запись в историю (уникальность по tx_signature защищает от дублей)
    const transactionRow: Transaction = {
      id: crypto.randomUUID(),
      group_id: groupId,
      member_id: memberId,
      from_wallet: sender,
      to_wallet: getEscrowAddress(groupPda, mint).toBase58(),
      amount: paidMicro.toString(),
      currency: group.currency,
      tx_signature: signature,
      status: 'confirmed',
      block_time: verification.blockTime ?? null,
      slot: verification.slot ?? null,
      fee: verification.fee?.toString() ?? null,
      created_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
      kind: 'solana_pay',
    };
    await supabase.from('transactions').upsert(transactionRow, { onConflict: 'tx_signature' });

    // 3. Лента активности
    await supabase.from('activity_feed').insert({
      group_id: groupId,
      user_id: member.user_id,
      action: 'paid',
      metadata: { signature, amount: paidMicro.toString() },
    });

    return NextResponse.json({ success: true, verification });
  } catch (error) {
    if (error instanceof TransactionVerificationError) {
      return apiError(error.message, 400, { code: error.code });
    }
    return apiError(
      error instanceof Error ? error.message : 'Не удалось верифицировать платёж',
      500,
    );
  }
}
