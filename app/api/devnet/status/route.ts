import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/solana/connection';
import { getProgramIdOrNull, getTestTokenMintOrNull, getRpcEndpoint, assertDevnetOnly } from '@/lib/solana/constants';
import { hasMintAuthority } from '@/lib/solana/airdrop';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import type { DevnetStatus } from '@/lib/solana/env-status';

export const dynamic = 'force-dynamic';

/**
 * Состояние серверной конфигурации для экрана настроек.
 *
 * Показывает, что именно сервер видит: mainnet-эндпоинты отсекаются, а
 * наличие mint authority проверяется на сервере (секрет клиенту не отдаётся).
 */
export async function GET() {
  const warnings: string[] = [];
  const endpoint = getRpcEndpoint();

  try {
    assertDevnetOnly(endpoint);
  } catch (error) {
    warnings.push((error as Error).message);
  }

  const connection = getConnection();
  let slot: number | null = null;
  let blockHeight: number | null = null;
  let rpcOnline = false;

  try {
    slot = await connection.getSlot();
    blockHeight = await connection.getBlockHeight();
    rpcOnline = true;
  } catch (error) {
    warnings.push(`Devnet RPC недоступен: ${(error as Error).message}`);
  }

  const supabaseConfigured = isSupabaseConfigured();
  if (!supabaseConfigured) warnings.push('Supabase не настроен — группы не сохраняются.');
  if (!process.env.NEXT_PUBLIC_PROGRAM_ID) {
    warnings.push('NEXT_PUBLIC_PROGRAM_ID не задан: on-chain расчёты недоступны.');
  }
  if (!getTestTokenMintOrNull()) {
    warnings.push('Mint tUSDC не создан: выполните npm run setup:devnet.');
  }
  if (!hasMintAuthority()) {
    warnings.push('DEVNET_MINT_AUTHORITY_SECRET не задан: раздача токенов из UI не работает.');
  }

  const payload: DevnetStatus = {
    network: 'devnet',
    rpcEndpoint: endpoint,
    rpcOnline,
    slot,
    blockHeight,
    programConfigured: getProgramIdOrNull() !== null,
    programId: getProgramIdOrNull()?.toBase58() ?? null,
    supabaseConfigured,
    tokenConfigured: getTestTokenMintOrNull() !== null,
    tokenMint: getTestTokenMintOrNull()?.toBase58() ?? null,
    mintAuthorityConfigured: hasMintAuthority(),
    faucetConfigured: Boolean(process.env.DEVNET_FAUCET_URL),
    warnings,
  };

  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
