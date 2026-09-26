import { Keypair, LAMPORTS_PER_SOL, PublicKey, type Connection } from '@solana/web3.js';
import { assertDevnetOnly, getRpcEndpoint, getTestTokenDecimals, requireTestTokenMint } from './constants';
import { getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import axios from 'axios';

/**
 * Серверные хелперы для devnet- faucet'а и минта тестовых токенов.
 * Только для devnet — ни один из них не может работать в mainnet.
 */

/** Keypair с mint authority tUSDC. Лежит только в env, никогда в репозитории. */
export function getMintAuthorityKeypair(): Keypair {
  const raw = process.env.DEVNET_MINT_AUTHORITY_SECRET;
  if (!raw) {
    throw new Error(
      'DEVNET_MINT_AUTHORITY_SECRET не задан. См. SETUP.md, шаг 5: создайте keypair и передайте ему mint authority.',
    );
  }

  let bytes: number[];
  try {
    const parsed = JSON.parse(raw) as number[] | { secretKey: number[] };
    bytes = Array.isArray(parsed) ? parsed : parsed.secretKey;
  } catch {
    throw new Error('DEVNET_MINT_AUTHORITY_SECRET должен быть JSON-массивом байт');
  }

  if (!Array.isArray(bytes) || bytes.length !== 64) {
    throw new Error('DEVNET_MINT_AUTHORITY_SECRET должен содержать ровно 64 байта');
  }
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

export function hasMintAuthority(): boolean {
  return Boolean(process.env.DEVNET_MINT_AUTHORITY_SECRET);
}

/** Минтит tUSDC на указанный адрес. */
export async function mintTestTokens(
  connection: Connection,
  recipient: PublicKey,
  amount: number,
) {
  assertDevnetOnly(connection.rpcEndpoint);
  const authority = getMintAuthorityKeypair();
  const mint = requireTestTokenMint();
  const decimals = getTestTokenDecimals();

  const tokenAccount = await getOrCreateAssociatedTokenAccount(connection, authority, mint, recipient);

  const signature = await mintTo(
    connection,
    authority,
    mint,
    tokenAccount.address,
    authority,
    BigInt(amount) * 10n ** BigInt(decimals),
  );

  return {
    signature,
    amount,
    recipient: recipient.toBase58(),
    tokenAccount: tokenAccount.address.toBase58(),
  };
}

/**
 * Airdrop SOL. Сначала пробуем RPC-метод; если он заблокирован
 * (лимит или региональные ограничения) — используем faucet.solana.com.
 */
export async function airdropSol(connection: Connection, to: PublicKey, sol = 1): Promise<{
  signature: string;
  sol: number;
  source: 'rpc' | 'faucet';
}> {
  assertDevnetOnly(connection.rpcEndpoint);
  const lamports = Math.round(sol * LAMPORTS_PER_SOL);

  try {
    const signature = await connection.requestAirdrop(to, lamports);
    const latest = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
    return { signature, sol, source: 'rpc' };
  } catch (rpcError) {
    const faucetUrl = process.env.DEVNET_FAUCET_URL?.trim();
    if (!faucetUrl) {
      throw new Error(
        `Airdrop через RPC недоступен: ${(rpcError as Error).message}. Укажите DEVNET_FAUCET_URL в .env.local.`,
      );
    }

    const response = await axios.post(faucetUrl, { address: to.toBase58() });
    const signature =
      (response.data as { signature?: string; transaction?: string }).signature ??
      (response.data as { transaction?: string }).transaction;

    if (!signature) {
      throw new Error('Faucet не вернул подпись транзакции');
    }
    return { signature, sol, source: 'faucet' };
  }
}

/** Быстрая проверка, что кластер живой и это именно devnet. */
export async function checkDevnetHealth(connection: Connection) {
  const endpoint = getRpcEndpoint();
  assertDevnetOnly(endpoint);
  const [slot, blockHeight] = await Promise.all([
    connection.getSlot(),
    connection.getBlockHeight(),
  ]);
  return { endpoint, slot, blockHeight };
}
