"use client";

import { useMemo } from "react";
import { generateWorldDots } from "@/lib/worldDots";
import { SEOUL, matchJetlagCity } from "@/lib/jetlagCities";

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

export default function WorldJetlagMap({ phaseDelayMin }: { phaseDelayMin: number }) {
  const dots = useMemo(() => generateWorldDots(), []);
  const { city, virtualHours } = useMemo(() => matchJetlagCity(phaseDelayMin), [phaseDelayMin]);

  const seoulPt = project(SEOUL.lat, SEOUL.lon);
  const cityPt = project(city.lat, city.lon);
  const isSeoul = city.city === "서울";

  return (
    <div className="glass-panel rounded-2xl p-5 md:p-7 relative overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h3 className="text-sm font-mono tracking-widest text-accent uppercase">Social Jetlag Map</h3>
        <span className="text-xs text-white/40 font-mono">가상 시차 ≈ {virtualHours.toFixed(1)}h</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img" aria-label="세계 시차 지도">
        <defs>
          <radialGradient id="jl-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#4fa3e0" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#4fa3e0" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="jl-glow-warn" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f87171" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#f87171" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* 위경도 그리드 (레이더 느낌) */}
        {Array.from({ length: 7 }, (_, i) => {
          const lat = LAT_MIN + (i * (LAT_MAX - LAT_MIN)) / 6;
          const y = project(lat, 0).y;
          return <line key={`g-lat-${i}`} x1={0} y1={y} x2={W} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />;
        })}
        {Array.from({ length: 9 }, (_, i) => {
          const lon = LON_MIN + (i * (LON_MAX - LON_MIN)) / 8;
          const x = project(0, lon).x;
          return <line key={`g-lon-${i}`} x1={x} y1={0} x2={x} y2={H} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />;
        })}

        {/* 대륙 점묘 */}
        {dots.map(([lat, lon], i) => {
          const { x, y } = project(lat, lon);
          return <circle key={i} cx={x} cy={y} r={1.35} fill="rgba(148,163,184,0.55)" />;
        })}

        {/* 비행 항로 아크 */}
        {!isSeoul && (
          <path
            d={arcPath(seoulPt.x, seoulPt.y, cityPt.x, cityPt.y)}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="6 6"
            className="jetlag-arc"
          />
        )}

        {/* 서울 마커 */}
        <circle cx={seoulPt.x} cy={seoulPt.y} r={16} fill="url(#jl-glow)" />
        <circle cx={seoulPt.x} cy={seoulPt.y} r={4} fill="#4fa3e0" stroke="#0b0c10" strokeWidth={1.5} />
        <text x={seoulPt.x} y={seoulPt.y - 12} textAnchor="middle" fontSize={12} fill="#cfe4f7" fontFamily="ui-monospace, monospace">
          서울 (기준)
        </text>

        {/* 목적지 마커 */}
        {!isSeoul && (
          <>
            <circle cx={cityPt.x} cy={cityPt.y} r={20} fill="url(#jl-glow-warn)" className="jetlag-pulse" />
            <circle cx={cityPt.x} cy={cityPt.y} r={5} fill="#f87171" stroke="#0b0c10" strokeWidth={1.5} />
            <text x={cityPt.x} y={cityPt.y - 14} textAnchor="middle" fontSize={13} fontWeight={700} fill="#ffd9d9" fontFamily="ui-monospace, monospace">
              {city.city}
            </text>
          </>
        )}
      </svg>

      <div className="mt-5 flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
        <div>
          <div className="text-xs text-white/40 font-mono uppercase tracking-wide mb-1">오늘의 체감 시차</div>
          <div className="text-2xl md:text-3xl font-extrabold">
            {isSeoul ? (
              <span className="text-accent">시차 없음</span>
            ) : (
              <>
                <span className="text-red-300">{city.city}</span>
                <span className="text-white/50 text-base font-medium">, {city.country}</span>
              </>
            )}
          </div>
        </div>
        <p className="text-sm text-white/60 leading-relaxed flex-1">
          {isSeoul
            ? "오늘 입력한 습관대로라면 생체 시계와 실제 생활 사이에 시차가 거의 없습니다."
            : `당신의 어젯밤 수면 패턴은 서울과 약 ${virtualHours.toFixed(1)}시간 시차가 나는 「${city.city}」에서 살다 온 것과 같습니다. ${city.blurb}`}
        </p>
      </div>

      <p className="mt-4 text-[11px] text-white/30 leading-relaxed border-t border-white/10 pt-3">
        ※ 이 지도는 "매일 아침 해외여행을 다녀오듯 시차 부적응을 겪는다"는 사회적 시차증(Social Jetlag) 개념을
        체감할 수 있도록 만든 발표용 은유이며, 실제 표준시 차이를 과학적으로 계산한 것이 아닙니다.
        (기준: 위상 지연 추정치 × 발표용 배율)
      </p>
    </div>
  );
}
