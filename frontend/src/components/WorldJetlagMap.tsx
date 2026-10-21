"use client";

import { useEffect, useMemo, useState } from "react";
import { generateWorldDots } from "@/lib/worldDots";
import { SEOUL, matchJetlagCity } from "@/lib/jetlagCities";
import { MARIANA, MARS_DELAY_MIN, jetlagEgg } from "@/lib/easter";

const LAT_MIN = -58, LAT_MAX = 74, LON_MIN = -172, LON_MAX = 152;
const W = 1040, H = 425;

function project(lat: number, lon: number) {
  const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * W;
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * H;
  return { x, y };
}

function arcPath(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2;
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const bulge = Math.min(dist * 0.32, 130);
  const my = Math.min(y1, y2) - bulge;
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
}

/** 지도 위 이름표는 SVG 글자가 아니라 HTML — 화면이 작아져도 항상 읽히는 크기를 유지한다. */
function Pin({ x, y, text, below, tone }: { x: number; y: number; text: string; below?: boolean; tone: string }) {
  return (
    <span
      className="pointer-events-none absolute whitespace-nowrap rounded-full bg-surface/90 px-3 py-1 text-[15px] font-semibold shadow-[0_1px_6px_rgb(0_0_0/0.18)] backdrop-blur"
      style={{
        left: `${(x / W) * 100}%`,
        top: `${(y / H) * 100}%`,
        transform: `translate(-50%, ${below ? "50%" : "-150%"})`,
        color: tone,
      }}
    >
      {text}
    </span>
  );
}

function Clock({ label, time }: { label: string; time: string }) {
  return (
    <div className="tile flex-1 text-center">
      <p className="text-[16px] font-medium text-fg-2">{label}</p>
      <p className="mt-1 text-[clamp(32px,5vw,44px)] font-semibold leading-none tracking-tight tabular-nums">{time}</p>
    </div>
  );
}

// 화성은 지도 밖이라, 지도 오른쪽 위 구석에 작은 행성으로 표시한다.
const MARS_PT = { x: W * 0.9, y: 30 };

/**
 * 윤지후(정책)의 "사회적 시차" — 위상 지연을 실제 도시의 시차로 비유한 지도.
 * 두 도시의 현재 시각은 IANA 타임존으로 계산한 실제 값이다.
 * (이스터에그: 위상 지연이 ≈39분이면 화성, 극단이면 마리아나 해구 — lib/easter.ts)
 */
export default function WorldJetlagMap({ phaseDelayMin }: { phaseDelayMin: number }) {
  const dots = useMemo(() => generateWorldDots(), []);
  const { city, virtualHours } = useMemo(() => matchJetlagCity(phaseDelayMin), [phaseDelayMin]);
  const egg = useMemo(() => jetlagEgg(phaseDelayMin), [phaseDelayMin]);

  const seoulPt = project(SEOUL.lat, SEOUL.lon);
  const isSeoul = city.city === "서울";

  // 서울에서 어디로 "통근"했는지 — 에그가 있으면 그쪽이 우선한다.
  const dest = useMemo(() => {
    if (egg?.kind === "mars") return { name: "화성", pt: MARS_PT, tz: null as string | null, mars: true, below: true };
    if (egg?.kind === "mariana") {
      return { name: "마리아나 해구", pt: project(MARIANA.lat, MARIANA.lon), tz: MARIANA.timezone as string | null, mars: false, below: true };
    }
    if (isSeoul) return null;
    return { name: city.city, pt: project(city.lat, city.lon), tz: city.timezone as string | null, mars: false, below: false };
  }, [egg, isSeoul, city]);

  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const timeIn = (tz: string) =>
    now ? new Intl.DateTimeFormat("ko-KR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now) : "--:--";

  const headline =
    egg?.kind === "mars"
      ? "당신의 몸은 지금 화성입니다"
      : egg?.kind === "mariana"
        ? "마리아나 해구"
        : isSeoul
          ? "서울 그대로예요"
          : `${city.city} 시간이에요`;

  const sub =
    egg?.kind === "mars"
      ? "화성의 하루는 24시간 39분. 지구보다 딱 이만큼 길어요."
      : egg?.kind === "mariana"
        ? "수압 때문에 못 일어나요."
        : isSeoul
          ? "생체 시계와 생활이 잘 맞아요."
          : `서울보다 약 ${virtualHours.toFixed(1)}시간 느려요. ${city.blurb}`;

  return (
    <div className="card">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full select-none" role="img" aria-label="세계 시차 지도">
          <defs>
            <radialGradient id="jl-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" style={{ stopColor: "rgb(var(--sys-blue))" }} stopOpacity="0.8" />
              <stop offset="100%" style={{ stopColor: "rgb(var(--sys-blue))" }} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="jl-glow-warn" cx="50%" cy="50%" r="50%">
              <stop offset="0%" style={{ stopColor: "rgb(var(--sys-red))" }} stopOpacity="0.85" />
              <stop offset="100%" style={{ stopColor: "rgb(var(--sys-red))" }} stopOpacity="0" />
            </radialGradient>
          </defs>

          {dots.map(([lat, lon], i) => {
            const { x, y } = project(lat, lon);
            return <circle key={i} cx={x} cy={y} r={1.6} className="fill-fg/25" />;
          })}

          {dest && (
            <path
              d={dest.mars ? `M ${seoulPt.x} ${seoulPt.y} L ${dest.pt.x} ${dest.pt.y}` : arcPath(seoulPt.x, seoulPt.y, dest.pt.x, dest.pt.y)}
              fill="none"
              className="jetlag-arc stroke-sys-orange"
              strokeWidth={3}
              strokeDasharray="8 8"
              strokeLinecap="round"
            />
          )}

          <circle cx={seoulPt.x} cy={seoulPt.y} r={18} fill="url(#jl-glow)" />
          <circle cx={seoulPt.x} cy={seoulPt.y} r={6} className="fill-sys-blue stroke-surface" strokeWidth={2.5} />

          {dest && (
            <>
              <circle cx={dest.pt.x} cy={dest.pt.y} r={20} fill="url(#jl-glow-warn)" className="jetlag-pulse" />
              <circle
                cx={dest.pt.x}
                cy={dest.pt.y}
                r={dest.mars ? 11 : 7}
                className={`${dest.mars ? "fill-sys-orange" : "fill-sys-red"} stroke-surface`}
                strokeWidth={2.5}
              />
            </>
          )}
        </svg>

        <Pin x={seoulPt.x} y={seoulPt.y} text="서울" below tone="var(--t-blue)" />
        {dest && <Pin x={dest.pt.x} y={dest.pt.y} text={dest.name} below={dest.below} tone="var(--t-red)" />}
      </div>

      <div className="mt-10 text-center">
        <p className="text-[17px] font-medium text-fg-2">오늘 내 몸의 시간</p>
        <p
          data-egg={egg?.kind ?? undefined}
          className="mt-2 text-[clamp(36px,6vw,64px)] font-semibold leading-tight tracking-[-0.03em]"
        >
          {headline}
        </p>
        <p className="t-lead mx-auto mt-3 max-w-2xl">{sub}</p>
        {egg?.kind === "mars-over" && (
          <p className="mx-auto mt-3 max-w-2xl text-[19px] font-semibold text-tx-orange">
            화성보다 {egg.overMin}분 더 늦음. 화성도 당신을 기다려주지 않아요
          </p>
        )}
      </div>

      <div className="mt-8 flex gap-3">
        <Clock label="지금 서울" time={timeIn(SEOUL.timezone)} />
        {egg?.kind === "mars" ? (
          <Clock label="화성의 하루" time={`24:${MARS_DELAY_MIN}`} />
        ) : (
          dest && dest.tz && <Clock label={`지금 ${dest.name}`} time={timeIn(dest.tz)} />
        )}
      </div>

      <p className="mt-6 text-center text-[14px] text-fg-2">발표용 비유예요. 실제 시차 계산은 아니에요.</p>
    </div>
  );
}
