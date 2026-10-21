"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { DAWN_TEXT, KONAMI, SHEEP_FINALE, SHEEP_TOTAL, isDawn } from "@/lib/easter";

/** 글자를 직접 치는 칸에서는 코나미 코드를 받지 않는다(슬라이더는 괜찮다 — 위·아래·왼쪽·오른쪽이 서로 상쇄된다). */
function isTextEntry(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return el.type !== "range" && el.type !== "checkbox" && el.type !== "radio";
  return false;
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ── 7. 새벽 접속 배너 ── */
function DawnBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // ?egg=dawn 으로 낮에도 볼 수 있다(발표·시연용).
    const forced = new URLSearchParams(window.location.search).get("egg") === "dawn";
    let dismissed = false;
    try {
      dismissed = !forced && window.sessionStorage.getItem("ct-dawn-closed") === "1";
    } catch {
      /* 저장소를 못 읽어도 그냥 보여준다 */
    }
    setShow((forced || isDawn()) && !dismissed);
  }, []);

  if (!show) return null;
  return (
    <div
      role="status"
      data-egg="dawn"
      className="fixed inset-x-0 top-[52px] z-40 flex items-center justify-center gap-3 bg-[#1c1530] px-5 py-3 text-center text-[15px] font-medium leading-snug text-white shadow-[0_4px_20px_rgb(0_0_0/0.25)]"
    >
      <span>{DAWN_TEXT}</span>
      <button
        type="button"
        aria-label="닫기"
        onClick={() => {
          setShow(false);
          try {
            window.sessionStorage.setItem("ct-dawn-closed", "1");
          } catch {
            /* 무시 */
          }
        }}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/80 transition hover:bg-white/15"
      >
        <X className="h-[18px] w-[18px]" strokeWidth={2.2} />
      </button>
    </div>
  );
}

/* ── 6. 코나미 코드: 양 세기 ── */
const COUNT_MS = 7000;
const COUNT_MS_REDUCED = 1500;

function SheepCounter({ onClose }: { onClose: () => void }) {
  const [n, setN] = useState(0);
  const done = n >= SHEEP_TOTAL;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const duration = reducedMotion() ? COUNT_MS_REDUCED : COUNT_MS;
    const start = performance.now();
    // rAF 는 백그라운드 탭에서 멈추므로 타이머로 센다(경과 시간 기준이라 늦게 깨어나도 값이 맞는다).
    const id = window.setInterval(() => {
      const p = Math.min(1, (performance.now() - start) / duration);
      // 처음엔 느리게, 갈수록 빨라진다 — 양이 점점 안 세어지는 느낌.
      setN(Math.round(SHEEP_TOTAL * Math.pow(p, 2.2)));
      if (p >= 1) window.clearInterval(id);
    }, 40);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="양 세기"
      data-egg="sheep"
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center overflow-hidden bg-[#0a0f24]/[0.92] px-6 text-center text-white backdrop-blur-sm"
      onClick={onClose}
    >
      {/* 울타리 위를 뛰어넘는 양 세 마리 */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[22%] h-[140px]">
        <div className="absolute inset-x-0 bottom-0 h-px bg-white/25" />
        <div className="sheep-fence absolute bottom-0 left-1/2 h-[64px] w-[120px] -translate-x-1/2" />
        {[0, 0.8, 1.6].map((delay) => (
          <div key={delay} className="sheep-run absolute bottom-0 left-0" style={{ animationDelay: `-${delay}s` }}>
            <div className="sheep-hop text-[56px] leading-none" style={{ animationDelay: `-${delay / 2}s` }}>
              🐑
            </div>
          </div>
        ))}
      </div>

      <div className="relative z-10">
        <p className="text-[clamp(56px,14vw,120px)] font-semibold leading-none tracking-[-0.04em] tabular-nums">
          {n.toLocaleString("ko-KR")}
          <span className="ml-2 text-[0.28em] font-medium tracking-normal text-white/70">마리</span>
        </p>
        <p
          className="mt-8 min-h-[2.8em] max-w-xl text-[clamp(20px,3.4vw,30px)] font-semibold leading-snug"
          aria-live="polite"
        >
          {done ? SHEEP_FINALE : "양이 한 마리, 양이 두 마리…"}
        </p>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="btn mt-9 bg-white/15 text-white hover:bg-white/25"
        >
          {done ? "자러 갈게요" : "그만 셀래요"}
        </button>
      </div>
    </div>
  );
}

function Konami() {
  const [open, setOpen] = useState(false);
  const recent = useRef<string[]>([]);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTextEntry(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      // 최근 10개 키만 기억해서 비교한다 — 중간에 ↑를 더 눌러도 그 뒤가 맞으면 통과한다.
      const key = e.key.toLowerCase();
      if (key === "shift" || key === "capslock") return; // 대문자 B·A 를 칠 때 Shift 가 끼어들어도 무시
      const buf = recent.current;
      buf.push(key);
      if (buf.length > KONAMI.length) buf.shift();
      if (buf.length === KONAMI.length && buf.every((k, i) => k === KONAMI[i])) {
        recent.current = [];
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return open ? <SheepCounter onClose={close} /> : null;
}

export default function EasterEggs() {
  return (
    <>
      <DawnBanner />
      <Konami />
    </>
  );
}
