"use client";

import { useMemo } from "react";
import {
  caffeineDecayCurve,
  caffeineFamiliarUnits,
  caffeineSafeHoursNeeded,
} from "@/lib/chronoTwinModel";

const CORAL = "#ff6a52";
const AMBER = "#f6b352";

const UNIT_ICON: Record<string, string> = { coffee: "☕", energy: "⚡", candy: "🍬" };

/**
 * 홍서준(약학) 3주차 제작물 "Dose Echo"를 사이트에 통합한 버전.
 * 원본: 유리프/활동 내용/3주차/caffeine-dose-echo.html (독립 페이지).
 * 잔존 카페인(mg)을 실생활 소비 단위로 환산해 "숫자"를 "감각"으로 번역한다.
 * 사이트 본체(보라·초록)와 구분되도록 코랄·앰버를 그대로 유지 — 파트별 기여를
 * 시각적으로도 드러내는 의도적 선택.
 */
export default function CaffeineConverter({
  doseMg,
  hoursElapsed,
  residueMg,
}: {
  doseMg: number;
  hoursElapsed: number;
  residueMg: number;
}) {
  const units = useMemo(() => caffeineFamiliarUnits(residueMg), [residueMg]);
  const curve = useMemo(() => caffeineDecayCurve(Math.max(doseMg, 1), 10, 48), [doseMg]);
  const safeHours = caffeineSafeHoursNeeded(doseMg);
  const stillUnsafe = safeHours > hoursElapsed;

  const top = units.reduce((a, b) => (b.count > a.count ? b : a), units[0]);

  return (
    <div
      className="rounded-2xl p-5 md:p-6 border-l-[3px]"
      style={{
        borderLeftColor: CORAL,
        background: "linear-gradient(155deg, rgba(255,106,82,0.07), rgba(246,179,82,0.03))",
        border: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-mono tracking-widest uppercase" style={{ color: CORAL }}>
          Dose Echo
        </h3>
        <span className="text-[10px] font-mono text-white/30 uppercase">홍서준 · 약학</span>
      </div>

      <p className="text-sm text-white/60 leading-relaxed mb-4">
        취침 시점에 몸에 남아있는 카페인 <b className="text-white/85">{residueMg.toFixed(0)}mg</b>은,
        {top && top.count >= 0.1 ? (
          <>
            {" "}
            <b style={{ color: AMBER }}>{top.label} 약 {top.count.toFixed(1)}{top.key === "coffee" ? "잔" : top.key === "energy" ? "캔" : "개"}</b>
            {" "}분량이 그대로 남아있는 것과 같아요.
          </>
        ) : (
          " 사실상 거의 다 대사된 양이에요."
        )}
      </p>

      <div className="grid grid-cols-3 gap-2.5 mb-5">
        {units.map((u) => (
          <div key={u.key} className="rounded-xl bg-black/20 px-3 py-3 text-center">
            <div className="text-lg mb-1">{UNIT_ICON[u.key]}</div>
            <div className="text-base font-bold font-mono" style={{ color: AMBER }}>
              {u.count.toFixed(1)}
            </div>
            <div className="text-[10px] text-white/50 mt-0.5">{u.label}</div>
            <div className="text-[9px] text-white/25 mt-0.5">{u.basis}</div>
          </div>
        ))}
      </div>

      <DecayCurve curve={curve} markerHour={hoursElapsed} markerMg={residueMg} />

      <p className="text-[11px] text-white/40 mt-4 leading-relaxed">
        {stillUnsafe ? (
          <>
            <span style={{ color: CORAL }}>⚠</span> 오늘 섭취량({doseMg.toFixed(0)}mg)이 안전 수준(50mg)
            아래로 내려가려면 섭취 후 총 <b className="text-white/70">{safeHours.toFixed(1)}시간</b>이
            필요해요 — 아직 {(safeHours - hoursElapsed).toFixed(1)}시간 더 기다려야 합니다.
          </>
        ) : (
          <>이미 안전 수준(50mg) 아래로 내려간 상태예요.</>
        )}
      </p>
    </div>
  );
}

function DecayCurve({
  curve,
  markerHour,
  markerMg,
}: {
  curve: { h: number; mg: number }[];
  markerHour: number;
  markerMg: number;
}) {
  const W = 320, H = 96, padL = 4, padR = 4, padT = 8, padB = 18;
  const maxH = curve[curve.length - 1]?.h || 10;
  const maxMg = Math.max(1, ...curve.map((p) => p.mg));

  const x = (h: number) => padL + (h / maxH) * (W - padL - padR);
  const y = (mg: number) => padT + (1 - mg / maxMg) * (H - padT - padB);

  const path = curve.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.h).toFixed(1)},${y(p.mg).toFixed(1)}`).join(" ");
  const mx = Math.min(x(markerHour), W - padR);
  const my = y(markerMg);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="카페인 감소 곡선">
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
      <path d={path} fill="none" stroke={CORAL} strokeWidth={2} />
      <line x1={mx} y1={my} x2={mx} y2={H - padB} stroke={AMBER} strokeWidth={1} strokeDasharray="3,3" />
      <circle cx={mx} cy={my} r={4} fill={AMBER} stroke="#0b0c10" strokeWidth={1.5} />
      <text x={padL} y={H - 5} fill="rgba(255,255,255,0.3)" fontSize={9} fontFamily="ui-monospace, monospace">0h</text>
      <text x={W - padR} y={H - 5} fill="rgba(255,255,255,0.3)" fontSize={9} fontFamily="ui-monospace, monospace" textAnchor="end">{maxH}h</text>
    </svg>
  );
}
