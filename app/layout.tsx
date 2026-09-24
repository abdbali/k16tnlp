import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ML Rubrik Değerlendirici',
  description: 'ML tabanlı öğrenci cevabı puanlama ve geribildirim'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
