"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import type { ChronoTwinInputs } from "@/lib/chronoTwinModel";

// 서버가 모델별로 자체 타임아웃(1차 10초 + 2차 20초)을 두므로 넉넉히 35초로 설정.
const REQUEST_TIMEOUT_MS = 35_000;
const LONG_WAIT_MS = 7_000;

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "오늘 카페인 괜찮을까?",
  "가장 큰 원인이 뭐야?",
  "오늘 몇 시에 자는 게 좋아?",
  "조명은 어떻게 바꿔야 해?",
];

/**
 * "Chrono-AI" — 방금 입력한 습관(inputs)을 서버로 보내면 서버가 같은 계산식으로 직접
 * 재계산한 뒤 그 수치를 근거로 Gemini 가 답한다. 클라이언트는 표시만 담당(수치 조작 방지).
 */
export default function ChronoAI({ inputs }: { inputs: ChronoTwinInputs }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [longWait, setLongWait] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const longWaitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
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
        body: JSON.stringify({ inputs, messages: next }),
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
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
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

  return (
    <div className="card mx-auto max-w-3xl">
      {messages.length === 0 ? (
        <div className="flex flex-wrap justify-center gap-2.5 pb-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => send(s)} className="chip">
              {s}
            </button>
          ))}
        </div>
      ) : (
        <div ref={scrollRef} className="max-h-[440px] space-y-3 overflow-y-auto pb-2 pr-1">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[88%] whitespace-pre-wrap rounded-[24px] px-5 py-3.5 text-[18px] leading-[1.55] ${
                  m.role === "user" ? "bg-accent text-white" : "bg-surface-2 text-fg"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-[24px] bg-surface-2 px-5 py-3.5 text-[17px] text-fg-2">
                {longWait ? "조금 더 걸리고 있어요. 잠시만요…" : "생각하는 중…"}
              </div>
            </div>
          )}
        </div>
      )}

      {notice && <p className="mt-4 text-center text-[16px] text-tx-orange">{notice}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
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
