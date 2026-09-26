/** Ответ `/api/devnet/status` — состояние серверной конфигурации. */
export interface DevnetStatus {
  /** Сеть зафиксирована на devnet. */
  network: 'devnet';
  rpcEndpoint: string;
  rpcOnline: boolean;
  slot: number | null;
  blockHeight: number | null;
  programConfigured: boolean;
  programId: string | null;
  supabaseConfigured: boolean;
  tokenConfigured: boolean;
  tokenMint: string | null;
  /** На сервере задан DEVNET_MINT_AUTHORITY_SECRET. */
  mintAuthorityConfigured: boolean;
  /** Задан ли faucet-URL для airdrop SOL. */
  faucetConfigured: boolean;
  /** Человекочитаемые предупреждения. */
  warnings: string[];
}
