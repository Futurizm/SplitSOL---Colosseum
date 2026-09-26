'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, LogIn } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';

const schema = z.object({
  email: z.string().trim().email('Введите корректный email'),
  password: z.string().min(6, 'Минимум 6 символов'),
});

type Values = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { supabase, isConfigured } = useSupabase();
  const { success, error: showError } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  const redirectTo = params.get('redirect') ?? '/dashboard';

  const onSubmit = handleSubmit(async ({ email, password }) => {
    if (!supabase) {
      showError('Supabase не настроен', 'Заполните .env.local — см. SETUP.md, шаг 2.');
      return;
    }
    setIsLoading(true);
    setNotice(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setIsLoading(false);
      showError('Не удалось войти', error.message);
      return;
    }

    success('Добро пожаловать', 'Перенаправляем в дашборд…');
    router.push(redirectTo);
    router.refresh();
  });

  const sendMagicLink = async () => {
    if (!supabase) return;
    const email = getValues('email').trim();
    if (!email) {
      showError('Укажите email', 'Введите адрес, на который отправить ссылку.');
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setIsLoading(false);

    if (error) {
      showError('Не удалось отправить ссылку', error.message);
      return;
    }
    setNotice(`Отправили ссылку для входа на ${email}.`);
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">Вход в SplitSOL</CardTitle>
        <CardDescription>
          {isConfigured
            ? 'Войдите, чтобы создавать группы и отслеживать свои доли.'
            : 'Supabase не настроен — заполните .env.local, чтобы вход заработал.'}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              {...register('email')}
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email ? <p className="text-xs text-error">{errors.email.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              {...register('password')}
              aria-invalid={Boolean(errors.password)}
            />
            {errors.password ? (
              <p className="text-xs text-error">{errors.password.message}</p>
            ) : null}
          </div>

          {notice ? (
            <p className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success">
              {notice}
            </p>
          ) : null}

          <Button type="submit" className="w-full" loading={isLoading} disabled={!isConfigured}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            Войти
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={!isConfigured || isLoading}
            onClick={() => void sendMagicLink()}
          >
            Войти по ссылке из письма
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Нет аккаунта?{' '}
          <Link href="/register" className="font-medium text-solana-green hover:underline">
            Зарегистрироваться
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

export default LoginForm;
