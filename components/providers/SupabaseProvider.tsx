'use client';

import type { Session, User } from '@supabase/supabase-js';
import * as React from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import type { Supabase } from '@/lib/supabase/types';

interface SupabaseContextValue {
  supabase: Supabase | null;
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isConfigured: boolean;
  signOut: () => Promise<void>;
}

const SupabaseContext = React.createContext<SupabaseContextValue | null>(null);

/**
 * Провайдер авторизации. Терпим к отсутствию настроек Supabase:
 * `supabase` будет null, страницы покажут SetupNotice.
 */
export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const isConfigured = isSupabaseConfigured();
  const supabase = React.useMemo(
    () => (isConfigured ? createClient() : null),
    [isConfigured],
  );

  const [session, setSession] = React.useState<Session | null>(null);
  const [isLoading, setIsLoading] = React.useState(isConfigured);

  React.useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signOut = React.useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, [supabase]);

  const value = React.useMemo<SupabaseContextValue>(
    () => ({
      supabase,
      user: session?.user ?? null,
      session,
      isLoading,
      isConfigured,
      signOut,
    }),
    [supabase, session, isLoading, isConfigured, signOut],
  );

  return <SupabaseContext.Provider value={value}>{children}</SupabaseContext.Provider>;
}

export function useSupabase(): SupabaseContextValue {
  const context = React.useContext(SupabaseContext);
  if (!context) {
    throw new Error('useSupabase должен использоваться внутри <SupabaseProvider>');
  }
  return context;
}

export { SupabaseContext };
