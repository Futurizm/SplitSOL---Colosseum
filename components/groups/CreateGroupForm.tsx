'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useWallet } from '@solana/wallet-adapter-react';
import { Loader2, Rocket, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { PublicKey } from '@solana/web3.js';
import { useAnchorProgram } from '@/lib/hooks/useAnchorProgram';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SplitCalculator } from './SplitCalculator';
import { groupIdBytesFromUuid } from '@/lib/solana/anchor';
import { isProgramConfigured, isTestTokenConfigured } from '@/lib/solana/constants';
import { calculateSplit, type SplitMethod, type SplitParticipant } from '@/lib/utils/split';
import { groupFormSchema, MAX_MEMBERS, type GroupFormValues } from '@/lib/utils/validation';
import { toMicroUnits } from '@/lib/utils/format';
import { generateInviteCode } from '@/lib/utils/invite';
import type { GroupCategory } from '@/lib/types/database';

const CATEGORIES: { value: GroupCategory; label: string }[] = [
  { value: 'restaurant', label: '🍜 Ресторан / кафе' },
  { value: 'travel', label: '✈️ Поездка' },
  { value: 'shopping', label: '🛍 Покупки' },
  { value: 'other', label: '📦 Другое' },
];

/**
 * Создание группы: форма + калькулятор разделения + on-chain вызов
 * `createGroup`. Сначала создаётся on-chain аккаунт (источник истины по деньгам),
 * затем запись в Supabase.
 */
export function CreateGroupForm() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const { user, supabase } = useSupabase();
  const { createGroup, isReady, unavailableReason } = useAnchorProgram();
  const { success, error: showError, info } = useToast();

  const [method, setMethod] = useState<SplitMethod>('equal');
  const [participants, setParticipants] = useState<SplitParticipant[]>([
    { id: 'p-1', label: 'Создатель', weight: 1, wallet: publicKey?.toBase58() },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    mode: 'onBlur',
    defaultValues: {
      name: '',
      description: '',
      category: 'restaurant',
      totalAmount: '',
      recipient: '',
    },
  });

  const totalAmount = watch('totalAmount');
  const recipient = watch('recipient');

  const split = useMemo(
    () => calculateSplit(totalAmount || '0', method, participants),
    [totalAmount, method, participants],
  );

  // Создатель — первый участник; его кошелёк подставляем автоматически.
  const participantsWithWallets = useMemo(
    () =>
      participants.map((person, index) =>
        index === 0 && publicKey ? { ...person, wallet: publicKey.toBase58() } : person,
      ),
    [participants, publicKey],
  );

  const canSubmit = Boolean(publicKey) && isReady && split.isBalanced && !isSubmitting;

  const onSubmit = handleSubmit(async () => {
    if (!supabase || !user || !publicKey) {
      setServerError('Нужны авторизация и подключённый кошелёк.');
      return;
    }
    if (!isTestTokenConfigured()) {
      setServerError('Mint tUSDC не настроен — выполните npm run setup:devnet.');
      return;
    }

    setIsSubmitting(true);
    setServerError(null);

    try {
      const totalMicro = toMicroUnits(totalAmount);
      const ownerShare = split.lines[0]?.micro ?? 0n;
      const inviteCode = generateInviteCode();
      const groupUuid = crypto.randomUUID();

      // 1. on-chain аккаунт группы — источник истины по деньгам.
      const onchain = await createGroup({
        groupIdBytes: groupIdBytesFromUuid(groupUuid),
        totalAmount: totalMicro,
        ownerShare,
        memberCount: participants.length,
        recipient: new PublicKey(recipient.trim()),
      });

      // 2. Запись в БД. Доли храним в micro-единицах.
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert({
          id: groupUuid,
          name: watch('name'),
          description: watch('description') || null,
          category: watch('category'),
          total_amount: totalMicro.toString(),
          currency: 'tUSDC',
          status: 'active',
          invite_code: inviteCode,
          restaurant_wallet: recipient.trim(),
          created_by: user.id,
          onchain_group_pda: onchain.groupPda.toBase58(),
        })
        .select()
        .single();

      if (groupError) throw new Error(groupError.message);

      const memberRows = split.lines.map((line, index) => {
        const person = participantsWithWallets[index];
        return {
          group_id: groupUuid,
          user_id: index === 0 ? user.id : null,
          guest_name: index === 0 ? (user.user_metadata?.display_name as string) ?? 'Создатель' : person?.label,
          guest_wallet: person?.wallet ?? null,
          share_amount: line.micro.toString(),
          share_percentage: line.percentage.toFixed(2),
          status: 'pending' as const,
          role: index === 0 ? ('owner' as const) : ('member' as const),
        };
      });

      const { error: membersError } = await supabase.from('group_members').insert(memberRows);
      if (membersError) throw new Error(membersError.message);

      await supabase.from('activity_feed').insert({
        group_id: groupUuid,
        user_id: user.id,
        action: 'created',
        metadata: { name: watch('name'), onchain: onchain.groupPda.toBase58() },
      });

      success(
        'Группа создана on-chain',
        `Эскроу открыт, участников: ${participants.length}. Ссылка-приглашение готова.`,
      );
      router.push(`/groups/${group.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setServerError(message);
      showError('Не удалось создать группу', message);
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>О счёте</CardTitle>
            <CardDescription>
              Название, категория и сумма. Сумма попадёт в смарт-контракт как есть — в
              micro-единицах.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Название</Label>
              <Input
                id="name"
                placeholder="Ужин в Astana"
                {...register('name')}
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name ? (
                <p className="text-xs text-error">{String(errors.name.message)}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Описание (необязательно)</Label>
              <Textarea
                id="description"
                placeholder="Счёт за ужин, делим поровну"
                {...register('description')}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Категория</Label>
                <Select
                  value={watch('category')}
                  onValueChange={(value) => setValue('category', value as GroupCategory)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="totalAmount">Сумма счёта</Label>
                <div className="relative">
                  <Input
                    id="totalAmount"
                    inputMode="decimal"
                    placeholder="120.00"
                    className="pr-16 font-mono"
                    {...register('totalAmount')}
                    aria-invalid={Boolean(errors.totalAmount)}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    tUSDC
                  </span>
                </div>
                {errors.totalAmount ? (
                  <p className="text-xs text-error">{String(errors.totalAmount.message)}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="recipient">Кошелёк получателя (ресторан / организатор)</Label>
              <Input
                id="recipient"
                placeholder="Адрес Solana, который получит средства при расчёте"
                className="font-mono text-xs"
                {...register('recipient')}
                aria-invalid={Boolean(errors.recipient)}
              />
              {errors.recipient ? (
                <p className="text-xs text-error">{String(errors.recipient.message)}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Средства попадут сюда только после того, как оплатят все участники.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <SplitCalculator
          total={totalAmount || '0'}
          currency="tUSDC"
          method={method}
          onMethodChange={setMethod}
          participants={participantsWithWallets}
          onParticipantsChange={setParticipants}
        />
      </div>

      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Готово к запуску</CardTitle>
            <CardDescription>Что произойдёт при создании</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm">
              {[
                'Откроется PDA-аккаунт группы в Anchor-программе',
                'Создатся escrow-токен-аккаунт и доля создателя',
                'Группа появится в Supabase для интерфейса',
                'Вы получите ссылку-приглашение и QR-код',
              ].map((text) => (
                <li key={text} className="flex gap-2 text-muted-foreground">
                  <span className="text-solana-green">✓</span>
                  {text}
                </li>
              ))}
            </ul>

            {serverError ? (
              <p className="rounded-lg border border-error/30 bg-error/10 p-3 text-xs text-error">
                {serverError}
              </p>
            ) : null}

            {unavailableReason && !publicKey ? (
              <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                {unavailableReason}
              </p>
            ) : null}

            {!isProgramConfigured() ? (
              <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                Anchor-программа не задеплоена: выполните <code className="font-mono">anchor deploy</code>{' '}
                и задайте <code className="font-mono">NEXT_PUBLIC_PROGRAM_ID</code>.
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={!canSubmit} loading={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4" />
              )}
              Создать группу on-chain
            </Button>

            <p className="text-center text-[11px] text-muted-foreground">
              Комиссия группы не взимается. Требуется немного SOL на комиссию транзакции.
            </p>

            {participants.length > MAX_MEMBERS ? (
              <p className="text-xs text-error">Максимум {MAX_MEMBERS} участников.</p>
            ) : null}
          </CardContent>
        </Card>

        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => {
            info(
              'Как работает расчёт',
              'Пока группа активна, все токены лежат в escrow-аккаунте, доступа к которому нет ни у кого, кроме программы. Средства уходят получателю только после оплаты всех долей.',
            );
          }}
        >
          <Wallet className="h-4 w-4" />
          Как устроен эскроу
        </Button>
      </div>
    </form>
  );
}

export default CreateGroupForm;
