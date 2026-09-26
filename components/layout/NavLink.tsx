'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

export interface NavLinkProps {
  href: string;
  active: boolean;
  children: ReactNode;
  className?: string;
}

/** Ссылка навигации с активным состоянием. */
export function NavLink({ href, active, children, className }: NavLinkProps) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'bg-solana-purple/15 text-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        className,
      )}
    >
      {children}
    </Link>
  );
}

export default NavLink;
