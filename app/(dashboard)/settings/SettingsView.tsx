'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useWallet } from '@solana/wallet-adapter-react';
import { Check, Copy, LogOut, RefreshCw, Save, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { SetupNotice, type SetupCheck } from '@/components/SetupNotice';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { DevnetFaucetDialog } from '@/components/wallet/DevnetFaucetDialog';
import { WalletBalance } from '@/components/wallet/WalletBalance';
import {
  getProgramIdOrNull,
  getRpcEndpoint,
  getTestTokenDecimals,
  getTestTokenMintOrNull,
  getTestTokenSymbol,
  isProgramConfigured,
  isTestTokenConfigured,
} from '@/lib/solana/constants';
import { profileSchema, type ProfileInput } from '@/lib/utils/validation';
import { shortAddress } from '@/lib/utils/format';
import type { DevnetStatus } from '@/lib/solana/env-status';

export function SettingsView() {
  const { user, supabase, isConfigured, isLoading, signOut } = useSupabase();
  const { publicKey } = useWallet();
  const { success, error: showError } = useToast();

  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<DevnetStatus | null>(null);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { username: '', displayName: '', walletAddress: '', phone: '' },
  });

  // Подставляем текущий кошелёк в поле профиля.
  useEffect(() => {
    if (publicKey) {
      reset((values) => ({ ...values, walletAddress: publicKey.toBase58() }));
    }
  }, [publicKey, reset]);

  const loadProfile = useCallback(async () => {
    if (!supabase || !user) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (data) {
      reset({
        username: data.username ?? '',
        displayName: data.display_name ?? '',
        walletAddress: data.wallet_address ?? '',
        phone: data.phone ?? '',
      });
    }
  }, [supabase, user, reset]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const loadStatus = useCallback(async () => {
    setIsRefreshingStatus(true);
    try {
      const response = await fetch('/api/devnet/status', { cache: 'no-store' });
      if (response.ok) setStatus((await response.json()) as DevnetStatus);
    } catch {
      setStatus(null);
    } finally {
      setIsRefreshingStatus(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const onSubmit = handleSubmit(async (values) => {
    if (!supabase || !user) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('profiles').upsert(
        {
          id: user.id,
          username: values.username || null,
          display_name: values.displayName || null,
          wallet_address: values.walletAddress || null,
          phone: values.phone || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
      if (error) throw new Error(error.message);
      success('Профиль сохранён', 'Изменения применены.');
    } catch (err) {
      showError('Не удалось сохранить профиль', (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  });

  const checks: SetupCheck[] = [
    {
      label: 'Supabase (auth + база)',
      ok: isConfigured,
      env: 'NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY',
      hint: isConfigured
        ? status?.supabaseConfigured === false
          ? 'Сервер не видит SUPABASE_SERVICE_ROLE_KEY — верификация платежей работать не будет'
          : undefined
        : 'SETUP.md, шаг 2: выполните supabase/schema.sql и supabase/rls.sql',
    },
    {
      label: 'Anchor-программа',
      ok: isProgramConfigured(),
      env: 'NEXT_PUBLIC_PROGRAM_ID',
      hint: isProgramConfigured()
        ? status?.programConfigured === false
          ? 'Сервер не видит program ID — API-роуты не смогут читать on-chain состояние'
          : undefined
        : 'SETUP.md, шаг 4: anchor build && anchor deploy && node scripts/set-program-id.mjs',
    },
    {
      label: 'Тестовый токен tUSDC',
      ok: isTestTokenConfigured(),
      env: 'NEXT_PUBLIC_TEST_TOKEN_MINT',
      hint: isTestTokenConfigured()
        ? undefined
        : 'SETUP.md, шаг 5: npm run setup:devnet (создаёт mint и минтит токены)',
    },
    {
      label: 'Mint authority (раздача токенов из UI)',
      ok: Boolean(status?.mintAuthorityConfigured),
      env: 'DEVNET_MINT_AUTHORITY_SECRET',
      hint: 'Секрет хранится только на сервере и нужен для кнопки «Получить тестовые токены»',
    },
  ];

  const programId = getProgramIdOrNull()?.toBase58() ?? null;
  const mint = getTestTokenMintOrNull()?.toBase58() ?? null;

  return (
    <div className="space-y-6">
      <SetupNotice title="Проверка окружения" checks={checks}>
        <div className="space-y-2 text-sm">
          <Row label="Devnet RPC" value={getRpcEndpoint()} />
          <Row
            label="Слот"
            value={status?.rpcOnline ? String(status.slot ?? '…') : 'нет соединения'}
          />
          <Row label="Program ID" value={programId ? shortAddress(programId, 6, 6) : '—'} />
          <Row label="Mint tUSDC" value={mint ? shortAddress(mint, 6, 6) : '—'} />
          <Row
            label="Точность токена"
            value={`${getTestTokenDecimals()} decimals (${getTestTokenSymbol()})`}
          />

          <Button variant="ghost" size="sm" onClick={() => void loadStatus()} loading={isRefreshingStatus}>
            <RefreshCw className="h-4 w-4" />
            Обновить статус
          </Button>
        </div>
      </SetupNotice>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Профиль</CardTitle>
            <CardDescription>Отображается участникам ваших групп</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? null : !isConfigured ? (
              <p className="text-sm text-warning">Сначала настройте Supabase.</p>
            ) : !user ? (
              <p className="text-sm text-muted-foreground">Войдите, чтобы редактировать профиль.</p>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" value={user.email ?? ''} disabled className="font-mono" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="displayName">Отображаемое имя</Label>
                  <Input id="displayName" placeholder="Айдана" {...register('displayName')} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    placeholder="aidos"
                    className="font-mono"
                    {...register('username')}
                  />
                  {errors.username ? (
                    <p className="text-xs text-error">{String(errors.username.message)}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="walletAddress">Кошелёк Solana</Label>
                  <div className="flex gap-2">
                    <Input
                      id="walletAddress"
                      className="font-mono text-xs"
                      {...register('walletAddress')}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={!publicKey}
                      onClick={async () => {
                        if (!publicKey) return;
                        await navigator.clipboard.writeText(publicKey.toBase58());
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 2000);
                      }}
                      aria-label="Скопировать адрес"
                    >
                      {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  {errors.walletAddress ? (
                    <p className="text-xs text-error">{String(errors.walletAddress.message)}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Телефон (необязательно)</Label>
                  <Input id="phone" placeholder="+7 700 000 00 00" {...register('phone')} />
                </div>

                <div className="flex gap-2">
                  <Button type="submit" loading={isSaving}>
                    <Save className="h-4 w-4" />
                    Сохранить
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => void signOut()}>
                    <LogOut className="h-4 w-4" />
                    Выйти
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Кошелёк</CardTitle>
              <CardDescription>Баланс нужен для комиссий и оплаты долей</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {publicKey ? (
                <WalletBalance />
              ) : (
                <p className="text-sm text-muted-foreground">Кошелёк не подключён.</p>
              )}
              <DevnetFaucetDialog />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Безопасность</CardTitle>
              <CardDescription>Как защищены средства</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <SecurityNote>
                Приложение никогда не запрашивает и не хранит приватный ключ: подпись
                транзакции происходит внутри кошелька.
              </SecurityNote>
              <SecurityNote>
                Суммы проверяются на сервере по фактической транзакции в сети — клиент не может
                «нарисовать» оплату.
              </SecurityNote>
              <SecurityNote>
                Доступ к группам защищён Row Level Security в Supabase.
              </SecurityNote>
            </CardContent>
          </Card>

          <Card className="border-warning/30 bg-warning/[0.04]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TriangleAlert className="h-4 w-4 text-warning" />
                Только Devnet
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Приложение жёстко зафиксировано на Solana Devnet: mainnet-эндпоинты блокируются
                при создании соединения и в каждом серверном API-роуте.
              </p>
              <Badge variant="warning">tUSDC и SOL бесплатны</Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-xs">{value}</span>
    </p>
  );
}

function SecurityNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Switch checked disabled aria-hidden className="mt-0.5" />
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}

export default SettingsView;
