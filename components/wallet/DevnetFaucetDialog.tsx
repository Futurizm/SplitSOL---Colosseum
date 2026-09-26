'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { Coins, ExternalLink, Gift, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useDevnetAirdrop } from '@/lib/hooks/useDevnetAirdrop';
import { WalletBalance } from './WalletBalance';
import {
  DEVNET_AIRDROP_SOL,
  DEVNET_TOKEN_AIRDROP_AMOUNT,
  getTestTokenSymbol,
  isTestTokenConfigured,
} from '@/lib/solana/constants';
import { explorerTxUrl } from '@/lib/utils/format';

/**
 * Окно «Получить тестовые токены».
 *
 * На devnet всё бесплатно: SOL и tUSDC нужны, чтобы потрогать полный флоу
 * оплаты. tUSDC минтит серверный клюpair с mint authority.
 */
export function DevnetFaucetDialog() {
  const [open, setOpen] = useState(false);
  const { publicKey } = useWallet();
  const { requestSol, requestTokens, isRequestingSol, isRequestingTokens } = useDevnetAirdrop();
  const { success, error: showError, info } = useToast();

  const handle = async (kind: 'sol' | 'tokens') => {
    try {
      const signature =
        kind === 'sol' ? await requestSol() : await requestTokens(DEVNET_TOKEN_AIRDROP_AMOUNT);
      success(
        kind === 'sol' ? 'SOL получены' : `${getTestTokenSymbol()} получены`,
        <a
          href={explorerTxUrl(signature)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 underline"
        >
          {signature.slice(0, 12)}… <ExternalLink className="h-3 w-3" />
        </a>,
      );
    } catch (err) {
      showError('Не удалось получить тестовые токены', (err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="hidden md:inline-flex">
          <Gift className="h-4 w-4" />
          Тестовые токены
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Devnet-фасадка</DialogTitle>
          <DialogDescription>
            На devnet всё бесплатно. Нажмите кнопку — сервер отправит SOL для комиссий и
            минтит {DEVNET_TOKEN_AIRDROP_AMOUNT} {getTestTokenSymbol()} на ваш кошелёк.
          </DialogDescription>
        </DialogHeader>

        {!publicKey ? (
          <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
            Сначала подключите кошелёк — адрес нужен для отправки токенов.
          </p>
        ) : (
          <WalletBalance />
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            variant="gradient"
            onClick={() => void handle('tokens')}
            disabled={!publicKey || isRequestingTokens || !isTestTokenConfigured()}
            loading={isRequestingTokens}
          >
            {!isRequestingTokens ? <Coins className="h-4 w-4" /> : <Loader2 className="h-4 w-4" />}
            {DEVNET_TOKEN_AIRDROP_AMOUNT} {getTestTokenSymbol()}
          </Button>

          <Button
            variant="outline"
            onClick={() => void handle('sol')}
            disabled={!publicKey || isRequestingSol}
            loading={isRequestingSol}
          >
            {DEVNET_AIRDROP_SOL} SOL
          </Button>
        </div>

        {!isTestTokenConfigured() ? (
          <p className="text-xs text-warning">
            Mint tUSDC не настроен. Создайте токен командой{' '}
            <code className="font-mono">npm run setup:devnet</code> и перезапустите dev-сервер.
          </p>
        ) : (
          <Badge variant="warning" className="w-fit">
            Токены бесплатные и ничего не стоят
          </Badge>
        )}

        <Button variant="ghost" size="sm" onClick={() => info('Подсказка', 'Airdrop обычно занимает 10–30 секунд.')}>
          Что дальше?
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default DevnetFaucetDialog;
