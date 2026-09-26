import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getServerUser } from '@/lib/utils/api-auth';
import { apiError } from '@/lib/api/http';

export const dynamic = 'force-dynamic';

/** GET /api/groups/[id] — детали группы и список участников. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  if (!z.string().uuid().safeParse(params.id).success) {
    return apiError('Некорректный идентификатор группы', 400);
  }

  const supabase = createClient();
  const user = await getServerUser(supabase);

  const { data: group, error } = await supabase
    .from('groups')
    .select('*, group_members(*)')
    .eq('id', params.id)
    .maybeSingle();

  if (error) return apiError(error.message, 500);
  if (!group) return apiError('Группа не найдена', 404);

  // Гостевой доступ по invite-коду возможен, но данные всё равно ограничены RLS.
  if (!user) {
    // Гостю отдаём только публичную часть — без списка участников и кошельков.
    const record = group as unknown as Record<string, unknown>;
    const publicGroup = {
      id: record.id,
      name: record.name,
      description: record.description,
      category: record.category,
      total_amount: record.total_amount,
      currency: record.currency,
      status: record.status,
      invite_code: record.invite_code,
      created_at: record.created_at,
      member_count: Array.isArray(record.group_members) ? record.group_members.length : 0,
    };
    return NextResponse.json({ success: true, group: publicGroup, requiresAuth: true });
  }

  return NextResponse.json({ success: true, group });
}

const patchSchema = z.object({
  name: z.string().trim().min(3).max(80).optional(),
  description: z.string().trim().max(400).nullable().optional(),
  status: z.enum(['active', 'settled', 'cancelled']).optional(),
  restaurantWallet: z.string().trim().min(32).max(44).optional(),
});

/** PATCH /api/groups/[id] — правки группы (только создатель). */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!z.string().uuid().safeParse(params.id).success) {
    return apiError('Некорректный идентификатор группы', 400);
  }

  const supabase = createClient();
  const user = await getServerUser(supabase);
  if (!user) return apiError('Требуется авторизация', 401);

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? 'Некорректные данные', 400);
  }

  // RLS-политика разрешает UPDATE только создателю — проверяем и явно.
  const { data: existing } = await supabase
    .from('groups')
    .select('created_by')
    .eq('id', params.id)
    .maybeSingle();

  if (!existing) return apiError('Группа не найдена', 404);
  if (existing.created_by !== user.id) return apiError('Недостаточно прав', 403);

  const patch: {
    name?: string;
    description?: string | null;
    status?: 'active' | 'settled' | 'cancelled';
    settled_at?: string;
    restaurant_wallet?: string;
  } = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.status !== undefined) {
    patch.status = parsed.data.status;
    patch.settled_at = new Date().toISOString();
  }
  if (parsed.data.restaurantWallet !== undefined) {
    patch.restaurant_wallet = parsed.data.restaurantWallet;
  }

  const { data, error } = await supabase
    .from('groups')
    .update(patch)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return apiError(error.message, 500);
  return NextResponse.json({ success: true, group: data });
}

/** DELETE /api/groups/[id] — удалить группу (только создатель, только settled/cancelled). */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  if (!z.string().uuid().safeParse(params.id).success) {
    return apiError('Некорректный идентификатор группы', 400);
  }

  const supabase = createClient();
  const user = await getServerUser(supabase);
  if (!user) return apiError('Требуется авторизация', 401);

  const { data: existing } = await supabase
    .from('groups')
    .select('created_by, status')
    .eq('id', params.id)
    .maybeSingle();

  if (!existing) return apiError('Группа не найдена', 404);
  if (existing.created_by !== user.id) return apiError('Недостаточно прав', 403);

  if (existing.status === 'active') {
    return apiError(
      'Активную группу нельзя удалить: сначала рассчитайте её или отмените (средства лежат в эскроу).',
      409,
    );
  }

  const { error } = await supabase.from('groups').delete().eq('id', params.id);
  if (error) return apiError(error.message, 500);

  return NextResponse.json({ success: true });
}
