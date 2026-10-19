"use client";

import { useState } from "react";
import { BookmarkCheck, Check, Trash2 } from "lucide-react";
import {
  formatDateKo,
  pendingEntry,
  todayKey,
  type Calibration,
  type LogEntry,
} from "@/lib/profile";

const signed = (m: number) => `${m >= 0 ? "+" : "−"}${Math.abs(Math.round(m))}`;

/**
 * "트윈"이 내 몸에 맞춰지는 곳 — 밤마다 예측을 저장하고, 다음 날 실제 값을 적으면
 * 예측과 실제의 평균 차이를 조금씩 반영한다(기록이 적을수록 조심스럽게). 전부 이 기기에만 저장돼요.
 */
export default function MyTwin({
  log,
  todayPredicted,
  calibration,
  useCalibration,
  onSaveToday,
  onAnswer,
  onSkip,
  onToggleCalibration,
  onClear,
}: {
  log: LogEntry[];
  /** 지금 입력값의 모형 예측(개인 보정을 뺀 값). */
  todayPredicted: number;
  calibration: Calibration;
  useCalibration: boolean;
  onSaveToday: () => void;
  onAnswer: (date: string, actual: number) => void;
  onSkip: (date: string) => void;
  onToggleCalibration: () => void;
  onClear: () => void;
}) {
  const today = todayKey();
  const pending = pendingEntry(log, today);
  const savedToday = log.find((e) => e.date === today);
  const [actual, setActual] = useState(0);
  const recent = [...log].reverse().slice(0, 6);
  const pct = ((actual + 60) / 240) * 100;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {pending && (
        <div className="card">
          <p className="t-eyebrow">어젯밤 확인</p>
          <p className="mt-3 text-[clamp(21px,2.8vw,28px)] font-semibold leading-snug tracking-tight">
            {formatDateKo(pending.date)} 밤엔 {signed(pending.predicted)}분이라고 예측했어요.
            <br />
            실제로는 평소보다 얼마나 늦게 잠들었나요?
          </p>
          <p className="mt-6 text-center text-[clamp(40px,8vw,64px)] font-semibold leading-none tracking-tight tabular-nums">
            {signed(actual)}
            <span className="ml-1 text-[0.3em] font-medium text-fg-2">분</span>
          </p>
          <input
            type="range"
            className="ct-slider mt-6"
            min={-60}
            max={180}
            step={5}
            value={actual}
            aria-label="실제로 평소보다 늦게 잠든 시간(분)"
            onChange={(e) => setActual(parseFloat(e.target.value))}
            style={{ ["--pct" as string]: `${pct}%`, ["--sc" as string]: "rgb(var(--sys-purple))" }}
          />
          <div className="mt-2 flex justify-between text-[14px] text-fg-2">
            <span>일찍 잠듦</span>
            <span>평소대로</span>
            <span>많이 늦게</span>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-5">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onAnswer(pending.date, actual);
                setActual(0);
              }}
            >
              <Check className="mr-2 h-5 w-5" strokeWidth={2.4} />
              기록하기
            </button>
            <button type="button" className="link" onClick={() => onSkip(pending.date)}>
              이 날은 건너뛸게요
            </button>
          </div>
        </div>
      )}

      <div className="card text-center">
        <p className="t-card-title">오늘 밤 예측을 저장해 둘까요?</p>
        <p className="t-lead mx-auto mt-3 max-w-xl">
          지금 예측은 <b className="font-semibold text-fg">{signed(todayPredicted)}분</b>이에요. 저장해 두면 내일 아침에 실제와
          비교해 볼 수 있어요.
        </p>
        <button type="button" className="btn btn-primary mt-7" onClick={onSaveToday}>
          <BookmarkCheck className="mr-2 h-5 w-5" strokeWidth={2.2} />
          {savedToday ? "다시 저장하기" : "오늘 밤 예측 저장하기"}
        </button>
        {savedToday && (
          <p className="mt-4 text-[16px] text-tx-green">
            {signed(savedToday.predicted)}분으로 저장했어요. 내일 아침에 물어볼게요.
          </p>
        )}
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="t-card-title">내 몸에 맞추기</p>
            <p className="mt-1 text-[16px] text-fg-2">
              {calibration.n === 0
                ? "실제 기록이 쌓이면 모형이 내 몸에 맞게 조금씩 보정돼요."
                : `기록 ${calibration.n}번 · 실제가 예측보다 평균 ${signed(calibration.meanError)}분`}
            </p>
          </div>
          <button
            type="button"
            className="chip"
            aria-pressed={useCalibration}
            disabled={calibration.n === 0}
            onClick={onToggleCalibration}
          >
            {useCalibration ? "✓ 보정 켜짐" : "보정 켜기"}
          </button>
        </div>

        {calibration.n > 0 && (
          <p className="mt-4 text-[16px] text-fg-2">
            {Math.abs(calibration.offsetMin) < 1
              ? "예측이 내 몸과 거의 맞아요. 보정할 게 없어요."
              : `기록이 적을수록 조금만 반영해서, 지금은 ${signed(calibration.offsetMin)}분만 더해요.`}
            {calibration.n < 3 && " (3번 이상 쌓이면 더 믿을 만해져요)"}
          </p>
        )}

        {recent.length > 0 && (
          <div className="mt-6 divide-y divide-line/10">
            <div className="grid grid-cols-[1fr_72px_72px_72px] gap-2 pb-2 text-[14px] font-medium text-fg-2">
              <span>날짜</span>
              <span className="text-right">예측</span>
              <span className="text-right">실제</span>
              <span className="text-right">차이</span>
            </div>
            {recent.map((e) => (
              <div
                key={e.date}
                className="grid grid-cols-[1fr_72px_72px_72px] gap-2 py-3 text-[17px] tabular-nums"
              >
                <span>{formatDateKo(e.date)}</span>
                <span className="text-right">{signed(e.predicted)}</span>
                <span className="text-right">{e.actual === undefined ? "–" : signed(e.actual)}</span>
                <span
                  className="text-right font-semibold"
                  style={{
                    color:
                      e.actual === undefined
                        ? "rgb(var(--fg-3))"
                        : Math.abs(e.actual - e.predicted) <= 13
                          ? "var(--t-green)"
                          : "var(--t-orange)",
                  }}
                >
                  {e.actual === undefined ? "대기" : signed(e.actual - e.predicted)}
                </span>
              </div>
            ))}
          </div>
        )}

        {log.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="mt-5 inline-flex items-center gap-1.5 text-[15px] text-fg-2 hover:text-fg"
          >
            <Trash2 className="h-4 w-4" strokeWidth={2} />
            기록 모두 지우기
          </button>
        )}
      </div>
    </div>
  );
}
