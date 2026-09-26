'use client';

import { History, LayoutDashboard, Plus, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

/** Нижняя навигация для мобильных экранов. */
export function MobileNav() {
  const pathname = usePathname();

  const items = [
    { href: '/dashboard', label: 'Главная', icon: LayoutDashboard },
    { href: '/groups', label: 'Группы', icon: Users },
    { href: '/groups/new', label: 'Создать', icon: Plus },
    { href: '/history', label: 'История', icon: History },
    { href: '/settings', label: 'Ещё', icon: Settings },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur lg:hidden">
      <div className="grid grid-cols-5">
        {items.map((item) => {
          const active = pathname === item.href;
          const isCreate = item.href === '/groups/new';
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                active ? 'text-solana-green' : 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg',
                  isCreate && 'bg-solana-gradient text-black',
                )}
              >
                <item.icon className="h-4 w-4" />
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
      {/* Высота нижней навигации, чтобы контент не перекрывался */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}

export default MobileNav;
