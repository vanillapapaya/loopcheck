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
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        {/* 제목은 명조, 본문은 고딕, 숫자는 고정폭. 인쇄된 분석 보고서 쪽으로 */}
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
