'use client';

import type { ReactNode } from 'react';
import { SupabaseProvider } from '@/components/providers/SupabaseProvider';
import { ToastProvider } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { WalletProvider } from '@/components/wallet/WalletProvider';

/**
 * Единая точка подключения клиентских провайдеров.
 *
 * Server Components по умолчанию; этот компонент нужен только там, где есть
 * интерактивность (кошелёк, toast, realtime).
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SupabaseProvider>
      <WalletProvider>
        <TooltipProvider delayDuration={200}>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </WalletProvider>
    </SupabaseProvider>
  );
}

export default Providers;
