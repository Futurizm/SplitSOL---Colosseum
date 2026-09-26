import { Connection, PublicKey, clusterApiUrl, type Commitment } from '@solana/web3.js';

/**
 * Константы Solana. Проект жёстко зафиксирован на Devnet — см. `assertDevnetOnly`.
 */

export const SOLANA_CLUSTER = 'devnet' as const;
export const IS_DEVNET = true as const;

export const COMMITMENT: Commitment = 'confirmed';

/** 6 decimals — как у USDC, чтобы tUSDC был его тестовым аналогом. */
export const TEST_TOKEN_DECIMALS = 6;
export const TEST_TOKEN_SYMBOL = 'tUSDC';
export const TEST_TOKEN_NAME = 'SplitSOL Test Token';

/** Минимальная сумма для rent-exempt токен-аккаунта (≈0.00203928 SOL). */
export const TOKEN_ACCOUNT_RENT_LAMPORTS = 2_039_280;

/** 1 SOL в lamports. */
export const LAMPORTS_PER_SOL = 1_000_000_000;

/** Сколько SOL раздаёт кнопка «Получить тестовые SOL». */
export const DEVNET_AIRDROP_SOL = 1;

/** Сколько tUSDC минтит кнопка «Получить тестовые tUSDC». */
export const DEVNET_TOKEN_AIRDROP_AMOUNT = 1_000;

export const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');

/** Программа SPL Memo: используется для привязки платежа к группе. */
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

/** Устаревшая (не-SPL) версия memo-программы — кошельки её всё ещё шлют. */
export const LEGACY_MEMO_PROGRAM_ID = new PublicKey('Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo');

export const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey(
  'ComputeBudget111111111111111111111111111111',
);

/** Дискриминаторы SPL Token, которые нас интересуют при верификации. */
export const TOKEN_INSTRUCTION_DISCRIMINANT = {
  transfer: 9,
  transferChecked: 14,
} as const;

/** Схема PDA-сидов программы. Должны совпадать с Rust-кодом. */
export const GROUP_SEED_PREFIX = 'group';
export const MEMBER_SEED_PREFIX = 'member';

/** ────────────────────────────────────────────────────────────────────────────
 * Доступ к env — только через функции. Это нужно, чтобы `next build` проходил
 * без заполненного `.env.local` (иначе PublicKey(undefined) уронит сборку).
 * ──────────────────────────────────────────────────────────────────────────── */

function isValidAddress(value: string | undefined | null): value is string {
  if (!value) return false;
  try {
    new PublicKey(value.trim());
    return true;
  } catch {
    return false;
  }
}

/** Есть ли адрес Anchor-программы в env. */
export function isProgramConfigured(): boolean {
  return isValidAddress(process.env.NEXT_PUBLIC_PROGRAM_ID);
}

/** Program ID. Бросает понятную ошибку, если программа не задеплоена. */
export function getProgramId(): PublicKey {
  const value = process.env.NEXT_PUBLIC_PROGRAM_ID;
  if (!isValidAddress(value)) {
    throw new Error(
      'NEXT_PUBLIC_PROGRAM_ID не задан. Выполните `anchor deploy` и `node scripts/set-program-id.mjs` (см. SETUP.md, шаг 4).',
    );
  }
  return new PublicKey(value.trim());
}

/** Program ID или null — для UI, который должен деградировать, а не падать. */
export function getProgramIdOrNull(): PublicKey | null {
  return isValidAddress(process.env.NEXT_PUBLIC_PROGRAM_ID)
    ? new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID.trim())
    : null;
}

/** Задан ли mint тестового токена. */
export function isTestTokenConfigured(): boolean {
  return isValidAddress(process.env.NEXT_PUBLIC_TEST_TOKEN_MINT);
}

/** Mint tUSDC. Бросает ошибку, если токен ещё не создан. */
export function requireTestTokenMint(): PublicKey {
  const value = process.env.NEXT_PUBLIC_TEST_TOKEN_MINT;
  if (!isValidAddress(value)) {
    throw new Error(
      'NEXT_PUBLIC_TEST_TOKEN_MINT не задан. Создайте токен: `npm run setup:devnet` (или spl-token create-token --decimals 6).',
    );
  }
  return new PublicKey(value.trim());
}

export function getTestTokenMintOrNull(): PublicKey | null {
  return isTestTokenConfigured()
    ? new PublicKey(process.env.NEXT_PUBLIC_TEST_TOKEN_MINT!.trim())
    : null;
}

export function getTestTokenDecimals(): number {
  const raw = process.env.NEXT_PUBLIC_TEST_TOKEN_DECIMALS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : TEST_TOKEN_DECIMALS;
}

export function getTestTokenSymbol(): string {
  return process.env.NEXT_PUBLIC_TEST_TOKEN_SYMBOL || TEST_TOKEN_SYMBOL;
}

/** Комиссия приложения. В devnet всегда 0. */
export function getFeePercentage(): number {
  const raw = process.env.NEXT_PUBLIC_FEE_PERCENTAGE;
  const parsed = raw ? Number.parseFloat(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Helius RPC, если задан API key, иначе публичный devnet. */
export function getRpcEndpoint(): string {
  const configured = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();
  if (configured) return configured;
  return clusterApiUrl(SOLANA_CLUSTER);
}

export function getExplorerCluster(): 'devnet' | 'localnet' | 'testnet' {
  return SOLANA_CLUSTER;
}

/**
 * Страховка от случайной работы в mainnet.
 * Вызывается при создании каждого Connection и в каждом серверном API-роуте.
 */
export function assertDevnetOnly(endpoint: string): void {
  const url = endpoint.toLowerCase();
  const looksLikeMainnet =
    (url.includes('mainnet') || url.includes('api.mainnet-beta')) &&
    !url.includes('devnet') &&
    !url.includes('testnet') &&
    !url.includes('localnet');
  if (looksLikeMainnet) {
    throw new Error('SplitSOL работает только на Solana Devnet. Mainnet-эндпоинты заблокированы.');
  }
}

/** Соединение с дефолтными настройками приложения. */
export function createConnection(endpoint: string = getRpcEndpoint()): Connection {
  assertDevnetOnly(endpoint);
  return new Connection(endpoint, {
    commitment: COMMITMENT,
    wsEndpoint: endpoint,
    disableRetryOnRateLimit: false,
  });
}
