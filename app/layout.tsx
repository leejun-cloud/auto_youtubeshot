import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'YouTube Shorts & Reels Photo Video Creator',
  description: 'AI 이미지 배경 + 굵은 카피 손힘찬 스타일 비디오 자동 제작 툴',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
