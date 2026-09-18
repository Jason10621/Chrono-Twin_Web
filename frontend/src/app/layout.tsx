import type { Metadata } from "next";
import { Space_Grotesk, Nanum_Myeongjo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// 본문 한글은 Pretendard(아래 <head> CDN)를 기본 폰트로 쓰고, 이 세 폰트는
// 영역별 악센트로만 사용한다 — Inter 하나로 통일했던 이전 버전과의 의도적 차별점.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});
const nanumMyeongjo = Nanum_Myeongjo({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-serif",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Chrono-Twin | 3D Chronotype Analyzer",
  description: "AI-driven chronotype analysis and 3D visualization platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark">
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin=""
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@latest/dist/web/variable/pretendardvariable.min.css"
        />
      </head>
      <body
        className={`${spaceGrotesk.variable} ${nanumMyeongjo.variable} ${plexMono.variable} font-sans min-h-screen bg-background text-foreground`}
      >
        <nav className="fixed top-0 w-full z-50 glass-panel border-b border-white/10 px-6 py-4 flex items-center justify-between">
          <div className="font-display text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
            Chrono-Twin
          </div>
          <div className="flex gap-4">
            <button className="text-sm hover:text-primary transition-colors">About</button>
            <a
              href="/dashboard.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm hover:text-primary transition-colors"
            >
              Dashboard
            </a>
          </div>
        </nav>
        <main className="pt-20">
          {children}
        </main>
        <footer className="mt-20 border-t border-white/10 py-10 px-6 text-center">
          <p className="font-serif text-lg md:text-xl tracking-[0.2em] text-white/70">
            이정욱 · 윤지후 · 홍서준 · 유가빈 · 전윤서
          </p>
          <p className="mt-2 text-[11px] font-mono uppercase tracking-widest text-white/25">
            ULIF — Chrono-Twin Research Team
          </p>
        </footer>
      </body>
    </html>
  );
}
