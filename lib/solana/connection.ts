import { Connection } from '@solana/web3.js';
import { COMMITMENT, SOLANA_CLUSTER, createConnection, getRpcEndpoint } from './constants';

/**
 * Единственная точка создания Solana-соединений в приложении.
 * Клиентские компоненты берут `connection` из `useConnection()` (wallet-adapter),
 * серверные — отсюда.
 */

let cached: Connection | null = null;

export function getConnection(endpoint: string = getRpcEndpoint()): Connection {
  if (endpoint === getRpcEndpoint() && cached) return cached;
  const connection = createConnection(endpoint);
  if (endpoint === getRpcEndpoint()) cached = connection;
  return connection;
}

/** Соединение для Server Components / Route Handlers. */
export function getServerConnection(): Connection {
  return getConnection();
}

/** Соединение для клиентских компонентов вне wallet-adapter provider'а. */
export function getClientConnection(): Connection {
  return getConnection();
}

export { SOLANA_CLUSTER, COMMITMENT };
export type { Connection };
