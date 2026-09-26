'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { AlertTriangle, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { PayButton } from '@/components/payment/PayButton';
import { WalletBalance } from '@/components/wallet/WalletBalance';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useGroup } from '@/lib/hooks/useGroup';
import { useRealtimePayments } from '@/lib/hooks/useRealtimePayments';
import { deriveMemberPDA, getEscrowAddress } from '@/lib/solana/anchor';
import { isProgramConfigured, requireTestTokenMint } from '@/lib/solana/constants';
import { formatMicro } from '@/lib/utils/format';

/**
 * Страница оплаты доли через Anchor-инструкцию `pay_share`.
 */
export function PayView({ groupId }: { groupId: string }) {
  const { publicKey } = useWallet();
  const { group, members, isLoading, error, reload } = useGroup(groupId);
  const { reload: reloadMembers } = useRealtimePayments(groupId);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  useEffect(() => {
    setWalletAddress(publicKey?.toBase58() ?? null);
  }, [publicKey]);

  const currentMember = useMemo(
    () => members.find((member) => member.guest_wallet === walletAddress),
    [members, walletAddress],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
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

  const escrowAddress = group.onchain_group_pda
    ? getEscrowAddress(new PublicKey(group.onchain_group_pda)).toBase58()
    : '—';

  if (!publicKey) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Подключите кошелёк</CardTitle>
          <CardDescription>
            Оплата доли подписывается вашим кошелёком — приложение не имеет доступа к
            приватным ключам.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Wallet className="h-8 w-8 text-solana-green" />
        </CardContent>
      </Card>
    );
  }

  if (group.status !== 'active') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Группа уже закрыта</CardTitle>
          <CardDescription>
            {group.status === 'settled'
              ? 'Счёт рассчитан, оплата больше не принимается.'
              : 'Группа отменена, средства возвращены участникам.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href={`/groups/${groupId}`}>Вернуться к группе</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!currentMember) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Вы не участник этой группы</CardTitle>
          <CardDescription>
            Ваш кошелёк <span className="font-mono">{walletAddress}</span> не найден среди
            участников. Присоединитесь по ссылке-приглашению, чтобы получить долю.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href={`/join/${group.invite_code}`}>Присоединиться</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (currentMember.status === 'paid') {
    return (
      <Card className="border-success/30 bg-success/[0.05]">
        <CardHeader>
          <CardTitle>Доля уже оплачена</CardTitle>
          <CardDescription>
            {formatMicro(currentMember.share_amount, group.currency)} отправлены в эскроу группы.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/groups/${groupId}`}>К группе</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href={`/groups/${groupId}/qr`}>Оплатить по QR</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!isProgramConfigured() || !group.onchain_group_pda) {
    return (
      <Card className="border-warning/30 bg-warning/[0.06]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            On-chain оплата недоступна
          </CardTitle>
          <CardDescription>
            Программа не задеплоена или группа создана только в базе. Выполните{' '}
            <code className="font-mono">anchor deploy</code> и создайте группу заново.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/groups/${groupId}`} className="text-xs text-muted-foreground hover:text-foreground">
          ← {group.name}
        </Link>
        <h2 className="mt-1 font-display text-2xl font-bold">Оплата доли</h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader>
            <CardTitle>Подтвердите оплату</CardTitle>
            <CardDescription>
              Инструкция <code className="font-mono text-foreground">pay_share</code> переведёт
              ровно вашу долю в эскроу группы и отметит оплату в смарт-контракте.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <p className="text-xs text-muted-foreground">К оплате</p>
              <p className="tabular font-display text-3xl font-bold">
                {formatMicro(currentMember.share_amount, group.currency, 6, 6)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {Number(currentMember.share_percentage || 0).toFixed(2)}% от счёта{' '}
                {formatMicro(group.total_amount, group.currency)}
              </p>
            </div>

            <PayButton
              groupId={groupId}
              groupPda={group.onchain_group_pda}
              groupName={group.name}
              escrowAddress={escrowAddress}
              memberId={currentMember.id}
              shareMicro={currentMember.share_amount}
              currency={group.currency}
              qrHref={`/groups/${groupId}/qr`}
              onPaid={async () => {
                await reload();
                await reloadMembers();
              }}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <WalletBalance />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Куда уходят деньги</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">Эскроу группы (ATA, owner — PDA программы):</p>
              <p className="break-all rounded-lg bg-background/60 p-2 font-mono text-[11px]">
                {escrowAddress}
              </p>
              <p className="text-muted-foreground">
                Токен: <span className="font-mono">tUSDC</span> · mint{' '}
                <span className="font-mono text-[11px]">
                  {requireTestTokenMintSafe()}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                Пока не оплатили все участники, эти токены не может снять никто, включая
                получателя.
              </p>
            </CardContent>
          </Card>

          {publicKey ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ваш on-chain статус</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                PDA участника:{' '}
                <span className="font-mono">
                  {deriveMemberPDA(new PublicKey(group.onchain_group_pda), publicKey)[0].toBase58()}
                </span>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function requireTestTokenMintSafe(): string {
  try {
    return requireTestTokenMint().toBase58();
  } catch {
    return 'не настроен';
  }
}

export default PayView;
