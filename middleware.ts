import { NextResponse, type NextRequest } from 'next/server';
import { isPublicPath, updateSession } from '@/lib/supabase/middleware';

/**
 * Auth middleware.
 *
 * - обновляет сессию Supabase (иначе Server Components видят протухший токен);
 * - закрывает приватные страницы (/dashboard, /groups, /history, /analytics, /settings);
 * - пропускает /api/*, /_next/* и статику.
 *
 * Если Supabase не настроен, middleware ничего не блокирует — вместо редиректа
 * приложение покажет экран настройки (см. components/SetupNotice.tsx).
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const { response, user } = await updateSession(request);

  const isApiRoute = pathname.startsWith('/api');
  const isStaticFile =
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    /\.[a-zA-Z0-9]+$/.test(pathname);

  if (isApiRoute || isStaticFile || isPublicPath(pathname)) {
    return response;
  }

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('redirect', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Все пути, кроме статики:
     * - отсутствие api в matcher намеренно: API-роуты сами решают,
     *   нужен ли им пользователь (часть эндпоинтов публична).
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
