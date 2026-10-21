"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LOGO_CLICKS, TWIN_TEXT } from "@/lib/easter";

const CLICK_GAP_MS = 320; // 이 안에 다시 누르면 연타로 센다
const TWIN_VISIBLE_MS = 7000;

/**
 * 로고. 평소에는 홈으로 가는 링크 그대로이고(수정키·가운데 클릭은 기본 동작),
 * 이스터에그: 5번 연달아 누르면 옆에 졸린 쌍둥이가 나타나 말을 건다.
 * 연타를 기다리느라 한 번 클릭의 이동이 0.3초쯤 늦어진다.
 */
export default function Wordmark() {
  const router = useRouter();
  const pathname = usePathname();
  const clicks = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [twin, setTwin] = useState(false);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    []
  );

  const showTwin = () => {
    setTwin(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setTwin(false), TWIN_VISIBLE_MS);
  };

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();

    clicks.current += 1;
    if (timer.current) clearTimeout(timer.current);

    if (clicks.current >= LOGO_CLICKS) {
      clicks.current = 0;
      showTwin();
      return;
    }

    timer.current = setTimeout(() => {
      clicks.current = 0;
      if (pathname === "/") window.scrollTo({ top: 0, behavior: "smooth" });
      else router.push("/");
    }, CLICK_GAP_MS);
  };

  return (
    <div className="relative">
      <a href="/" onClick={onClick} className="text-[19px] font-semibold tracking-tight">
        Chrono-Twin
      </a>
      {twin && (
        // 위치(translate)는 바깥 상자가, 등장 애니메이션(transform)은 안쪽 버튼이 맡는다.
        <div className="absolute left-0 top-[calc(100%+12px)] z-10 sm:left-[calc(100%+16px)] sm:top-1/2 sm:-translate-y-1/2">
          <button
            type="button"
            onClick={() => setTwin(false)}
            aria-label="졸린 쌍둥이 닫기"
            data-egg="twin"
            className="twin-pop flex w-max max-w-[min(300px,calc(100vw-40px))] items-center gap-3 rounded-[20px] bg-surface px-4 py-2.5 text-left shadow-[0_8px_30px_rgb(0_0_0/0.22)] ring-1 ring-line/10 sm:max-w-none"
          >
            <span aria-hidden className="shrink-0 whitespace-nowrap text-[24px] leading-none">
              😴😴
            </span>
            <span className="text-[15px] font-medium leading-snug sm:whitespace-nowrap">{TWIN_TEXT}</span>
          </button>
        </div>
      )}
    </div>
  );
}
