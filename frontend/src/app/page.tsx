"use client";

import SleepAnalyzer from "@/components/SleepAnalyzer";

function scrollToAnalyze() {
  document.getElementById("analyze")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function Home() {
  return (
    <>
      <div className="min-h-[80vh] flex flex-col items-center justify-center relative overflow-hidden px-4">
        {/* Background glowing effects */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/20 blur-[120px] rounded-full pointer-events-none" />

        <div className="z-10 text-center animate-slide-up max-w-3xl">
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6">
            Discover Your <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
              Digital Chrono-Twin
            </span>
          </h1>
          <p className="text-lg md:text-xl text-white/60 mb-10 max-w-2xl mx-auto">
            생명공학과 뇌과학 데이터를 융합하여 당신만의 고유한 수면 위상 3D 유기체를 생성하고,
            최적의 라이프스타일 타임라인을 설계하세요.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={scrollToAnalyze}
              className="px-8 py-4 rounded-full bg-white text-black font-semibold hover:bg-white/90 transition-transform hover:scale-105 active:scale-95 shadow-[0_0_40px_rgba(255,255,255,0.3)]"
            >
              Analyze My Sleep
            </button>
            <a
              href="/dashboard.html"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 rounded-full glass-panel font-semibold hover:bg-white/10 transition-colors"
            >
              View Policy Dashboard
            </a>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-center gap-1 animate-fade-in">
          <span className="text-[11px] text-white/30 font-mono tracking-widest uppercase">Scroll to try live demo</span>
          <span className="text-white/30 text-lg">↓</span>
        </div>
      </div>

      <SleepAnalyzer />
    </>
  );
}
