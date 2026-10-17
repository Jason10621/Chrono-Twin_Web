import type { Config } from "tailwindcss";

// 색은 모두 globals.css 의 CSS 변수(라이트/다크 전환) 에서 온다.
const rgb = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        // 애플 한국 사이트와 같은 계열: 애플 기기에선 SF Pro + Apple SD Gothic Neo,
        // 그 외 기기에선 SF와 가장 닮은 Pretendard 로 대체.
        sans: [
          '"SF Pro KR"',
          '"SF Pro Display"',
          '"SF Pro Text"',
          "-apple-system",
          "BlinkMacSystemFont",
          '"Apple SD Gothic Neo"',
          '"Pretendard Variable"',
          "Pretendard",
          '"Segoe UI"',
          '"Malgun Gothic"',
          "sans-serif",
        ],
        mono: ["ui-monospace", '"SF Mono"', "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        bg: rgb("bg"),
        surface: rgb("surface"),
        "surface-2": rgb("surface-2"),
        fg: rgb("fg"),
        "fg-2": rgb("fg-2"),
        "fg-3": rgb("fg-3"),
        line: rgb("line"),
        accent: rgb("accent"),
        "sys-blue": rgb("sys-blue"),
        "sys-green": rgb("sys-green"),
        "sys-orange": rgb("sys-orange"),
        "sys-red": rgb("sys-red"),
        "sys-purple": rgb("sys-purple"),
        "sys-teal": rgb("sys-teal"),
        "tx-blue": "var(--t-blue)",
        "tx-green": "var(--t-green)",
        "tx-orange": "var(--t-orange)",
        "tx-red": "var(--t-red)",
        "tx-purple": "var(--t-purple)",
        "tx-teal": "var(--t-teal)",
      },
      borderRadius: {
        card: "28px",
      },
      keyframes: {
        fadeUp: {
          "0%": { transform: "translateY(16px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};
export default config;
