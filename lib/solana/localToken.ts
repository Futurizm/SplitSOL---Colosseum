import { PublicKey, type Connection } from '@solana/web3.js';
import {
  DEVNET_AIRDROP_SOL,
  DEVNET_TOKEN_AIRDROP_AMOUNT,
  getTestTokenDecimals,
  getTestTokenSymbol,
  isTestTokenConfigured,
  requireTestTokenMint,
} from './constants';
import { getMintInfo, getTokenBalance } from './token';
import { LAMPORTS_PER_SOL } from './token';
import { fromMicroUnits } from '@/lib/utils/format';

/**
 * Работа с кастомным devnet-токеном tUSDC, созданным через
 * `spl-token create-token --decimals 6`. Все токены бесплатные.
 */

export interface TestTokenStatus {
  configured: boolean;
  mint: string | null;
  symbol: string;
  decimals: number;
  supply: string | null;
  isInitialized: boolean;
  balance: bigint | null;
  uiBalance: string | null;
}

/** Диагностика токена + баланса кошелька — для баннера и Debug-панели. */
export async function getTestTokenStatus(
  connection: Connection,
  owner?: PublicKey | null,
): Promise<TestTokenStatus> {
  const base: TestTokenStatus = {
    configured: isTestTokenConfigured(),
    mint: null,
    symbol: getTestTokenSymbol(),
    decimals: getTestTokenDecimals(),
    supply: null,
    isInitialized: false,
    balance: null,
    uiBalance: null,
  };

  if (!base.configured) return base;

  const mint = requireTestTokenMint();
  base.mint = mint.toString();

  try {
    const info = await getMintInfo(connection, mint);
    base.supply = info.uiSupply;
    base.isInitialized = info.isInitialized;
  } catch {
    // mint ещё не существует в кластере — это нормально до первого `spl-token create-token`
  }

  if (owner) {
    try {
      const balance = await getTokenBalance(connection, owner, mint);
      base.balance = balance.amount;
      base.uiBalance = fromMicroUnits(balance.amount, balance.decimals || base.decimals).toFixed(6);
    } catch {
      base.balance = null;
    }
  }

  return base;
}

/** Запросить тестовые SOL через публичный devnet airdrop (лимит ~2 SOL за раз). */
export async function requestSolAirdrop(connection: Connection, to: PublicKey, sol = DEVNET_AIRDROP_SOL) {
  const signature = await connection.requestAirdrop(to, sol * LAMPORTS_PER_SOL);
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    { signature, ...latest },
    'confirmed',
  );
  return { signature, sol };
}

/**
 * Запросить тестовые tUSDC.
 * Минит серверный клюpair с mint authority — приватные ключи кошельков
 * пользователя приложение никогда не видит.
 */
export async function requestTestTokenAirdrop(
  connection: Connection,
  to: PublicKey,
  amount: number = DEVNET_TOKEN_AIRDROP_AMOUNT,
): Promise<{ signature: string; amount: number; recipient: string }> {
  const response = await fetch('/api/devnet/airdrop-tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: to.toString(), amount }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { signature: string; amount: number; recipient: string; error?: string }
    | null;

  if (!response.ok || !payload?.signature) {
    throw new Error(payload?.error || 'Не удалось получить тестовые токены');
  }

  // Даём подтвердиться, чтобы баланс в UI обновился сразу.
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    { signature: payload.signature, ...latest },
    'confirmed',
  );

  return payload;
}

export { DEVNET_AIRDROP_SOL, DEVNET_TOKEN_AIRDROP_AMOUNT };
