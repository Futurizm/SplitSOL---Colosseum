'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { CheckCircle2, Loader2, UserPlus, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { useAnchorProgram } from '@/lib/hooks/useAnchorProgram';
import { useTransaction } from '@/lib/hooks/useTransaction';
import { isProgramConfigured, isTestTokenConfigured } from '@/lib/solana/constants';
import { formatMicro, fromMicroUnits, toMicroUnits } from '@/lib/utils/format';
import { getTestTokenDecimals } from '@/lib/solana/constants';
import { isValidInviteCode } from '@/lib/utils/invite';
import type { GroupMember, GroupWithMembers } from '@/lib/types/database';

/**
 * Присоединение к группе по invite-коду.
 *
 * Шаги: посмотреть счёт → выбрать долю (по умолчанию — остаток, делённый поровну) →
 * on-chain `join_group` → запись в БД → переход к оплате.
 */
export function JoinView({ code }: { code: string }) {
  const router = useRouter();
  const { publicKey } = useWallet();
  const { supabase, user } = useSupabase();
  const { joinGroup, isReady } = useAnchorProgram();
  const { success, error: showError } = useToast();

  const normalized = code.trim().toUpperCase();
  const isCodeValid = isValidInviteCode(normalized);

  const [group, setGroup] = useState<GroupWithMembers | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shareAmount, setShareAmount] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!supabase || !isCodeValid) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);

      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('invite_code', normalized)
        .maybeSingle();

      if (!active) return;
      if (error || !data) {
        setLoadError(error?.message ?? 'Группа с таким кодом не найдена');
        setIsLoading(false);
        return;
      }

      setGroup(data as GroupWithMembers);

      const { data: memberRows } = await supabase
        .from('group_members')
        .select('*')
        .eq('group_id', data.id)
        .order('joined_at', { ascending: true });

      if (!active) return;
      const rows = (memberRows ?? []) as GroupMember[];
      setMembers(rows);

      // Доля по умолчанию: остаток счёта, делённый на количество свободных мест.
      const total = BigInt(data.total_amount || '0');
      const committed = rows.reduce((sum, member) => sum + BigInt(member.share_amount || '0'), 0n);
      const remaining = total > committed ? total - committed : 0n;
      const freeSlots = Math.max(1, data.member_count ?? rows.length + 1) - rows.length;
      const perSlot = remaining / BigInt(freeSlots);

      setShareAmount(fromMicroUnits(perSlot.toString(), getTestTokenDecimals()).toFixed(6));
      setIsLoading(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, [supabase, normalized, isCodeValid]);

  const committedMicro = useMemo(
    () => members.reduce((sum, member) => sum + BigInt(member.share_amount || '0'), 0n),
    [members],
  );

  const remainingMicro = useMemo(() => {
    if (!group) return 0n;
    const total = BigInt(group.total_amount || '0');
    return total > committedMicro ? total - committedMicro : 0n;
  }, [group, committedMicro]);

  const shareMicro = useMemo(() => {
    try {
      return toMicroUnits(shareAmount || '0', getTestTokenDecimals());
    } catch {
      return 0n;
    }
  }, [shareAmount]);

  const alreadyMember = members.some(
    (member) => member.guest_wallet === publicKey?.toBase58() || member.user_id === user?.id,
  );

  const handleJoin = async () => {
    if (!supabase || !group || !publicKey || !group.onchain_group_pda) return;

    const result = await joinTx.run(async () => {
      const onchain = await joinGroup(new PublicKey(group.onchain_group_pda!), shareMicro);

      const newCommitted = committedMicro + shareMicro;
      const percentage =
        newCommitted === 0n
          ? 0
          : Number((shareMicro * 1_000_000n) / newCommitted) / 10_000;

      const { error } = await supabase.from('group_members').insert({
        group_id: group.id,
        user_id: user?.id ?? null,
        guest_name:
          (user?.user_metadata?.display_name as string) ??
          `Гость ${publicKey.toBase58().slice(0, 4)}`,
        guest_wallet: publicKey.toBase58(),
        share_amount: shareMicro.toString(),
        share_percentage: percentage.toFixed(2),
        status: 'pending',
        role: 'member',
        onchain_member_pda: onchain.memberPda.toBase58(),
      });

      if (error) throw new Error(error.message);

      await supabase.from('activity_feed').insert({
        group_id: group.id,
        user_id: user?.id ?? null,
        action: 'joined',
        metadata: { wallet: publicKey.toBase58(), share: shareMicro.toString() },
      });

      return onchain;
    });

    if (result) {
      success('Вы присоединились', 'Оплатите свою долю — статус увидят все участники.');
      router.push(`/groups/${group.id}/pay`);
    }
  };

  const joinTx = useTransaction(undefined, (message) => showError('Не удалось присоединиться', message));

  if (!isCodeValid) {
    return (
      <Card className="border-error/30 bg-error/[0.06]">
        <CardHeader>
          <CardTitle>Некорректный код приглашения</CardTitle>
          <CardDescription>
            Код состоит из 4–16 латинских букв и цифр. Проверьте ссылку, по которой вас
            пригласили.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/groups">К списку групп</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем группу…
        </CardContent>
      </Card>
    );
  }

  if (loadError || !group) {
    return (
      <Card className="border-error/30 bg-error/[0.06]">
        <CardHeader>
          <CardTitle>Группа не найдена</CardTitle>
          <CardDescription>{loadError ?? `Код ${normalized} не найден`}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/groups">К списку групп</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (group.status !== 'active') {
    return (
      <Card className="border-warning/30 bg-warning/[0.06]">
        <CardHeader>
          <CardTitle>Группа уже закрыта</CardTitle>
          <CardDescription>
            {group.status === 'settled'
              ? 'Счёт рассчитан, присоединиться уже нельзя.'
              : 'Группа отменена.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href={`/groups/${group.id}`}>Открыть группу</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (alreadyMember) {
    return (
      <Card className="border-success/30 bg-success/[0.05]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Вы уже в группе
          </CardTitle>
          <CardDescription>Можно перейти к оплате своей доли.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href={`/groups/${group.id}/pay`}>Оплатить долю</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!publicKey) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Подключите кошелёк
          </CardTitle>
          <CardDescription>
            Доля регистрируется on-chain инструкцией <code className="font-mono">join_group</code> —
            без кошелька это невозможно.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            В Phantom обязательно включите Testnet Mode — приложение работает только на devnet.
          </p>
        </CardContent>
      </Card>
    );
  }

  const canJoin =
    isProgramConfigured() &&
    isTestTokenConfigured() &&
    Boolean(group.onchain_group_pda) &&
    isReady &&
    shareMicro > 0n &&
    shareMicro <= remainingMicro &&
    members.length < 10;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{group.name}</CardTitle>
        <CardDescription>
          Счёт {formatMicro(group.total_amount, group.currency)} · осталось распределить{' '}
          {formatMicro(remainingMicro.toString(), group.currency)} · участников: {members.length}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="share">Ваша доля</Label>
          <div className="relative">
            <Input
              id="share"
              value={shareAmount}
              onChange={(event) => setShareAmount(event.target.value)}
              inputMode="decimal"
              className="pr-16 font-mono"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              tUSDC
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Доля фиксируется в смарт-контракте и участвует в расчёте — изменить её после
            присоединения нельзя.
          </p>
        </div>

        {shareMicro > remainingMicro ? (
          <p className="rounded-lg border border-error/30 bg-error/10 p-3 text-xs text-error">
            Доля больше остатка счёта ({formatMicro(remainingMicro.toString(), group.currency)}).
          </p>
        ) : null}

        {members.length >= 10 ? (
          <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
            В группе уже максимум участников (10) — ограничение Anchor-программы.
          </p>
        ) : null}

        {joinTx.error ? (
          <p className="rounded-lg border border-error/30 bg-error/10 p-3 text-xs text-error">
            {joinTx.error}
          </p>
        ) : null}

        <Button
          className="w-full"
          onClick={() => void handleJoin()}
          disabled={!canJoin}
          loading={joinTx.isBusy}
        >
          <UserPlus className="h-4 w-4" />
          Присоединиться к группе
        </Button>
      </CardContent>

      <CardFooter className="justify-center">
        <p className="text-xs text-muted-foreground">
          Присоединяясь, вы принимаете долю, зафиксированную в смарт-контракте.
        </p>
      </CardFooter>
    </Card>
  );
}

export default JoinView;
