import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

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
      <body className={`${inter.className} min-h-screen bg-background text-foreground`}>
        <nav className="fixed top-0 w-full z-50 glass-panel border-b border-white/10 px-6 py-4 flex items-center justify-between">
          <div className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
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
      </body>
    </html>
  );
}
