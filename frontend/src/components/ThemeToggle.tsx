"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "ct-theme";

function applyTheme(dark: boolean) {
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

/**
 * 라이트/다크 전환. 처음엔 기기 설정을 따르고, 한 번 직접 고르면 그 선택을 기억한다.
 * (깜빡임 방지용 초기 클래스는 layout.tsx 의 인라인 스크립트가 먼저 붙여둔다.)
 */
export default function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = (e: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem(KEY)) return; // 직접 고른 값이 있으면 그걸 우선
      } catch {}
      applyTheme(e.matches);
      setDark(e.matches);
    };
    mq.addEventListener("change", onSystemChange);
    return () => mq.removeEventListener("change", onSystemChange);
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    applyTheme(next);
    setDark(next);
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {}
  }

  const label = dark ? "라이트 모드로 전환" : "다크 모드로 전환";

  return (
    <button type="button" onClick={toggle} aria-label={label} title={label} className="icon-btn">
      {dark === null ? (
        <span className="block h-5 w-5" />
      ) : dark ? (
        <Sun className="h-[22px] w-[22px]" strokeWidth={1.8} />
      ) : (
        <Moon className="h-[22px] w-[22px]" strokeWidth={1.8} />
      )}
    </button>
  );
}
