import type { Metadata } from 'next';
import { DashboardClient } from './DashboardClient';

export const metadata: Metadata = {
  title: 'Дашборд',
  description: 'Активные группы, ваши доли и статус оплат',
};

export default function DashboardPage() {
  return <DashboardClient />;
}
