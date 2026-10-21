"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { DAWN_TEXT, KONAMI, isDawn } from "@/lib/easter";
import SheepGame from "./SheepGame";

/** 글자를 직접 치는 칸에서는 코나미 코드를 받지 않는다(슬라이더는 괜찮다 — 위·아래·왼쪽·오른쪽이 서로 상쇄된다). */
function isTextEntry(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return el.type !== "range" && el.type !== "checkbox" && el.type !== "radio";
  return false;
}

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

/* ── 6. 코나미 코드: 양 울타리 점프 미니게임 (components/SheepGame.tsx) ── */
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

  return open ? <SheepGame onClose={close} /> : null;
}

export default function EasterEggs() {
  return (
    <>
      <DawnBanner />
      <Konami />
    </>
  );
}
