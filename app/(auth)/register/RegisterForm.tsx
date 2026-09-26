'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';

const schema = z
  .object({
    displayName: z.string().trim().min(2, 'Минимум 2 символа').max(60, 'Максимум 60 символов'),
    email: z.string().trim().email('Введите корректный email'),
    password: z.string().min(6, 'Минимум 6 символов'),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  });

type Values = z.infer<typeof schema>;

export function RegisterForm() {
  const router = useRouter();
  const { supabase, isConfigured } = useSupabase();
  const { success, error: showError } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: '', email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ displayName, email, password }) => {
    if (!supabase) {
      showError('Supabase не настроен', 'Заполните .env.local — см. SETUP.md, шаг 2.');
      return;
    }
    setIsLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (error) {
      setIsLoading(false);
      showError('Не удалось зарегистрироваться', error.message);
      return;
    }

    // Профиль создаёт триггер в БД; здесь подстраховываемся на клиенте.
    if (data.user) {
      await supabase
        .from('profiles')
        .upsert({ id: data.user.id, display_name: displayName }, { onConflict: 'id' });
    }

    setIsLoading(false);
    success('Аккаунт создан', 'Проверьте почту, если требуется подтверждение.');
    router.push('/dashboard');
    router.refresh();
  });

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">Регистрация</CardTitle>
        <CardDescription>
          30 секунд — и можно создавать группы. Кошелёк подключается позже.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Как вас зовут</Label>
            <Input id="displayName" placeholder="Айдана" {...register('displayName')} />
            {errors.displayName ? (
              <p className="text-xs text-error">{String(errors.displayName.message)}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" {...register('email')} />
            {errors.email ? <p className="text-xs text-error">{String(errors.email.message)}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...register('password')}
            />
            {errors.password ? (
              <p className="text-xs text-error">{String(errors.password.message)}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Повторите пароль</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register('confirmPassword')}
            />
            {errors.confirmPassword ? (
              <p className="text-xs text-error">{String(errors.confirmPassword.message)}</p>
            ) : null}
          </div>

          <Button type="submit" className="w-full" loading={isLoading} disabled={!isConfigured}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Создать аккаунт
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Уже есть аккаунт?{' '}
          <Link href="/login" className="font-medium text-solana-green hover:underline">
            Войти
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

export default RegisterForm;
