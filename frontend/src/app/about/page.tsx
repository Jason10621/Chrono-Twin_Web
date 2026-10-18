import type { Metadata } from "next";
import { Eye } from "lucide-react";
import AboutFlow from "@/components/AboutFlow";
import { Section } from "@/components/Section";
import { FILE_COUNT, STAGES } from "@/lib/aboutData";

export const metadata: Metadata = {
  title: "About — 이렇게 만들었어요 | Chrono-Twin",
  description: "아이디어에서 AI 코치까지, 여덟 단계로 보는 Chrono-Twin 개발 이야기와 보고서·코드 열람.",
};

export default function AboutPage() {
  return (
    <>
      <section className="px-5 pb-10 pt-32 text-center md:pb-14 md:pt-44">
        <p className="t-eyebrow mb-5 animate-fade-up">About</p>
        <h1 className="t-hero mx-auto max-w-4xl animate-fade-up [animation-delay:80ms]">
          아이디어에서
          <br />
          AI 코치까지.
        </h1>
        <p className="t-lead mx-auto mt-7 max-w-2xl animate-fade-up [animation-delay:160ms]">
          Chrono-Twin이 만들어진 {STAGES.length}단계의 기록이에요.
          <br className="hidden sm:block" /> 단계를 눌러 그때의 보고서와 코드를 열어보세요.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 animate-fade-up [animation-delay:240ms]">
          <Stat value={STAGES.length} label="개발 단계" />
          <Stat value={FILE_COUNT} label="열람 가능한 자료" />
          <Stat value={5} label="함께한 사람" />
        </div>
      </section>

      <Section className="!pt-4 md:!pt-6">
        <AboutFlow />
        <p className="mt-14 flex items-center justify-center gap-2 text-center text-[15px] text-fg-2">
          <Eye className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
          모든 자료는 화면에서 열람만 할 수 있어요. 학번 같은 개인정보는 가렸습니다.
        </p>
      </Section>
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <p className="text-[clamp(34px,5vw,48px)] font-semibold leading-none tracking-[-0.03em] tabular-nums">{value}</p>
      <p className="mt-1.5 text-[15px] text-fg-2">{label}</p>
    </div>
  );
}
