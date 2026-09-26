import type { Metadata } from 'next';
import { SettingsView } from './SettingsView';

export const metadata: Metadata = {
  title: 'Настройки',
  description: 'Профиль, кошелёк и проверка окружения devnet',
};

export default function SettingsPage() {
  return <SettingsView />;
}
