import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/types/database';
import type { Supabase } from './types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Проверка конфигурации нужна, чтобы приложение запускалось даже с пустым
 * `.env.local`: страницы показывают экран настройки вместо падения.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getSupabaseConfig(): { url: string; anonKey: string } | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}

let cached: Supabase | null = null;

/** Supabase-клиент для браузера. Синглтон на всё приложение. */
export function createClient(): Supabase {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error(
      'Supabase не настроен. Заполните NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY в .env.local (SETUP.md, шаг 2).',
    );
  }
  if (!cached) {
    cached = createBrowserClient<Database>(config.url, config.anonKey);
  }
  return cached;
}

/** Клиент или null — для компонентов, которые должны деградировать, а не падать. */
export function getBrowserClientOrNull(): Supabase | null {
  return isSupabaseConfigured() ? createClient() : null;
}
