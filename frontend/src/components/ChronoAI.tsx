"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, Undo2 } from "lucide-react";
import {
  applyWhatIf,
  computeChronoTwin,
  type ChronoTwinInputs,
  type WhatIfAction,
} from "@/lib/chronoTwinModel";
import { chatEgg } from "@/lib/easter";

// 서버가 모델별로 자체 타임아웃(1차 10초 + 2차 20초)을 두므로 넉넉히 35초로 설정.
const REQUEST_TIMEOUT_MS = 35_000;
const LONG_WAIT_MS = 7_000;

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  /** 이스터에그 대화 — 서버(AI)로는 보내지 않는다. */
  local?: boolean;
}

/** 슬라이더가 바뀐 것을 알려주는 카드. AI 서버로는 보내지 않는다(서버가 이전 입력값으로 직접 비교한다). */
interface ChangeMsg {
  kind: "change";
  summary: string;
  before: ChronoTwinInputs;
  beforeMin: number;
  afterMin: number;
  undone?: boolean;
}

type Item = (ChatMsg & { kind?: undefined }) | ChangeMsg;

/** 누르면 슬라이더 값이 바로 바뀌는 질문 칩. */
const ACTION_CHIPS: { label: string; key: WhatIfAction["key"]; ask: string }[] = [
  { label: "카페인 끊으면?", key: "caffeine", ask: "오늘 카페인을 끊으면 내일은 어떻게 달라져?" },
  { label: "폰 끄면?", key: "phone", ask: "자기 전에 스마트폰을 끄면 어떻게 달라져?" },
  { label: "조명 바꾸면?", key: "light", ask: "방 조명을 바꾸면 어떻게 달라져?" },
  { label: "30분 더 자면?", key: "sleep", ask: "하루에 30분 더 자면 어떻게 달라져?" },
];

/** 그냥 물어보는 칩(슬라이더는 그대로). */
const PLAIN_CHIPS = ["가장 큰 원인이 뭐야?", "오늘 몇 시에 자는 게 좋아?"];

const round = (n: number) => Math.round(n);
const signed = (m: number) => `${m >= 0 ? "+" : "−"}${Math.abs(round(m))}`;

function describeChange(key: WhatIfAction["key"], a: ChronoTwinInputs, b: ChronoTwinInputs): string {
  switch (key) {
    case "caffeine":
      return `카페인 ${round(a.caffeineMg)}mg → ${round(b.caffeineMg)}mg`;
    case "phone":
      return `스마트폰 ${round(a.bluelightMin)}분 → ${round(b.bluelightMin)}분`;
    case "light":
      return `조명 ${round(a.ledLux)}lux · ${round(a.ledColorTempK)}K → ${round(b.ledLux)}lux · ${round(b.ledColorTempK)}K`;
    case "sleep":
      return `평균 수면 ${a.avgRecentSleepHours.toFixed(1)}시간 → ${b.avgRecentSleepHours.toFixed(1)}시간`;
    case "exercise":
      return `오늘 운동 ${a.exercisedToday ? "함" : "안 함"} → ${b.exercisedToday ? "함" : "안 함"}`;
  }
}

function sameRaw(a: ChronoTwinInputs, b: ChronoTwinInputs): boolean {
  return (
    a.bluelightMin === b.bluelightMin &&
    a.screenBrightness === b.screenBrightness &&
    a.caffeineMg === b.caffeineMg &&
    a.hoursSinceCaffeine === b.hoursSinceCaffeine &&
    a.ledLux === b.ledLux &&
    a.ledColorTempK === b.ledColorTempK &&
    a.avgRecentSleepHours === b.avgRecentSleepHours &&
    a.exercisedToday === b.exercisedToday
  );
}

/**
 * "Chrono-AI" — 방금 입력한 습관(inputs)을 서버로 보내면 서버가 같은 계산식으로 직접
 * 재계산한 뒤 그 수치를 근거로 Gemini 가 답한다. 클라이언트는 표시만 담당(수치 조작 방지).
 * 질문 칩 중 일부는 슬라이더 값을 바로 바꾸고(onApply), 서버에는 바뀌기 전 입력값도 함께 보내
 * AI 가 "무엇이 얼마나 달라졌는지"부터 설명하게 한다.
 */
export default function ChronoAI({
  inputs,
  onApply,
}: {
  inputs: ChronoTwinInputs;
  onApply: (next: ChronoTwinInputs) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [longWait, setLongWait] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const longWaitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eggTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [items, loading]);

  useEffect(
    () => () => {
      if (eggTimer.current) clearTimeout(eggTimer.current);
    },
    []
  );

  async function send(text: string, opts?: { inputs?: ChronoTwinInputs; previous?: ChronoTwinInputs; prefix?: Item[] }) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    // 이스터에그: "졸려" · "잘 자" · "치킨" 같은 한마디에는 AI 를 부르지 않고 바로(혹은 일부러 늦게) 답한다.
    const egg = chatEgg(trimmed);
    if (egg) {
      setItems([...items, ...(opts?.prefix ?? []), { role: "user", content: trimmed, local: true }]);
      setInput("");
      setNotice(null);
      setLoading(true);
      eggTimer.current = setTimeout(() => {
        setItems((m) => [...m, { role: "assistant", content: egg.reply, local: true }]);
        setLoading(false);
      }, egg.delayMs);
      return;
    }

    const next: Item[] = [...items, ...(opts?.prefix ?? []), { role: "user", content: trimmed }];
    setItems(next);
    setInput("");
    setLoading(true);
    setLongWait(false);
    setNotice(null);

    longWaitTimer.current = setTimeout(() => setLongWait(true), LONG_WAIT_MS);
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch("/api/chrono-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs: opts?.inputs ?? inputs,
          previousInputs: opts?.previous,
          messages: next.filter((m): m is ChatMsg & { kind?: undefined } => m.kind !== "change" && !m.local),
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.error === "no_provider_configured") {
          setNotice("AI 코치가 아직 연결되지 않았어요. GEMINI_API_KEY를 등록하면 바로 쓸 수 있어요.");
        } else {
          setNotice("지금 AI 쪽이 혼잡해요. 잠시 후 다시 시도해주세요.");
        }
        return;
      }
      setItems((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setNotice("응답이 너무 늦어 요청을 멈췄어요. 잠시 후 다시 시도해주세요.");
      } else {
        setNotice("네트워크 오류로 응답을 받지 못했어요.");
      }
    } finally {
      if (longWaitTimer.current) clearTimeout(longWaitTimer.current);
      clearTimeout(abortTimer);
      setLoading(false);
      setLongWait(false);
    }
  }

  /** 슬라이더를 실제로 바꾸고, 변화 카드를 띄운 뒤, AI 에게 그 변화를 설명해 달라고 한다. */
  function runAction(chip: (typeof ACTION_CHIPS)[number]) {
    if (loading) return;
    const next = applyWhatIf(inputs, chip.key);
    if (sameRaw(next, inputs)) {
      setNotice("이미 그렇게 하고 계세요. 바꿀 게 없어요.");
      return;
    }
    const beforeMin = computeChronoTwin(inputs).phaseDelayMin;
    const afterMin = computeChronoTwin(next).phaseDelayMin;
    const card: ChangeMsg = {
      kind: "change",
      summary: describeChange(chip.key, inputs, next),
      before: inputs,
      beforeMin,
      afterMin,
    };
    onApply(next);
    void send(chip.ask, { inputs: next, previous: inputs, prefix: [card] });
  }

  function undo(index: number) {
    const card = items[index];
    if (!card || card.kind !== "change" || card.undone) return;
    onApply(card.before);
    setItems((all) => all.map((m, i) => (i === index && m.kind === "change" ? { ...m, undone: true } : m)));
  }

  return (
    <div className="card mx-auto max-w-3xl">
      {items.length === 0 ? (
        <div className="pb-2">
          <p className="mb-4 text-center text-[15px] text-fg-2">눌러 보세요. 위의 슬라이더가 바로 바뀌어요.</p>
          <div className="flex flex-wrap justify-center gap-2.5">
            {ACTION_CHIPS.map((c) => (
              <button key={c.key} type="button" onClick={() => runAction(c)} className="chip">
                {c.label}
              </button>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap justify-center gap-2.5">
            {PLAIN_CHIPS.map((s) => (
              <button key={s} type="button" onClick={() => void send(s)} className="chip">
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="max-h-[480px] space-y-3 overflow-y-auto pb-2 pr-1">
            {items.map((m, i) =>
              m.kind === "change" ? (
                <div key={i} className="flex justify-center">
                  <div className="w-full max-w-[92%] rounded-[20px] bg-sys-blue/10 px-5 py-4 text-center">
                    <p className="text-[15px] font-medium text-fg-2">슬라이더를 바꿨어요</p>
                    <p className="mt-1 text-[18px] font-semibold">{m.summary}</p>
                    <p className="mt-2 flex flex-wrap items-center justify-center gap-x-2 text-[22px] font-semibold tabular-nums">
                      <span>{signed(m.beforeMin)}분</span>
                      <ArrowRight className="h-5 w-5 text-fg-3" strokeWidth={2.4} />
                      <span className="text-tx-blue">{signed(m.afterMin)}분</span>
                      <span className="text-[17px] font-medium text-tx-green">
                        ({signed(m.afterMin - m.beforeMin)}분)
                      </span>
                    </p>
                    <button
                      type="button"
                      disabled={m.undone}
                      onClick={() => undo(i)}
                      className="mt-3 inline-flex items-center gap-1.5 text-[15px] font-medium text-tx-blue disabled:text-fg-3"
                    >
                      <Undo2 className="h-4 w-4" strokeWidth={2.2} />
                      {m.undone ? "되돌렸어요" : "되돌리기"}
                    </button>
                  </div>
                </div>
              ) : (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[88%] whitespace-pre-wrap rounded-[24px] px-5 py-3.5 text-[18px] leading-[1.55] ${
                      m.role === "user" ? "bg-accent text-white" : "bg-surface-2 text-fg"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              )
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-[24px] bg-surface-2 px-5 py-3.5 text-[17px] text-fg-2">
                  {longWait ? "조금 더 걸리고 있어요. 잠시만요…" : "생각하는 중…"}
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-3">
            {ACTION_CHIPS.map((c) => (
              <button
                key={c.key}
                type="button"
                disabled={loading}
                onClick={() => runAction(c)}
                className="chip !min-h-[40px] !px-4 !text-[15px] disabled:opacity-50"
              >
                {c.label}
              </button>
            ))}
          </div>
        </>
      )}

      {notice && <p className="mt-4 text-center text-[16px] text-tx-orange">{notice}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="mt-6 flex items-center gap-2 rounded-full bg-surface-2 p-1.5 pl-6"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="내 수면에 대해 물어보세요"
          aria-label="Chrono-AI에게 질문하기"
          className="min-w-0 flex-1 bg-transparent py-3 text-[18px] text-fg outline-none placeholder:text-fg-3"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          aria-label="보내기"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-white transition disabled:opacity-35"
        >
          <ArrowUp className="h-6 w-6" strokeWidth={2.4} />
        </button>
      </form>
    </div>
  );
}
