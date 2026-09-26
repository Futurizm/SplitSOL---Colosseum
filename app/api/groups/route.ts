import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getServerUser } from '@/lib/utils/api-auth';
import { apiError } from '@/lib/api/http';
import { generateInviteCode } from '@/lib/utils/invite';
import { toMicroUnits } from '@/lib/utils/format';
import { getTestTokenDecimals } from '@/lib/solana/constants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/groups — список групп пользователя.
 *
 * RLS сам ограничивает выдачу, но дополнительно фильтруем по membership,
 * чтобы не полагаться только на политику.
 */
export async function GET(request: Request) {
  const supabase = createClient();
  const user = await getServerUser(supabase);
  if (!user) return apiError('Требуется авторизация', 401);

  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  let query = supabase
    .from('groups')
    .select('*, group_members(*)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (status && ['active', 'settled', 'cancelled'].includes(status)) {
    query = query.eq('status', status as 'active' | 'settled' | 'cancelled');
  }

  const { data, error } = await query;
  if (error) return apiError(error.message, 500);

  return NextResponse.json({ success: true, groups: data ?? [] });
}

const createSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(400).optional(),
  category: z.enum(['restaurant', 'travel', 'shopping', 'other']).default('other'),
  totalAmountMicro: z.string().regex(/^\d+$/, 'Сумма должна быть целым числом micro-единиц'),
  currency: z.enum(['tUSDC', 'SOL']).default('tUSDC'),
  restaurantWallet: z.string().trim().min(32).max(44),
  onchainGroupPda: z.string().trim().min(32).max(44).optional(),
  onchainGroupId: z.string().trim().max(32).optional(),
  /** Доли участников: имя, кошелёк, сумма в micro-единицах, процент. */
  members: z
    .array(
      z.object({
        guestName: z.string().trim().min(1).max(60),
        guestWallet: z.string().trim().max(44).nullable().optional(),
        shareMicro: z.string().regex(/^\d+$/),
        sharePercentage: z.string().regex(/^\d+(\.\d{1,2})?$/),
        role: z.enum(['owner', 'member']).default('member'),
      }),
    )
    .min(1)
    .max(10),
});

/**
 * POST /api/groups — создаёт запись группы в БД.
 *
 * On-chain аккаунт к этому моменту уже создан клиентом (Anchor-транзакция
 * подписывается кошельком), здесь только сохраняется интерфейсная часть.
 */
export async function POST(request: Request) {
  const supabase = createServiceClient();
  const user = await getServerUser();
  if (!user) return apiError('Требуется авторизация', 401);

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? 'Некорректные данные', 400);
  }

  const input = parsed.data;
  const decimals = getTestTokenDecimals();
  const totalMicro = BigInt(input.totalAmountMicro);
  const sumMicro = input.members.reduce((sum, member) => sum + BigInt(member.shareMicro), 0n);

  // Инвариант программы: сумма долей не может превышать общий счёт.
  if (sumMicro > totalMicro) {
    return apiError('Сумма долей превышает общий счёт', 400);
  }

  const groupId = crypto.randomUUID();
  const inviteCode = generateInviteCode();

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .insert({
      id: groupId,
      name: input.name,
      description: input.description || null,
      category: input.category,
      total_amount: input.totalAmountMicro,
      currency: input.currency,
      status: 'active',
      invite_code: inviteCode,
      restaurant_wallet: input.restaurantWallet,
      created_by: user.id,
      onchain_group_pda: input.onchainGroupPda ?? null,
      onchain_group_id: input.onchainGroupId ?? null,
    })
    .select()
    .single();

  if (groupError) return apiError(groupError.message, 500);

  const memberRows = input.members.map((member) => ({
    id: crypto.randomUUID(),
    group_id: groupId,
    user_id: member.role === 'owner' ? user.id : null,
    guest_name: member.guestName,
    guest_wallet: member.guestWallet ?? null,
    share_amount: member.shareMicro,
    share_percentage: member.sharePercentage,
    status: 'pending' as const,
    role: member.role,
  }));

  const { error: membersError } = await supabase.from('group_members').insert(memberRows);
  if (membersError) return apiError(membersError.message, 500);

  await supabase.from('activity_feed').insert({
    group_id: groupId,
    user_id: user.id,
    action: 'created',
    metadata: { name: input.name, total: input.totalAmountMicro, decimals },
  });

  void toMicroUnits;

  return NextResponse.json({ success: true, group }, { status: 201 });
}
