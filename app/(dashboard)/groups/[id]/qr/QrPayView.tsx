'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { QRCodeDisplay } from '@/components/payment/QRCodeDisplay';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useGroup } from '@/lib/hooks/useGroup';
import { createReferenceKeypair, buildPaymentUrl, toWalletDeeplink } from '@/lib/solana/pay';
import { getEscrowAddress } from '@/lib/solana/anchor';
import { isTestTokenConfigured, requireTestTokenMint } from '@/lib/solana/constants';
import { formatMicro } from '@/lib/utils/format';
import type { TransactionVerification } from '@/lib/types/solana';

/**
 * Оплата доли через Solana Pay (QR / deeplink).
 *
 * Транзакцию подписывает кошелёк получателя, поэтому сервер не может отправить
 * токены за него: после оплаты пользователь отправляет подпись на верификацию,
 * а сервер сверяет её с on-chain состоянием.
 */
export function QrPayView({ groupId }: { groupId: string }) {
  const params = useSearchParams();
  const { publicKey } = useWallet();
  const { group, members, isLoading, error, reload } = useGroup(groupId);
  const { success, error: showError, info } = useToast();

  const memberId = params.get('member');
  const [referenceKey, setReferenceKey] = useState<string | null>(null);
  const [signature, setSignature] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verification, setVerification] = useState<TransactionVerification | null>(null);

  const member = useMemo(
    () => members.find((item) => item.id === memberId) ?? null,
    [members, memberId],
  );

  // reference-ключ должен быть один на платёж: генерируем один раз на компонент.
  useEffect(() => {
    setReferenceKey(createReferenceKeypair().publicKey.toBase58());
  }, []);

  const paymentUrl = useMemo(() => {
    if (!group?.onchain_group_pda || !member) return null;
    try {
      const escrow = getEscrowAddress(new PublicKey(group.onchain_group_pda));
      return buildPaymentUrl({
        recipient: escrow,
        amount: formatMicro(member.share_amount, group.currency, 6, 6),
        reference: referenceKey ? new PublicKey(referenceKey) : null,
        label: `SplitSOL · ${group.name}`,
        message: `Оплата доли ${formatMicro(member.share_amount, group.currency)}`,
        memo: group.id,
      });
    } catch {
      return null;
    }
  }, [group, member, referenceKey]);

  const verify = useCallback(async () => {
    if (!group || !member || !signature.trim()) return;
    setIsVerifying(true);
    setVerification(null);

    try {
      const response = await fetch('/api/transactions/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature: signature.trim(),
          groupId: group.id,
          memberId: member.id,
          senderWallet: publicKey?.toBase58(),
        }),
      });

      const payload = (await response.json()) as {
        success: boolean;
        verification?: TransactionVerification;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? 'Верификация не пройдена');
      }

      setVerification(payload.verification ?? null);
      success('Платёж подтверждён', 'Статус участника обновлён, остальные видят оплату.');
      await reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showError('Платёж не подтверждён', message);
    } finally {
      setIsVerifying(false);
    }
  }, [group, member, signature, publicKey, success, showError, reload]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !group) {
    return (
      <Card className="border-error/30 bg-error/[0.06]">
        <CardHeader>
          <CardTitle>Группа недоступна</CardTitle>
          <CardDescription>{error ?? 'Группа не найдена'}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/groups">К списку групп</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!isTestTokenConfigured()) {
    return (
      <Card className="border-warning/30 bg-warning/[0.06]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Токен tUSDC не создан
          </CardTitle>
          <CardDescription>
            Solana Pay требует mint. Выполните <code className="font-mono">npm run setup:devnet</code>{' '}
            и перезапустите dev-сервер.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!member) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Выберите свою долю</CardTitle>
          <CardDescription>
            Откройте QR из списка участников на странице группы — там будет нужный код.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href={`/groups/${groupId}`}>К группе</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (member.status === 'paid') {
    return (
      <Card className="border-success/30 bg-success/[0.05]">
        <CardHeader>
          <CardTitle>Доля уже оплачена</CardTitle>
          <CardDescription>
            {formatMicro(member.share_amount, group.currency)} в эскроу группы.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href={`/groups/${groupId}`}>К группе</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/groups/${groupId}`} className="text-xs text-muted-foreground hover:text-foreground">
          ← {group.name}
        </Link>
        <h2 className="mt-1 font-display text-2xl font-bold">Оплата по QR</h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {paymentUrl ? (
          <QRCodeDisplay
            url={paymentUrl.toString()}
            deeplink={toWalletDeeplink(paymentUrl)}
            amountLabel={formatMicro(member.share_amount, group.currency, 6, 6)}
            title="Наведите камеру"
            description="Кошелёк подставит mint tUSDC и сумму вашей доли."
          />
        ) : (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Не удалось собрать ссылку платежа. Проверьте, что on-chain аккаунт группы создан.
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Как оплатить</CardTitle>
              <CardDescription>Три шага — App не может подписать транзакцию за вас.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ol className="space-y-2 text-sm">
                <li className="flex gap-2">
                  <span className="text-solana-green">1.</span>
                  Откройте ссылку в кошельке на <b>devnet</b> (Phantom → Testnet Mode).
                </li>
                <li className="flex gap-2">
                  <span className="text-solana-green">2.</span>
                  Проверьте, что токен — tUSDC, сумма — ваша доля, получатель — escrow группы.
                </li>
                <li className="flex gap-2">
                  <span className="text-solana-green">3.</span>
                  Подпишите перевод и вставьте подпись транзакции в поле ниже.
                </li>
              </ol>

              <p className="flex items-start gap-2 rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                tUSDC имеет 6 знаков после запятой, а кошельки округляют сумму через float —
                платёж может прийти на 1 micro-unit (&lt; 0.000001 tUSDC) меньше. Верификация это
                допускает; точный путь — оплата кнопкой на странице группы.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Подтвердите оплату</CardTitle>
              <CardDescription>
                Вставьте подпись (signature) из кошелька или Explorer — сервер проверит её в сети.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                value={signature}
                onChange={(event) => setSignature(event.target.value)}
                placeholder="5VfX…base58 подпись транзакции"
                rows={3}
                className="w-full rounded-lg border border-input bg-background/60 p-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-solana-purple"
                aria-label="Подпись транзакции"
              />

              <Button onClick={() => void verify()} disabled={!signature.trim() || isVerifying} loading={isVerifying}>
                Проверить платёж
              </Button>

              {verification ? (
                <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
                  <p className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    Платёж подтверждён
                  </p>
                  {verification.amount !== undefined ? (
                    <p className="mt-1 font-mono text-xs">
                      переведено {verification.amount.toString()} micro-tUSDC
                    </p>
                  ) : null}
                </div>
              ) : null}

              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">
                  Где взять подпись?
                </summary>
                <p className="mt-1">
                  В кошельке сразу после подтверждения, либо в Solana Explorer → Transactions по
                  адресу вашего кошелька (mint {requireTestTokenMint().toBase58().slice(0, 8)}…).
                </p>
              </details>

              <Button variant="ghost" size="sm" onClick={() => info('QR и кнопка', 'Оба способа ведут в один эскроу. Разница только в том, кто подписывает транзакцию.')}>
                Чем этот способ отличается от кнопки?
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default QrPayView;
