import type { Metadata } from 'next';
import { HistoryView } from './HistoryView';

export const metadata: Metadata = {
  title: 'История',
  description: 'История транзакций с подтверждением on-chain',
};

export default function HistoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">История транзакций</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Все платежи по вашим группам с ссылками на Solana Explorer.
        </p>
      </div>

      <HistoryView />
    </div>
  );
}
