'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { Ban, CheckCircle2, ExternalLink, Loader2, Radio } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { GroupDetail } from '@/components/groups/GroupDetail';
import { MemberList } from '@/components/groups/MemberList';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { TransactionStatus } from '@/components/payment/TransactionStatus';
import { useAnchorProgram } from '@/lib/hooks/useAnchorProgram';
import { useGroup } from '@/lib/hooks/useGroup';
import { useRealtimePayments } from '@/lib/hooks/useRealtimePayments';
import { useTransaction } from '@/lib/hooks/useTransaction';
import { deriveMemberPDA, getEscrowAddress, toGroupSummary } from '@/lib/solana/anchor';
import { isProgramConfigured } from '@/lib/solana/constants';
import { explorerAddressUrl, formatMicro, shortAddress } from '@/lib/utils/format';
import type { OnchainGroupSummary } from '@/lib/types/solana';
import type { GroupMember, GroupWithMembers } from '@/lib/types/database';

export function GroupView({ groupId }: { groupId: string }) {
  const { publicKey } = useWallet();
  const { user, supabase } = useSupabase();
  const { group, members, isLoading, error, reload } = useGroup(groupId);
  const { members: liveMembers, reload: reloadMembers } = useRealtimePayments(groupId);
  const { fetchGroup, settleGroup, cancelGroup, subscribeToGroupEvents, isReady } =
    useAnchorProgram();
  const { success, error: showError } = useToast();

  const [onchain, setOnchain] = useState<OnchainGroupSummary | null>(null);
  const [justPaidMemberId, setJustPaidMemberId] = useState<string | null>(null);
  const [isSettleOpen, setIsSettleOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [action, setAction] = useState<'settle' | 'cancel' | null>(null);

  const mergedMembers: GroupMember[] = useMemo(() => {
    if (liveMembers.length === 0) return members;
    return members.map((member) => liveMembers.find((live) => live.id === member.id) ?? member);
  }, [members, liveMembers]);

  const mergedGroup: GroupWithMembers | null = useMemo(
    () => (group ? { ...group, members: mergedMembers } : null),
    [group, mergedMembers],
  );

  const groupPda = group?.onchain_group_pda ?? null;

  // on-chain состояние
  const refreshOnchain = useCallback(async () => {
    if (!groupPda) return;
    try {
      const account = await fetchGroup(new PublicKey(groupPda));
      if (account) setOnchain(toGroupSummary(new PublicKey(groupPda), account));
    } catch {
      setOnchain(null);
    }
  }, [fetchGroup, groupPda]);

  useEffect(() => {
    void refreshOnchain();
  }, [refreshOnchain]);

  const settleTx = useTransaction(
    async () => {
      success('Группа рассчитана', 'Средства переведены получателю on-chain.');
      await supabase
        ?.from('groups')
        .update({ status: 'settled', settled_at: new Date().toISOString() })
        .eq('id', groupId);
      await reload();
      await refreshOnchain();
    },
    (message) => showError('Не удалось рассчитать группу', message),
  );

  const cancelTx = useTransaction(
    async () => {
      success('Группа отменена', 'Оплаченные доли возвращены участникам on-chain.');
      await supabase
        ?.from('groups')
        .update({ status: 'cancelled', settled_at: new Date().toISOString() })
        .eq('id', groupId);
      await supabase
        ?.from('group_members')
        .update({ status: 'cancelled' })
        .eq('group_id', groupId);
      await reload();
      await refreshOnchain();
    },
    (message) => showError('Не удалось отменить группу', message),
  );

  // Anchor-событие SharePaid — живой индикатор, что оплата прошла в сети.
  useEffect(() => {
    if (!groupPda) return;
    const pda = new PublicKey(groupPda);
    const unsubscribe = subscribeToGroupEvents(pda, (event) => {
      const member = mergedMembers.find((item) => item.guest_wallet === event.payer);
      if (member) setJustPaidMemberId(member.id);
      void refreshOnchain();
      void reloadMembers();
    });
    return unsubscribe;
  }, [groupPda, subscribeToGroupEvents, refreshOnchain, reloadMembers, mergedMembers]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (error || !mergedGroup) {
    return (
      <Card className="border-error/30 bg-error/[0.06]">
        <CardHeader>
          <CardTitle>Не удалось загрузить группу</CardTitle>
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

  const escrowAddress = groupPda
    ? getEscrowAddress(new PublicKey(groupPda)).toBase58()
    : '—';

  const isOwner = Boolean(user && mergedGroup.created_by === user.id);
  const paidCount = mergedMembers.filter((member) => member.status === 'paid').length;
  const canSettle =
    Boolean(onchain) && onchain?.status === 'active' && onchain.paidCount >= onchain.memberCount;
  const currentMember = publicKey
    ? mergedMembers.find((member) => member.guest_wallet === publicKey.toBase58())
    : undefined;

  const handleSettle = async () => {
    if (!groupPda) return;
    setIsSettleOpen(false);
    setAction('settle');
    await settleTx.run(async () => {
      const result = await settleGroup(new PublicKey(groupPda));
      return result;
    });
    setAction(null);
  };

  const handleCancel = async () => {
    if (!groupPda) return;
    setIsCancelOpen(false);
    setAction('cancel');

    // cancel_group требует PDA всех зарегистрированных участников —
    // программа проверяет, что список полный, иначе часть денег осталась бы в эскроу.
    const pda = new PublicKey(groupPda);
    const participantPdas = mergedMembers
      .filter((member) => member.guest_wallet)
      .map((member) => deriveMemberPDA(pda, new PublicKey(member.guest_wallet!))[0]);

    await cancelTx.run(() => cancelGroup(pda, participantPdas));
    setAction(null);
  };

  const activeTx = action === 'settle' ? settleTx : action === 'cancel' ? cancelTx : null;

  return (
    <div className="space-y-6">
      {onchain ? (
        <Card className="border-solana-green/25 bg-solana-green/[0.04]">
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
            <span className="flex items-center gap-1.5 font-medium text-solana-green">
              <Radio className="h-3.5 w-3.5" />
              on-chain
            </span>
            <span className="text-muted-foreground">
              статус: <span className="text-foreground">{onchain.status}</span>
            </span>
            <span className="text-muted-foreground">
              оплачено:{' '}
              <span className="tabular font-mono text-foreground">
                {onchain.paidCount}/{onchain.memberCount}
              </span>
            </span>
            <span className="text-muted-foreground">
              собрано:{' '}
              <span className="tabular font-mono text-foreground">
                {formatMicro(onchain.collectedAmount.toString(), mergedGroup.currency)}
              </span>
            </span>
            <a
              href={explorerAddressUrl(onchain.address)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              {shortAddress(onchain.address, 6, 6)} <ExternalLink className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>
      ) : isProgramConfigured() && groupPda ? (
        <Card className="border-warning/30 bg-warning/[0.04]">
          <CardContent className="p-4 text-sm text-warning">
            On-chain аккаунт группы недоступен. Проверьте, что программа задеплоена и PDA
            совпадает с <span className="font-mono">{shortAddress(groupPda, 8, 8)}</span>.
          </CardContent>
        </Card>
      ) : null}

      <GroupDetail group={mergedGroup} currentWallet={publicKey?.toBase58() ?? null}>
        {currentMember && currentMember.status === 'pending' ? (
          <Card className="border-solana-green/30 bg-solana-green/[0.05]">
            <CardHeader>
              <CardTitle>Ваша доля к оплате</CardTitle>
              <CardDescription>
                Оплата уйдёт в эскроу группы. Сумма фиксируется в смарт-контракте — изменить её
                после оплаты нельзя.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`/groups/${groupId}/pay`}>Оплатить долю</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/groups/${groupId}/qr`}>Оплатить по QR</Link>
              </Button>
            </CardContent>
          </Card>
        ) : currentMember ? (
          <Card>
            <CardHeader>
              <CardTitle>Вы оплатили свою долю</CardTitle>
              <CardDescription>
                Спасибо! Осталось ждать оплату остальных участников. Когда заплатят все, создатель
                сможет рассчитать группу.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MemberList
                members={mergedMembers}
                currency={mergedGroup.currency}
                currentWallet={publicKey?.toBase58() ?? null}
                justPaidMemberId={justPaidMemberId}
              />
            </CardContent>
          </Card>
        ) : null}

        {isOwner && mergedGroup.status === 'active' ? (
          <Card>
            <CardHeader>
              <CardTitle>Управление группой</CardTitle>
              <CardDescription>
                {canSettle
                  ? 'Все участники оплатили свои доли — можно перевести средства получателю.'
                  : `Оплачено ${paidCount} из ${mergedMembers.length}. Расчёт станет доступен, когда заплатят все.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => setIsSettleOpen(true)}
                  disabled={!canSettle || !isReady || mergedGroup.status !== 'active'}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Рассчитать группу
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsCancelOpen(true)}
                  disabled={!isReady || activeTx?.isBusy}
                >
                  <Ban className="h-4 w-4" />
                  Отменить и вернуть средства
                </Button>
              </div>

              {activeTx && activeTx.phase !== 'idle' ? (
                <TransactionStatus
                  phase={activeTx.phase}
                  signature={activeTx.signature}
                  error={activeTx.error}
                />
              ) : null}

              <p className="text-xs text-muted-foreground">
                Эскроу группы: <span className="font-mono">{escrowAddress}</span>
              </p>
            </CardContent>
          </Card>
        ) : null}
      </GroupDetail>

      <AlertDialog open={isSettleOpen} onOpenChange={setIsSettleOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Рассчитать группу?</AlertDialogTitle>
            <AlertDialogDescription>
              Средства из эскроу ({formatMicro(mergedGroup.total_amount, mergedGroup.currency)})
              будут переведены получателю. Действие необратимо.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void handleSettle(); }}>
              Рассчитать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isCancelOpen} onOpenChange={setIsCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отменить группу?</AlertDialogTitle>
            <AlertDialogDescription>
              Все оплаченные доли вернутся участникам on-chain. Группа станет закрытой, оплатить
              её будет нельзя.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void handleCancel(); }}>
              Отменить и вернуть
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {action ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Транзакция отправляется…
        </div>
      ) : null}
    </div>
  );
}

export default GroupView;
