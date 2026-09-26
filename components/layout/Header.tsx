'use client';

import { LogOut, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Avatar, AvatarFallback, initials } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DevnetFaucetDialog } from '@/components/wallet/DevnetFaucetDialog';
import { ConnectButton } from '@/components/wallet/ConnectButton';
import { SolanaStatus } from '@/components/wallet/SolanaStatus';
import { shortAddress } from '@/lib/utils/format';

const TITLES: { prefix: string; title: string }[] = [
  { prefix: '/groups/new', title: 'Новая группа' },
  { prefix: '/groups', title: 'Группы' },
  { prefix: '/history', title: 'История транзакций' },
  { prefix: '/analytics', title: 'Аналитика' },
  { prefix: '/settings', title: 'Настройки' },
  { prefix: '/dashboard', title: 'Дашборд' },
];

export function Header() {
  const pathname = usePathname();
  const { user, signOut, isConfigured } = useSupabase();
  const { publicKey } = useWallet();

  const match = TITLES.find((item) => pathname.startsWith(item.prefix));
  const isGroupPage = pathname.startsWith('/groups/') && !pathname.startsWith('/groups/new');
  const title = isGroupPage ? 'Группа' : match?.title ?? 'SplitSOL';

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur lg:px-8">
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-lg font-semibold tracking-tight">{title}</h1>
      </div>

      <SolanaStatus />

      {publicKey ? (
        <span className="hidden items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 font-mono text-xs text-muted-foreground xl:flex">
          <Wallet className="h-3.5 w-3.5" />
          {shortAddress(publicKey.toBase58())}
        </span>
      ) : null}

      <DevnetFaucetDialog />

      <div className="hidden sm:block">
        <ConnectButton />
      </div>

      {isConfigured && user ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void signOut()}
          title="Выйти"
          aria-label="Выйти"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      ) : null}

      {isConfigured && user ? (
        <Link href="/settings" className="hidden lg:block">
          <Avatar className="h-9 w-9 border border-border">
            <AvatarFallback>
              {initials(
                (user.user_metadata?.display_name as string) ?? (user.email ?? 'U'),
                'U',
              )}
            </AvatarFallback>
          </Avatar>
        </Link>
      ) : null}
    </header>
  );
}

export default Header;
