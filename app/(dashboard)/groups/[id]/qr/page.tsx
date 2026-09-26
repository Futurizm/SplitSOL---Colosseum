import { Suspense } from 'react';
import type { Metadata } from 'next';
import { QrPayView } from './QrPayView';

export const metadata: Metadata = {
  title: 'Оплата по QR',
  description: 'Solana Pay: оплата доли по QR-коду',
};

export default function GroupQrPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={null}>
      <QrPayView groupId={params.id} />
    </Suspense>
  );
}
