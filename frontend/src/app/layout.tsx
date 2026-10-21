import type { Metadata, Viewport } from "next";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";
import Wordmark from "@/components/Wordmark";
import EasterEggs from "@/components/EasterEggs";

export const metadata: Metadata = {
  title: "Chrono-Twin — 오늘 밤의 습관이 내일을 바꿉니다",
  description: "스마트폰·카페인·조명이 내 수면과 내일 컨디션에 미치는 영향을 바로 확인하세요.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

// 페이지가 그려지기 전에 저장된(또는 기기 기본) 테마를 적용해 깜빡임을 막는다.
const themeInit = `(function(){try{var t=localStorage.getItem('ct-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 애플 기기가 아닌 곳에서 SF Pro 대신 쓰는 한글 서체 (SF와 가장 닮음) */}
        <link
          rel="stylesheet"
          as="style"
          crossOrigin=""
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@latest/dist/web/variable/pretendardvariable.min.css"
        />
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-screen">
        <header className="nav-blur fixed inset-x-0 top-0 z-50">
          <div className="mx-auto flex h-[52px] max-w-6xl items-center justify-between px-5 md:px-8">
            <Wordmark />
            <nav className="flex items-center gap-2 sm:gap-6">
              <a href="/#analyze" className="nav-link hidden sm:inline">
                분석
              </a>
              <a href="/#coach" className="nav-link hidden sm:inline">
                AI 코치
              </a>
              <a href="/about" className="nav-link">
                About
              </a>
              <a href="/dashboard.html" target="_blank" rel="noopener noreferrer" className="nav-link">
                대시보드
              </a>
              <ThemeToggle />
            </nav>
          </div>
        </header>

        <EasterEggs />

        <main id="top">{children}</main>

        <footer className="mx-auto mt-10 max-w-6xl px-5 pb-16 pt-12 text-center md:px-8">
          <p className="text-[19px] font-semibold tracking-[0.04em]">이정욱 · 윤지후 · 홍서준 · 유가빈 · 전윤서</p>
          <p className="mt-2 text-[15px] text-fg-2">ULIF 연구팀</p>
          <p className="mx-auto mt-6 max-w-xl text-[14px] leading-relaxed text-fg-2">
            더미(합성) 데이터로 검증한 간이 추정 모형이에요. 의학적 진단이 아닙니다.
            <br />
            잠들기 어려운 날이 2주 넘게 이어지거나 낮에 많이 졸리면, 보건선생님이나 병원과 상담해 보세요.
          </p>
        </footer>
      </body>
    </html>
  );
}
