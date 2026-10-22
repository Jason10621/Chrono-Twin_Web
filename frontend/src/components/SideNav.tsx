"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";

/**
 * 메인 페이지 왼쪽 목차 — 눌러서 바로 그 파트로 이동한다.
 *  · 데스크톱(lg 이상): 점 모양 레일. 마우스를 올리거나 포커스하면 이름이 슬라이드로 펼쳐진다.
 *  · 태블릿·모바일: 왼쪽 가장자리 탭 → 서랍(drawer)이 슬라이드로 열린다.
 * 지금 보고 있는 파트는 스크롤에 따라 강조된다. id 는 SleepAnalyzer 의 <Section id> 와 같아야 한다.
 */
const ITEMS: { id: string; label: string; sub: string }[] = [
  { id: "top", label: "처음", sub: "Chrono-Twin 소개" },
  { id: "analyze", label: "분석", sub: "오늘 밤을 알려주세요" },
  { id: "impact", label: "내일의 나", sub: "내일, 이렇게 달라져요" },
  { id: "why", label: "원인", sub: "왜 이런 결과일까요?" },
  { id: "whatif", label: "해결", sub: "이렇게 바꿔보세요" },
  { id: "compare", label: "비교", sub: "지금 습관 vs 바꾼 습관" },
  { id: "plan", label: "오늘 밤", sub: "시간표로 만들었어요" },
  { id: "twin", label: "내 트윈", sub: "예측과 실제를 맞춰 보세요" },
  { id: "coach", label: "AI 코치", sub: "Chrono-AI에게 물어보세요" },
  { id: "caffeine", label: "카페인", sub: "자는 동안에도 남아 있어요" },
  { id: "jetlag", label: "사회적 시차", sub: "내 몸은 지금 어느 도시일까요?" },
];
const IDS = ITEMS.map((i) => i.id);

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function goTo(id: string) {
  const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
  if (id === "top") {
    window.scrollTo({ top: 0, behavior });
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    return;
  }
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior, block: "start" });
  window.history.replaceState(null, "", `#${id}`); // 주소를 공유해도 그 파트로 열린다(스크롤은 건드리지 않는다)
}

/** 화면 위쪽 38% 선을 지난 마지막 파트를 "지금 위치"로 본다. 맨 아래에 닿으면 마지막 파트. */
function useActiveId(): string {
  const [active, setActive] = useState<string>(IDS[0]);

  useEffect(() => {
    let raf = 0;
    const compute = () => {
      raf = 0;
      const line = window.innerHeight * 0.38;
      let cur = IDS[0];
      for (const id of IDS) {
        if (id === "top") continue;
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) cur = id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = IDS[IDS.length - 1];
      setActive(cur);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return active;
}

/* ── 데스크톱: 점 레일 ── */
function Rail({ active }: { active: string }) {
  const [hover, setHover] = useState(false); // 마우스를 올렸거나 포커스가 있는 동안
  const [peek, setPeek] = useState(false); // 처음 방문 때 "메뉴예요" 하고 잠깐 펼쳐 보여준다
  const open = hover || peek;

  // 점만 보이면 메뉴인 줄 모를 수 있어서, 세션당 한 번만 잠깐 펼쳤다 접는다(모션 줄이기 설정이면 생략).
  useEffect(() => {
    let seen = false;
    try {
      seen = window.sessionStorage.getItem("ct-nav-peek") === "1";
      window.sessionStorage.setItem("ct-nav-peek", "1");
    } catch {
      /* 저장소를 못 읽으면 매번 보여줘도 괜찮다 */
    }
    if (seen || prefersReducedMotion() || window.innerWidth < 1024) return;
    const t1 = window.setTimeout(() => setPeek(true), 1400);
    const t2 = window.setTimeout(() => setPeek(false), 4200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  return (
    <nav
      aria-label="페이지 목차"
      data-sidenav="rail"
      className="fixed left-2 top-1/2 z-[45] hidden -translate-y-1/2 lg:block xl:left-4"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover(false);
      }}
    >
      <ol
        className={`flex flex-col rounded-[22px] py-3 pl-2 pr-1 transition-[background-color,box-shadow,padding] duration-300 xl:pl-3 ${
          open ? "bg-surface/90 pr-5 shadow-[0_10px_40px_rgb(0_0_0/0.18)] ring-1 ring-line/10 backdrop-blur-xl" : ""
        }`}
      >
        {ITEMS.map((it) => {
          const on = it.id === active;
          return (
            <li key={it.id}>
              <a
                href={it.id === "top" ? "#top" : `#${it.id}`}
                aria-current={on ? "location" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  goTo(it.id);
                }}
                className="group flex items-center rounded-full py-[7px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                  <span
                    className={`block rounded-full transition-all duration-300 ${
                      on
                        ? "h-2.5 w-2.5 bg-accent shadow-[0_0_0_4px_rgb(var(--accent)/0.2)]"
                        : "h-2 w-2 bg-fg/25 group-hover:bg-fg/55"
                    }`}
                  />
                </span>
                <span
                  className={`overflow-hidden whitespace-nowrap text-[15px] transition-[max-width,opacity,margin] duration-300 ${
                    open ? "ml-3 max-w-[160px] opacity-100" : "ml-0 max-w-0 opacity-0"
                  } ${on ? "font-semibold text-fg" : "font-medium text-fg-2 group-hover:text-fg"}`}
                >
                  {it.label}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ── 태블릿·모바일: 가장자리 탭 + 서랍 ── */
function Drawer({ active }: { active: string }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const tabRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const close = useCallback(() => setOpen(false), []);

  // 열려 있는 동안: Esc 로 닫기 · 뒤쪽 스크롤 잠금 · 닫기 버튼에 포커스
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    // 목록이 길어 스크롤되는 화면에서도 "지금 위치"가 바로 보이게 한다
    listRef.current?.querySelector('[aria-current="location"]')?.scrollIntoView({ block: "center" });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        tabRef.current?.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth >= 1024) close(); // 레일로 바뀌면 서랍은 닫는다
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  return (
    <div className="lg:hidden">
      <button
        ref={tabRef}
        type="button"
        aria-label="페이지 목차 열기"
        aria-expanded={open}
        data-sidenav="tab"
        onClick={() => setOpen(true)}
        className="fixed left-0 top-1/2 z-[45] flex h-14 w-6 -translate-y-1/2 items-center justify-center rounded-r-2xl bg-surface/90 text-fg-2 shadow-[0_4px_18px_rgb(0_0_0/0.16)] ring-1 ring-line/10 backdrop-blur-xl"
      >
        <ChevronRight className="h-5 w-5" strokeWidth={2.2} />
      </button>

      {/* 어두운 배경 — 누르면 닫힌다 */}
      <div
        aria-hidden
        onClick={close}
        className={`fixed inset-0 z-[55] bg-black/40 transition-opacity duration-300 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      <nav
        aria-label="페이지 목차"
        aria-hidden={!open}
        data-sidenav="drawer"
        data-open={open}
        className={`fixed inset-y-0 left-0 z-[56] flex w-[min(300px,82vw)] flex-col bg-surface shadow-[0_0_60px_rgb(0_0_0/0.3)] transition-[transform,visibility] duration-300 ${
          open ? "translate-x-0" : "invisible -translate-x-full"
        }`}
      >
        <div className="flex h-[60px] shrink-0 items-center justify-between px-5">
          <p className="text-[19px] font-semibold tracking-tight">이 페이지</p>
          <button ref={closeRef} type="button" aria-label="목차 닫기" onClick={close} className="icon-btn -mr-2">
            <X className="h-6 w-6" strokeWidth={2} />
          </button>
        </div>

        <ol ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {ITEMS.map((it, i) => {
            const on = it.id === active;
            return (
              <li key={it.id}>
                <a
                  href={it.id === "top" ? "#top" : `#${it.id}`}
                  aria-current={on ? "location" : undefined}
                  tabIndex={open ? 0 : -1}
                  onClick={(e) => {
                    e.preventDefault();
                    close();
                    // 서랍이 닫히며 스크롤 잠금이 풀린 뒤에 이동한다
                    window.setTimeout(() => goTo(it.id), 60);
                  }}
                  className={`flex items-center gap-4 rounded-2xl px-3 py-2.5 transition-colors ${
                    on ? "bg-fg/[0.07]" : "hover:bg-fg/[0.04]"
                  }`}
                >
                  <span
                    className={`w-6 shrink-0 text-right text-[14px] font-semibold tabular-nums ${on ? "text-tx-blue" : "text-fg-3"}`}
                  >
                    {String(i).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[17px] leading-tight ${on ? "font-semibold" : "font-medium"}`}>{it.label}</span>
                    <span className="mt-0.5 block truncate text-[14px] text-fg-2">{it.sub}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ol>

        <div className="flex shrink-0 flex-col items-start gap-2.5 border-t border-line/10 px-5 py-4 text-[15px]">
          <a href="/about" tabIndex={open ? 0 : -1} className="link !text-[16px]">
            개발 이야기(About)
            <span aria-hidden>›</span>
          </a>
          <a
            href="/dashboard.html"
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={open ? 0 : -1}
            className="link !text-[16px]"
          >
            정책 대시보드
            <span aria-hidden>›</span>
          </a>
        </div>
      </nav>
    </div>
  );
}

export default function SideNav() {
  const active = useActiveId();
  return (
    <>
      <Rail active={active} />
      <Drawer active={active} />
    </>
  );
}
