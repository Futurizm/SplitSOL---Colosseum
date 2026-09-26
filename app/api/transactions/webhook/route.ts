import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import { createServiceClient } from '@/lib/supabase/server';
import { apiError, guardDevnet } from '@/lib/api/http';
import { requireTestTokenMint } from '@/lib/solana/constants';
import { getEscrowAddress } from '@/lib/solana/anchor';

export const dynamic = 'force-dynamic';

/**
 * Webhook Helius (и любого другого провайдера) для автоматической фиксации
 * платежей.
 *
 * Это «страховка» основного пути: клиент сам вызывает /api/transactions/verify,
 * но если пользователь закрыл вкладку сразу после оплаты, Helius догонит
 * транзакцию и поставит статус здесь.
 *
 * Проверка подписи: Helius отправляет заголовок `x-helius-signature` —
 * это HMAC-SHA256 тела запроса секретом из HELIUS_WEBHOOK_SECRET.
 */

interface HeliusTransaction {
  signature?: string;
  description?: string;
  tokenTransfers?: {
    fromUserAccount?: string;
    toUserAccount?: string;
    tokenAmount?: { decimals?: string; tokenAmount?: string; amount?: string };
    mint?: string;
  }[];
  meta?: { err: unknown };
  slot?: number;
  timestamp?: number;
}

function verifySignature(rawBody: string, providedSignature: string | null): boolean {
  const secret = process.env.HELIUS_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!providedSignature) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(providedSignature, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const devnetError = guardDevnet();
  if (devnetError) return devnetError;

  const rawBody = await request.text();
  const provided = request.headers.get('x-helius-signature');

  if (!verifySignature(rawBody, provided)) {
    return apiError('Некорректная подпись webhook', 401);
  }

  let payload: HeliusTransaction | HeliusTransaction[];
  try {
    payload = JSON.parse(rawBody) as HeliusTransaction | HeliusTransaction[];
  } catch {
    return apiError('Некорректный JSON', 400);
  }

  const transactions = Array.isArray(payload) ? payload : [payload];
  const supabase = createServiceClient();
  const mint = requireTestTokenMint().toBase58();

  let processed = 0;
  let skipped = 0;

  for (const tx of transactions) {
    const signature = tx.signature;
    if (!signature || !tx.tokenTransfers?.length) {
      skipped += 1;
      continue;
    }
    if (tx.meta?.err) {
      skipped += 1;
      continue;
    }

    // Платёж наш, только если токен — наш mint.
    const transfer = tx.tokenTransfers.find(
      (item) => item.mint === mint && item.tokenAmount,
    );
    if (!transfer) {
      skipped += 1;
      continue;
    }

    // Ищем группу, эскроу которой совпадает с получателем.
    const recipient = transfer.toUserAccount;
    if (!recipient) {
      skipped += 1;
      continue;
    }

    const { data: candidates } = await supabase
      .from('groups')
      .select('id, onchain_group_pda, currency, total_amount')
      .eq('status', 'active')
      .not('onchain_group_pda', 'is', null)
      .limit(200);

    let matchedGroup: { id: string; currency: string } | null = null;
    for (const group of candidates ?? []) {
      if (!group.onchain_group_pda) continue;
      const escrow = getEscrowAddress(new PublicKey(group.onchain_group_pda)).toBase58();
      if (escrow === recipient) {
        matchedGroup = { id: group.id, currency: group.currency };
        break;
      }
    }

    if (!matchedGroup) {
      skipped += 1;
      continue;
    }

    const amountMicro = BigInt(
      transfer.tokenAmount?.tokenAmount ?? transfer.tokenAmount?.amount ?? '0',
    );

    // Находим участника с такой долей и неоплаченного.
    const { data: members } = await supabase
      .from('group_members')
      .select('*')
      .eq('group_id', matchedGroup.id)
      .eq('status', 'pending');

    // Допускаем 1 micro-unit расхождения (float-округление в кошельках).
    const member = (members ?? []).find((row) => {
      const expected = BigInt(row.share_amount);
      const diff =
        amountMicro > expected ? amountMicro - expected : expected - amountMicro;
      return diff <= 1n && row.guest_wallet === transfer.fromUserAccount;
    });

    if (!member) {
      skipped += 1;
      continue;
    }

    // Уже обработали?
    const { data: existing } = await supabase
      .from('transactions')
      .select('id')
      .eq('tx_signature', signature)
      .maybeSingle();
    if (existing) {
      skipped += 1;
      continue;
    }

    const { error: updateError } = await supabase
      .from('group_members')
      .update({ status: 'paid', paid_at: new Date().toISOString(), tx_signature: signature })
      .eq('id', member.id)
      .eq('status', 'pending');

    if (updateError) {
      skipped += 1;
      continue;
    }

    await supabase.from('transactions').insert({
      id: crypto.randomUUID(),
      group_id: matchedGroup.id,
      member_id: member.id,
      from_wallet: transfer.fromUserAccount ?? 'unknown',
      to_wallet: recipient,
      amount: amountMicro.toString(),
      currency: matchedGroup.currency,
      tx_signature: signature,
      status: 'confirmed',
      slot: tx.slot ?? null,
      block_time: tx.timestamp ?? null,
      created_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
      kind: 'solana_pay',
    });

    await supabase.from('activity_feed').insert({
      group_id: matchedGroup.id,
      user_id: member.user_id,
      action: 'paid',
      metadata: { signature, amount: amountMicro.toString(), source: 'helius-webhook' },
    });

    processed += 1;
  }

  return NextResponse.json({ success: true, processed, skipped });
}
