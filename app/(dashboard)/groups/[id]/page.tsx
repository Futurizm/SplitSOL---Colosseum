import type { Metadata } from 'next';
import { GroupView } from './GroupView';

export const metadata: Metadata = {
  title: 'Группа',
  description: 'Детали группы, участники и статус on-chain расчёта',
};

export default function GroupPage({ params }: { params: { id: string } }) {
  return <GroupView groupId={params.id} />;
}
