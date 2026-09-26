import { createServerClient, type CookieMethodsServer } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/types/database';
import type { Supabase } from './types';

export interface SessionContext {
  response: NextResponse;
  supabase: Supabase | null;
  user: User | null;
}

/**
 * Обновляет сессию Supabase в middleware.
 *
 * Supabase Auth хранит токены в куках и сам обновляет их по истечении.
 * Если этого не делать на каждом запросе, Server Components будут видеть
 * протухшую сессию. Функция возвращает новый Response с обновлёнными куками.
 */
export async function updateSession(request: NextRequest): Promise<SessionContext> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { response, supabase: null, user: null };
  }

  const cookieMethods: CookieMethodsServer = {
    getAll() {
      return request.cookies.getAll();
    },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      cookiesToSet.forEach(({ name, value, options }) =>
        response.cookies.set(name, value, options),
      );
    },
  };

  const supabase = createServerClient<Database>(url, anonKey, { cookies: cookieMethods });

  // getUser() ходит в сеть и обновляет токены — именно это нам нужно.
  // getSession() из cookie-кэша для этого не подходит.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, supabase, user };
}

/** Публичные пути, не требующие сессии. */
export const PUBLIC_PATHS = ['/', '/login', '/register', '/join'];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
