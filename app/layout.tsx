import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Comm Center — RankFast',
  description: 'AI Communication Command Center for Pranay Mishra',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#070a0d] overflow-hidden antialiased">{children}</body>
    </html>
  );
}
