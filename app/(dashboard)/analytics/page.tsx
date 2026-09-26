import type { Metadata } from 'next';
import { AnalyticsView } from './AnalyticsView';

export const metadata: Metadata = {
  title: 'Аналитика',
  description: 'Графики трат и разбивка по категориям',
};

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Аналитика трат</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Считается по фактическим on-chain оплатам в ваших группах.
        </p>
      </div>

      <AnalyticsView />
    </div>
  );
}
