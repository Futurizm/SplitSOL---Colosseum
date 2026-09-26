'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { LogOut, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { shortAddress } from '@/lib/utils/format';
import { isTestTokenConfigured } from '@/lib/solana/constants';

/** Кнопка подключения кошелька. */
export function ConnectButton() {
  const { publicKey, connected, connecting, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  if (!connected) {
    return (
      <Button
        onClick={() => setVisible(true)}
        loading={connecting}
        className="w-full sm:w-auto"
        variant="gradient"
      >
        <Wallet className="h-4 w-4" />
        Подключить кошелёк
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-2 rounded-lg border border-border px-3 py-2 md:flex">
        <span className="h-2 w-2 animate-pulse-ring rounded-full bg-success" />
        <span className="font-mono text-xs">{shortAddress(publicKey?.toBase58() ?? null, 4, 4)}</span>
      </div>
      <Button variant="ghost" size="sm" onClick={() => void disconnect()}>
        <LogOut className="h-4 w-4" />
        Отключить
      </Button>
    </div>
  );
}

/** Короткая подсказка, если tUSDC ещё не создан. */
export function TokenSetupHint() {
  if (isTestTokenConfigured()) return null;
  return (
    <p className="text-xs text-warning">
      Тестовый токен tUSDC ещё не создан — выполните <code className="font-mono">npm run setup:devnet</code>.
    </p>
  );
}

export default ConnectButton;
