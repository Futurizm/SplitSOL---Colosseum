'use client';

import { Check, Copy, ExternalLink, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';

export interface QRCodeDisplayProps {
  /** Ссылка Solana Pay, которая будет закодирована в QR. */
  url: string;
  title?: string;
  description?: string;
  /** Открывать кошелёк по нажатию на QR. */
  deeplink?: string;
  amountLabel?: string;
  size?: number;
}

/**
 * QR-код Solana Pay.
 *
 * В QR кодируется чистая ссылка (`solana:...`), а по клику открывается deeplink
 * `solana:solana:...` — так кошелёк сразу предлагает перевод в tUSDC.
 */
export function QRCodeDisplay({
  url,
  title = 'Оплатить по QR',
  description,
  deeplink,
  amountLabel,
  size = 260,
}: QRCodeDisplayProps) {
  const [copied, setCopied] = useState(false);
  const { success } = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      success('Ссылка скопирована', 'Отправьте её участнику группы или откройте на телефоне.');
    } catch {
      success('Не удалось скопировать', 'Выделите ссылку вручную.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-4 w-4 text-solana-green" />
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {amountLabel ? (
          <p className="tabular font-display text-3xl font-bold">{amountLabel}</p>
        ) : null}

        <a
          href={deeplink ?? url}
          className="rounded-2xl bg-white p-4 transition-transform hover:scale-[1.02]"
          aria-label="Открыть в кошельке"
        >
          <QRCodeSVG
            value={url}
            size={size}
            bgColor="#ffffff"
            fgColor="#0A0A0F"
            level="M"
            includeMargin
          />
        </a>

        <p className="max-w-xs text-center text-xs text-muted-foreground">
          Наведите камеру телефона или откройте ссылку в кошельке на devnet. Токен —{' '}
          <span className="font-semibold text-foreground">tUSDC</span>.
        </p>

        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => void copy()}>
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Скопировано' : 'Скопировать ссылку'}
          </Button>
          <Button asChild variant="ghost" size="sm" className="flex-1">
            <a href={url} target="_blank" rel="noreferrer">
              Открыть ссылку
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default QRCodeDisplay;
