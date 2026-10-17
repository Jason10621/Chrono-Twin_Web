import SleepAnalyzer from "@/components/SleepAnalyzer";

export default function Home() {
  return (
    <>
      <section className="px-5 pb-16 pt-32 text-center md:pb-24 md:pt-44">
        <p className="t-eyebrow mb-5 animate-fade-up">Chrono-Twin</p>
        <h1 className="t-hero mx-auto max-w-4xl animate-fade-up [animation-delay:80ms]">
          오늘 밤의 습관이,
          <br />
          내일의 나를 바꿉니다.
        </h1>
        <p className="t-lead mx-auto mt-7 max-w-2xl animate-fade-up [animation-delay:160ms]">
          스마트폰, 카페인, 조명.
          <br className="hidden sm:block" /> 알려주시면 내일 컨디션이 어떻게 달라지는지 바로 보여드려요.
        </p>
        <div className="mt-11 flex flex-col items-center justify-center gap-5 animate-fade-up [animation-delay:240ms] sm:flex-row sm:gap-9">
          <a href="#analyze" className="btn btn-primary">
            내 수면 분석하기
          </a>
          <a href="/dashboard.html" target="_blank" rel="noopener noreferrer" className="link">
            정책 대시보드 보기
            <span aria-hidden>›</span>
          </a>
        </div>
      </section>

      <SleepAnalyzer />
    </>
  );
}
