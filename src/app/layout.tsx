import type { Metadata, Viewport } from 'next';
import { Geist_Mono, Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '~/components/layout/providers';
import { PRODUCT } from '~/constants/site';
import { cn } from '~/lib/utils';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: PRODUCT.name, template: `%s · ${PRODUCT.name}` },
  description: PRODUCT.description,
  applicationName: PRODUCT.name,
  // A local tool: never indexed.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#07080a',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn('dark h-full antialiased', inter.variable, geistMono.variable)}>
      <body className="min-h-full bg-background font-sans text-foreground">
        <a
          href="#main"
          className="sr-only z-[100] rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
