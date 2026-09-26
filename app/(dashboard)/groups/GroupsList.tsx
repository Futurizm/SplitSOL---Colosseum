'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { GroupCard } from '@/components/groups/GroupCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GroupCardSkeleton } from '@/components/ui/skeleton';
import { useGroups } from '@/lib/hooks/useGroup';
import type { GroupStatus } from '@/lib/types/database';

const TABS: { value: GroupStatus | 'all'; label: string }[] = [
  { value: 'active', label: 'Активные' },
  { value: 'settled', label: 'Рассчитанные' },
  { value: 'cancelled', label: 'Отменённые' },
  { value: 'all', label: 'Все' },
];

export function GroupsList() {
  const [status, setStatus] = useState<GroupStatus | 'all'>('active');
  const [search, setSearch] = useState('');

  const { groups, isLoading, error } = useGroups(status === 'all' ? undefined : status);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return groups;
    return groups.filter(
      (group) =>
        group.name.toLowerCase().includes(query) ||
        group.invite_code.toLowerCase().includes(query),
    );
  }, [groups, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={status} onValueChange={(value) => setStatus(value as GroupStatus | 'all')}>
          <TabsList>
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по названию или коду"
              className="pl-9"
              aria-label="Поиск групп"
            />
          </div>
          <Button asChild>
            <Link href="/groups/new">Новая</Link>
          </Button>
        </div>
      </div>

      {error ? (
        <Card className="border-error/30 bg-error/[0.06]">
          <CardContent className="p-4 text-sm text-error">{error}</CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <GroupCardSkeleton />
          <GroupCardSkeleton />
          <GroupCardSkeleton />
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((group) => (
            <GroupCard key={group.id} group={group} />
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{search ? 'Ничего не найдено' : 'Список пуст'}</CardTitle>
            <CardDescription>
              {search
                ? 'Попробуйте изменить запрос или сбросить фильтр.'
                : 'Создайте группу, чтобы разделить счёт с друзьями.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/groups/new">Создать группу</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default GroupsList;
