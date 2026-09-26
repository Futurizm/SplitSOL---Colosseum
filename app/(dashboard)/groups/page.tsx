import type { Metadata } from 'next';
import { GroupsList } from './GroupsList';

export const metadata: Metadata = {
  title: 'Группы',
  description: 'Все ваши группы и статусы расчётов',
};

export default function GroupsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Группы</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Активные, рассчитанные и отменённые счета.
        </p>
      </div>

      <GroupsList />
    </div>
  );
}
