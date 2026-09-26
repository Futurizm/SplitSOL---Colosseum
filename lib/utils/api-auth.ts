import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { Supabase } from '@/lib/supabase/types';

/**
 * Текущий пользователь по сессионным кукам.
 *
 * `supabase` можно не передавать, если нужен server-клиент с service role
 * (он всё равно читает сессию из куок).
 */
export async function getServerUser(supabase?: Supabase | null) {
  const client = supabase ?? createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error) return null;
  return user;
}

/** Тот же помощник, но всегда на service role (обходит RLS). */
export async function getServerUserAsService() {
  return getServerUser(createServiceClient());
}
