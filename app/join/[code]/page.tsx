import type { Metadata } from 'next';
import { JoinView } from './JoinView';

export const metadata: Metadata = {
  title: 'Присоединиться к группе',
  description: 'Присоединение к группе по коду приглашения',
};

export default function JoinPage({ params }: { params: { code: string } }) {
  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <JoinView code={params.code} />
      </div>
    </div>
  );
}
