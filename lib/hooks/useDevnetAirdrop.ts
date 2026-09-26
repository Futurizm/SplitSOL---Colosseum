'use client';

import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useCallback, useState } from 'react';
import {
  DEVNET_AIRDROP_SOL,
  DEVNET_TOKEN_AIRDROP_AMOUNT,
  getTestTokenDecimals,
  getTestTokenSymbol,
  isTestTokenConfigured,
} from '@/lib/solana/constants';
import { requestSolAirdrop, requestTestTokenAirdrop } from '@/lib/solana/localToken';

export interface UseDevnetAirdropResult {
  requestSol: () => Promise<string>;
  requestTokens: (amount?: number) => Promise<string>;
  isRequestingSol: boolean;
  isRequestingTokens: boolean;
  error: string | null;
  tokenAvailable: boolean;
}

/**
 * Кнопки «Получить тестовые SOL / tUSDC» прямо из интерфейса.
 *
 * tUSDC минтит серверный клюpair с mint authority — приложение никогда и ни
 * при каких обстоятельствах не получает приватный ключ пользователя.
 */
export function useDevnetAirdrop(): UseDevnetAirdropResult {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [isRequestingSol, setIsRequestingSol] = useState(false);
  const [isRequestingTokens, setIsRequestingTokens] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requireWallet = useCallback(() => {
    if (!publicKey) throw new Error('Подключите кошелёк, чтобы получить тестовые токены');
    return publicKey;
  }, [publicKey]);

  const requestSol = useCallback(async () => {
    setIsRequestingSol(true);
    setError(null);
    try {
      const { signature } = await requestSolAirdrop(connection, requireWallet(), DEVNET_AIRDROP_SOL);
      return signature;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw new Error(message);
    } finally {
      setIsRequestingSol(false);
    }
  }, [connection, requireWallet]);

  const requestTokens = useCallback(
    async (amount: number = DEVNET_TOKEN_AIRDROP_AMOUNT) => {
      setIsRequestingTokens(true);
      setError(null);
      try {
        const { signature } = await requestTestTokenAirdrop(connection, requireWallet(), amount);
        return signature;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw new Error(message);
      } finally {
        setIsRequestingTokens(false);
      }
    },
    [connection, requireWallet],
  );

  return {
    requestSol,
    requestTokens,
    isRequestingSol,
    isRequestingTokens,
    error,
    tokenAvailable: isTestTokenConfigured(),
  };
}

export { getTestTokenDecimals, getTestTokenSymbol };
