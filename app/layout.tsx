import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Inter } from 'next/font/google';
import './globals.css';

const display = Cormorant_Garamond({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-display' });
const body = Inter({ subsets: ['latin'], variable: '--font-body' });

export const metadata: Metadata = {
  title: 'Unus — your health passport, by Laymen',
  description: 'One passport. Every record. Every fact proved. Unus turns scattered health records into one passport where every fact traces to its source.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#F7F4EE' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
