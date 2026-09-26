'use client';

import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';
import { WalletAdapterNetwork, type BaseWalletAdapter } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { ConnectionProvider, WalletProvider as BaseWalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import * as React from 'react';
import { getRpcEndpoint } from '@/lib/solana/constants';
import '@solana/wallet-adapter-react-ui/styles.css';

/**
 * Обёртка над wallet-adapter: подключает Phantom, Solflare и Backpack.
 *
 * Адаптеры создаются в useEffect, а не в useMemo: Backpack и Phantom читают
 * `window` в конструкторе и упали бы во время SSR.
 */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const endpoint = React.useMemo(() => {
    const configured = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();
    return configured || clusterApiUrl('devnet');
  }, []);

  const [wallets, setWallets] = React.useState<BaseWalletAdapter[]>([]);

  React.useEffect(() => {
    // У Phantom сети нет в конфиге адаптера — её определяет сам Phantom.
    setWallets([
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network: WalletAdapterNetwork.Devnet }),
      new BackpackWalletAdapter(),
    ]);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <BaseWalletProvider wallets={wallets} autoConnect localStorageKey="splitsol-wallet">
        <WalletModalProvider>{children}</WalletModalProvider>
      </BaseWalletProvider>
    </ConnectionProvider>
  );
}

export { getRpcEndpoint };
export default WalletProvider;
