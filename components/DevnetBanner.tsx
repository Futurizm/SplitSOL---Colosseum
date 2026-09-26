import { FlaskConical } from 'lucide-react';

/**
 * Обязательный баннер на ВСЕХ страницах приложения.
 * Проект работает исключительно на Solana Devnet с бесплатными тестовыми
 * токенами tUSDC — никаких реальных денег.
 */
export function DevnetBanner() {
  return (
    <div className="w-full border-b border-warning/20 bg-warning/10 py-1.5 px-4 text-center">
      <p className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-warning">
        <FlaskConical className="h-3.5 w-3.5" aria-hidden />
        <span className="font-mono font-semibold tracking-wide">DEVNET</span>
        <span className="text-warning/70">— тестовая сеть Solana ·</span>
        <span>
          используются бесплатные токены <span className="font-semibold">tUSDC</span> ·
          реальных денег нет
        </span>
      </p>
    </div>
  );
}

export default DevnetBanner;
