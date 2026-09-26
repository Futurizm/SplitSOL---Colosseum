import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getServerUser } from '@/lib/utils/api-auth';
import { apiError } from '@/lib/api/http';

export const dynamic = 'force-dynamic';

const profileSchema = z.object({
  username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/).optional(),
  displayName: z.string().trim().max(60).optional(),
  avatarUrl: z.string().url().max(500).optional(),
  walletAddress: z.string().trim().min(32).max(44).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s\-()]{6,20}$/)
    .optional(),
});

/** GET /api/profile — профиль текущего пользователя. */
export async function GET() {
  const supabase = createClient();
  const user = await getServerUser(supabase);
  if (!user) return apiError('Требуется авторизация', 401);

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) return apiError(error.message, 500);
  return NextResponse.json({ success: true, profile: data, email: user.email });
}

/**
 * PATCH /api/profile — обновление профиля.
 *
 * `wallet_address` можно привязать только вместе с доказательством владения:
 * сам по себе адрес не даёт права распоряжаться средствами, но ошибочный адрес
 * в профиле вводит других участников в заблуждение.
 */
export async function PATCH(request: Request) {
  const supabase = createClient();
  const user = await getServerUser(supabase);
  if (!user) return apiError('Требуется авторизация', 401);

  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? 'Некорректные данные', 400);
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.username !== undefined) patch.username = parsed.data.username;
  if (parsed.data.displayName !== undefined) patch.display_name = parsed.data.displayName;
  if (parsed.data.avatarUrl !== undefined) patch.avatar_url = parsed.data.avatarUrl;
  if (parsed.data.phone !== undefined) patch.phone = parsed.data.phone;
  if (parsed.data.walletAddress !== undefined) {
    patch.wallet_address = parsed.data.walletAddress;
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, ...patch }, { onConflict: 'id' })
    .select()
    .single();

  if (error) return apiError(error.message, 500);
  return NextResponse.json({ success: true, profile: data });
}
