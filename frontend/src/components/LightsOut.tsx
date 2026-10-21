"use client";

import { useEffect, useRef } from "react";

/**
 * 이스터에그 — 방 조명을 0lux 로 내리면 화면이 어두워지고 마우스(손가락) 주변만 동그랗게 보인다.
 * 오버레이는 pointer-events 를 막지 않으므로 슬라이더를 다시 올릴 수 있고, Esc 로도 불을 켤 수 있다.
 * 한가운데의 작은 글씨는 어둠 층 "아래"에 있어서 손전등이 지나갈 때만 읽힌다.
 */
export default function LightsOut({
  active,
  hint,
  onLightsOn,
}: {
  active: boolean;
  hint: string;
  onLightsOn: () => void;
}) {
  const dark = useRef<HTMLDivElement>(null);
  const pos = useRef<{ x: number; y: number } | null>(null);

  const paint = () => {
    const el = dark.current;
    if (!el) return;
    const p = pos.current ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    el.style.setProperty("--mx", `${p.x}px`);
    el.style.setProperty("--my", `${p.y}px`);
  };

  // 슬라이더를 끌던 위치에서 바로 손전등이 켜지도록, 포인터 위치는 항상 기억해 둔다.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      pos.current = { x: e.clientX, y: e.clientY };
      paint();
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", move);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    paint();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onLightsOn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onLightsOn]);

  if (!active) return null;

  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center">
        <p className="select-none rounded-full bg-black/80 px-4 py-1.5 text-center text-[13px] text-white">{hint}</p>
      </div>
      <div ref={dark} aria-hidden data-egg="lights-out" className="lights-out pointer-events-none fixed inset-0 z-[71]" />
    </>
  );
}
