import type { ReactNode } from 'react';
import { Header } from '@/components/layout/Header';
import { MobileNav } from '@/components/layout/MobileNav';
import { Sidebar } from '@/components/layout/Sidebar';
import { ConnectButton } from '@/components/wallet/ConnectButton';

/**
 * Layout приватной части приложения: сайдбар, шапка и мобильная навигация.
 * Server Component — интерактив живёт в дочерних клиентских компонентах.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:hidden">
          <span className="font-display font-bold">SplitSOL</span>
          <ConnectButton />
        </div>

        <div className="hidden lg:block">
          <Header />
        </div>

        <main className="flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-10">{children}</main>

        <MobileNav />
      </div>
    </div>
  );
}
