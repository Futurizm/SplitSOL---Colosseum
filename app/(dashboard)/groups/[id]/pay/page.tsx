import type { Metadata } from 'next';
import { PayView } from './PayView';

export const metadata: Metadata = {
  title: 'Оплата доли',
  description: 'Оплата доли через Anchor-инструкцию pay_share',
};

export default function GroupPayPage({ params }: { params: { id: string } }) {
  return <PayView groupId={params.id} />;
}
