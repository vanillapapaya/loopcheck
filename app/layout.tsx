import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "게임 지표 설계와 진단",
  description:
    "게임 개발을 위해 어떤 데이터를 쌓아야 하는지 정해 주고, 쌓인 데이터를 기반으로 무엇을 먼저 고쳐야 하는지 읽어 줍니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
