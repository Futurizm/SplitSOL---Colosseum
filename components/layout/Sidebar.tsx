'use client';

import {
  BarChart3,
  History,
  LayoutDashboard,
  Plus,
  Settings,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { ConnectButton } from '@/components/wallet/ConnectButton';
import { NavLink } from './NavLink';

export const NAV_ITEMS = [
  { href: '/dashboard', label: 'Дашборд', icon: LayoutDashboard },
  { href: '/groups', label: 'Группы', icon: Users },
  { href: '/history', label: 'История', icon: History },
  { href: '/analytics', label: 'Аналитика', icon: BarChart3 },
  { href: '/settings', label: 'Настройки', icon: Settings },
] as const;

/** Боковая навигация. На мобильных заменяется на <MobileNav />. */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-card/40 lg:flex lg:flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-border px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-solana-gradient">
            <Wallet className="h-4 w-4 text-black" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">SplitSOL</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} href={item.href} active={pathname === item.href}>
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}

        <Link
          href="/groups/new"
          className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-solana-gradient px-3 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Новая группа
        </Link>
      </nav>

      <div className="space-y-3 border-t border-border p-4">
        <ConnectButton />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Все расчёты идут через Anchor-программу на Solana Devnet. Токены бесплатные.
        </p>
      </div>
    </aside>
  );
}

export { cn };
export default Sidebar;
