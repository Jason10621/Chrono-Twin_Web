"use client";

import { diagnosePhaseDelay, sleepStageLoss, PHASE_DIAGNOSIS_TONE } from "@/lib/chronoTwinModel";

/**
 * 유가빈(뇌과학·수면위상) 3주차 제안 — "단계별 뇌과학적 경고 로직 진단 카드"를 반영.
 * 추상적인 "위상 지연 N분"을 (1) 생활에 와닿는 심각도 등급 + 문장, (2) 오늘 밤
 * 잃게 되는 깊은잠(N3)·렘수면(REM) 분량으로 번역해서 보여준다.
 */
export default function DiagnosisCard({ phaseDelayMin }: { phaseDelayMin: number }) {
  const diag = diagnosePhaseDelay(phaseDelayMin);
  const loss = sleepStageLoss(phaseDelayMin);
  const tone = PHASE_DIAGNOSIS_TONE[diag.level];

  return (
    <div className="glass-panel rounded-2xl p-5 md:p-6 border-l-[3px]" style={{ borderLeftColor: tone }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-mono tracking-widest uppercase" style={{ color: tone }}>
          Brain Diagnosis
        </h3>
        <span className="text-[10px] font-mono text-white/30 uppercase">유가빈 · 뇌과학</span>
      </div>

      <div className="text-xl font-bold mb-1.5" style={{ color: tone }}>
        {diag.title}
      </div>
      <p className="text-sm text-white/60 leading-relaxed mb-5">{diag.detail}</p>

      <div className="text-[11px] uppercase tracking-wide text-white/35 font-mono mb-2">
        오늘 밤 예상 수면 구조 손실
      </div>
      <div className="space-y-2.5">
        <LossRow label="깊은 잠 (N3)" sub="성장호르몬 분비 · 뇌 노폐물 제거" lossMin={loss.n3LossMin} max={40} color="#a78bfa" />
        <LossRow label="렘수면 (REM)" sub="기억 재구성 · 감정 처리" lossMin={loss.remLossMin} max={40} color="#4fa3e0" />
      </div>
      {loss.n3LossMin === 0 && loss.remLossMin === 0 && (
        <p className="text-[11px] text-white/30 mt-3">현재 조건에서는 수면 구조 손실이 뚜렷하게 나타나지 않아요.</p>
      )}
    </div>
  );
}

function LossRow({
  label,
  sub,
  lossMin,
  max,
  color,
}: {
  label: string;
  sub: string;
  lossMin: number;
  max: number;
  color: string;
}) {
  const pct = Math.min(100, (lossMin / max) * 100);
  return (
    <div>
      <div className="flex justify-between items-baseline text-xs mb-1">
        <span className="text-white/70">
          {label} <span className="text-white/35 text-[10px]">· {sub}</span>
        </span>
        <span className="font-mono" style={{ color }}>
          {lossMin > 0 ? "−" : ""}
          {lossMin.toFixed(1)}분
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
