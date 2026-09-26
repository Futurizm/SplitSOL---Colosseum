import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import { DevnetBanner } from '@/components/DevnetBanner';
import { Providers } from '@/components/providers';
import './globals.css';

const display = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const body = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-body',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'SplitSOL — делим счета и расплачиваемся в Solana',
    template: '%s · SplitSOL',
  },
  description:
    'Разделяйте счета с друзьями и расплачивайтесь токенами Solana. Эскроу и расчёты — on-chain, имена и история — в базе.',
  applicationName: 'SplitSOL',
  keywords: ['SplitSOL', 'Solana', 'tUSDC', 'split bill', 'devnet', 'Anchor'],
  openGraph: {
    title: 'SplitSOL — делим счета и расплачиваемся в Solana',
    description: 'Devnet-демо: on-chain эскроу, Solana Pay QR, realtime-статусы оплат.',
    type: 'website',
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0A0A0F',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <Providers>
          <DevnetBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
