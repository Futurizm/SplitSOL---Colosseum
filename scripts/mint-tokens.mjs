#!/usr/bin/env node
/**
 * Минтит tUSDC на указанный адрес.
 *
 *   node scripts/mint-tokens.mjs <WALLET_ADDRESS> [AMOUNT]
 *   npm run token:mint -- <WALLET_ADDRESS> 100
 *
 * Использует серверный mint-authority keypair из DEVNET_MINT_AUTHORITY_SECRET.
 * Это тот же путь, что и у API-роута раздачи токенов, только для CLI.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Минимальный загрузчик .env.local: без лишних зависимостей. */
function loadEnv() {
  const path = join(ROOT, '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function main() {
  loadEnv();

  const [, , recipientArg, amountArg] = process.argv;
  if (!recipientArg) {
    console.error(
      [
        '',
        'Использование:',
        '  node scripts/mint-tokens.mjs <WALLET_ADDRESS> [AMOUNT]',
        '',
        'Пример:',
        '  node scripts/mint-tokens.mjs 7xKX…gAsU 100',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  const mint = process.env.NEXT_PUBLIC_TEST_TOKEN_MINT;
  const secret = process.env.DEVNET_MINT_AUTHORITY_SECRET;
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

  if (!mint) {
    console.error('✗ NEXT_PUBLIC_TEST_TOKEN_MINT не задан. Выполните bash scripts/setup-devnet.sh');
    process.exit(1);
  }
  if (!secret) {
    console.error('✗ DEVNET_MINT_AUTHORITY_SECRET не задан (SETUP.md, шаг 5).');
    process.exit(1);
  }
  if (/mainnet/i.test(endpoint) && !/devnet|testnet/i.test(endpoint)) {
    console.error('✗ Скрипт работает только с devnet.');
    process.exit(1);
  }

  const amount = Number.parseInt(amountArg ?? '100', 10);
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error('✗ Сумма должна быть положительным числом.');
    process.exit(1);
  }

  const { Connection, Keypair, PublicKey } = await import('@solana/web3.js');
  const { getOrCreateAssociatedTokenAccount, mintTo } = await import('@solana/spl-token');

  let bytes;
  try {
    const parsed = JSON.parse(secret);
    bytes = Array.isArray(parsed) ? parsed : parsed.secretKey;
  } catch {
    console.error('✗ DEVNET_MINT_AUTHORITY_SECRET должен быть JSON-массивом байт.');
    process.exit(1);
  }

  if (!Array.isArray(bytes) || bytes.length !== 64) {
    console.error('✗ DEVNET_MINT_AUTHORITY_SECRET должен содержать 64 байта.');
    process.exit(1);
  }

  const authority = Keypair.fromSecretKey(Uint8Array.from(bytes));
  const connection = new Connection(endpoint, 'confirmed');
  const mintPubkey = new PublicKey(mint);

  console.log(`Mint:    ${mintPubkey.toBase58()}`);
  console.log(`Authority: ${authority.publicKey.toBase58()}`);
  console.log(`Получатель: ${recipientArg}`);
  console.log(`Сумма:  ${amount}\n`);

  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    mintPubkey,
    new PublicKey(recipientArg),
  );

  const signature = await mintTo(
    connection,
    authority,
    mintPubkey,
    tokenAccount.address,
    authority,
    BigInt(amount) * 10n ** 6n,
  );

  console.log(`\n✓ Токены наминтены`);
  console.log(`  Token account: ${tokenAccount.address.toBase58()}`);
  console.log(`  Signature:     ${signature}`);
  console.log(`  Explorer:      https://explorer.solana.com/tx/${signature}?cluster=devnet`);
}

main().catch((error) => {
  console.error(`\n✗ ${error?.message ?? error}\n`);
  process.exit(1);
});
