import type { Metadata } from 'next';
import { RegisterForm } from './RegisterForm';

export const metadata: Metadata = {
  title: 'Регистрация',
  description: 'Создание аккаунта SplitSOL',
};

export default function RegisterPage() {
  return (
    <div className="flex min-h-[calc(100vh-2rem)] items-center justify-center px-4 py-12">
      <RegisterForm />
    </div>
  );
}
