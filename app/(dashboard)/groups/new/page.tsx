import type { Metadata } from 'next';
import { CreateGroupForm } from '@/components/groups/CreateGroupForm';

export const metadata: Metadata = {
  title: 'Новая группа',
  description: 'Создайте группу и запустите on-chain эскроу',
};

export default function NewGroupPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Новая группа</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Счёт, получатель и способ разделения. Группа создаётся сразу в смарт-контракте.
        </p>
      </div>

      <CreateGroupForm />
    </div>
  );
}
