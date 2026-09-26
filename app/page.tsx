import Link from 'next/link';
import {
  ArrowRight,
  Blocks,
  CheckCircle2,
  FlaskConical,
  QrCode,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isProgramConfigured } from '@/lib/solana/constants';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { getTestTokenMintOrNull, getTestTokenSymbol } from '@/lib/solana/constants';
import { shortAddress } from '@/lib/utils/format';

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Эскроу в смарт-контракте',
    text: 'Средства лежат в ATA, которым владеет PDA программы. Пока группа активна, их не может забрать никто — ни участник, ни получатель.',
  },
  {
    icon: Zap,
    title: 'Атомарная оплата доли',
    text: 'Одна инструкция pay_share переводит ровно вашу долю и фиксирует факт оплаты on-chain. Статус нельзя «нарисовать» в интерфейсе.',
  },
  {
    icon: QrCode,
    title: 'Solana Pay и QR',
    text: 'Отсканируйте код с телефона — кошелёк сам подставит mint tUSDC. Для разработки откройте Testnet Mode в Phantom.',
  },
  {
    icon: Blocks,
    title: 'Полный возврат при отмене',
    text: 'Отмена возвращает каждую оплаченную долю назад, а settle_group переводит всю сумму получателю только после полной оплаты.',
  },
];

const STEPS = [
  { title: 'Создайте группу', text: 'Укажите счёт, получателя и способ разделения — равно, по проценту, по долям или точными суммами.' },
  { title: 'Поделитесь ссылкой', text: 'Участники присоединяются по коду или QR и получают свою долю.' },
  { title: 'Получите оплаты', text: 'Каждая оплата появляется у всех участников в реальном времени.' },
  { title: 'Закройте счёт', text: 'Когда все оплатили, нажмите «Рассчитать» — и получатель получит всю сумму on-chain.' },
];

export default function LandingPage() {
  const supabaseReady = isSupabaseConfigured();
  const programReady = isProgramConfigured();
  const mint = getTestTokenMintOrNull();

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden px-4 pb-20 pt-16 lg:px-8">
        <div className="mx-auto max-w-5xl text-center">
          <Badge variant="warning" className="mb-6">
            <FlaskConical className="mr-1.5 h-3.5 w-3.5" />
            Solana Devnet · тестовые токены tUSDC · реальных денег нет
          </Badge>

          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            Делим счёт — <span className="text-gradient">рассчитываемся в Solana</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            SplitSOL разделяет счёт между друзьями и держит деньги в on-chain эскроу, пока не
            заплатят все. Никаких споров «кто забыл заплатить» — статус виден всем в реальном
            времени.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/groups/new">
                Создать группу
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/dashboard">Открыть дашборд</Link>
            </Button>
          </div>

          <dl className="mx-auto mt-12 grid max-w-2xl grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl border border-border bg-card/50 p-4">
              <dt className="text-muted-foreground">Программа</dt>
              <dd className="mt-1 flex items-center justify-center gap-1.5 font-mono">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${programReady ? 'bg-success' : 'bg-warning'}`}
                />
                {programReady ? 'задеплоена' : 'нужен anchor deploy'}
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-card/50 p-4">
              <dt className="text-muted-foreground">База</dt>
              <dd className="mt-1 flex items-center justify-center gap-1.5 font-mono">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${supabaseReady ? 'bg-success' : 'bg-warning'}`}
                />
                {supabaseReady ? 'подключена' : 'не настроена'}
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-card/50 p-4">
              <dt className="text-muted-foreground">Токен</dt>
              <dd className="mt-1 font-mono text-xs">
                {mint ? shortAddress(mint.toBase58(), 4, 4) : `${getTestTokenSymbol()} не создан`}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Фичи */}
      <section className="px-4 py-16 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center font-display text-2xl font-semibold sm:text-3xl">
            Почему это работает
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
            Блокчейн здесь — не украшение, а механизм: он решает конкретную задачу с доверием.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <Card key={feature.title} className="h-full">
                <CardHeader>
                  <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-solana-purple/15">
                    <feature.icon className="h-5 w-5 text-solana-purple" />
                  </span>
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{feature.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Как это работает */}
      <section className="px-4 py-16 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center font-display text-2xl font-semibold sm:text-3xl">
            Четыре шага
          </h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-2xl border border-border bg-card/50 p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-solana-gradient font-mono text-sm font-bold text-black">
                  {index + 1}
                </span>
                <h3 className="mt-3 font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-24 lg:px-8">
        <Card className="mx-auto max-w-3xl border-solana-purple/30 bg-solana-gradient/[0.06]">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <h2 className="font-display text-2xl font-semibold">Попробуйте прямо сейчас</h2>
            <p className="max-w-xl text-sm text-muted-foreground">
              SOL и tUSDC на devnet бесплатны. Подключите Phantom в Testnet Mode, нажмите
              «Получить тестовые токены» — и пройдите весь флоу оплаты за две минуты.
            </p>
            <ul className="grid gap-1.5 text-left text-sm text-muted-foreground sm:grid-cols-2">
              <li className="flex gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                Никаких комиссий приложения
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                Приватные ключи не покидают кошелёк
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                Все транзакции видны в Explorer
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                Отмена возвращает все доли
              </li>
            </ul>
            <Button asChild size="lg" className="mt-2">
              <Link href={supabaseReady ? '/groups/new' : '/register'}>
                {supabaseReady ? 'Создать первую группу' : 'Зарегистрироваться'}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <footer className="border-t border-border px-4 py-8 text-center text-xs text-muted-foreground lg:px-8">
        SplitSOL — демо для хакатона. Только Solana Devnet и бесплатные тестовые токены.
      </footer>
    </div>
  );
}
