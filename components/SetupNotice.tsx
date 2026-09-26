import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertTriangle, ExternalLink, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const DOCS = 'https://github.com/coral-xyz/anchor';

export interface SetupCheck {
  label: string;
  ok: boolean;
  hint?: string;
  env?: string;
}

/**
 * Экран «проект не настроен» вместо падения.
 * Показывается, пока не заданы обязательные переменные окружения, — это даёт
 * возможность запустить `npm run dev` и сразу увидеть интерфейс.
 */
export function SetupNotice({
  title = 'Нужна настройка окружения',
  checks,
  children,
}: {
  title?: string;
  checks: SetupCheck[];
  children?: ReactNode;
}) {
  const missing = checks.filter((check) => !check.ok);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-warning/15">
            <Settings2 className="h-6 w-6 text-warning" />
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            Приложение спроектировано так, чтобы запускаться на «голом» репозитории. Интерфейс уже
            работает, но on-chain и авторизация включатся после заполнения{' '}
            <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">.env.local</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2">
            {checks.map((check) => (
              <li
                key={check.label}
                className="flex items-start gap-3 rounded-lg border border-border bg-secondary/40 p-3"
              >
                {check.ok ? (
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-success" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{check.label}</p>
                  {check.env ? (
                    <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
                      {check.env}
                    </p>
                  ) : null}
                  {check.hint ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{check.hint}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          {children}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild variant="outline" size="sm">
              <a href={DOCS} target="_blank" rel="noreferrer">
                Документация Anchor
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/settings">Открыть настройки</Link>
            </Button>
          </div>

          {missing.length > 0 ? (
            <p className="pt-1 text-xs text-muted-foreground">
              Подробная инструкция — в файле <code className="font-mono">SETUP.md</code> в корне
              репозитория.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default SetupNotice;
