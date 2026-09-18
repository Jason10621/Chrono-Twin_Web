"use client";

import { useState } from "react";
import type { ChronoTwinInputs } from "@/lib/chronoTwinModel";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "오늘 카페인 섭취, 지금 상태로 괜찮은 편이야?",
  "내 위상 지연의 가장 큰 원인이 뭐야?",
  "오늘 밤엔 몇 시쯤 자는 게 좋을까?",
  "조명을 어떻게 바꾸면 가장 효과적일까?",
];

/**
 * "Chrono-AI" — 사용자가 방금 입력한 오늘의 습관(inputs)을 그대로 서버로 보내면,
 * 서버가 chronoTwinModel의 동일한 계산식으로 직접 재계산한 뒤 그 수치를 근거로
 * Gemini 또는 Claude API가 답하는 개인화 코치. 클라이언트는 표시만 담당하고
 * 실제 계산·프롬프트 구성은 /api/chrono-ai 에서 일관되게 처리한다(수치 조작 방지).
 */
export default function ChronoAI({ inputs }: { inputs: ChronoTwinInputs }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/chrono-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs, messages: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.error === "no_provider_configured") {
          setNotice(
            "Chrono-AI는 아직 API 키가 연결되지 않았어요. .env.local에 GEMINI_API_KEY 또는 ANTHROPIC_API_KEY를 추가하고 Vercel 프로젝트 환경변수에도 등록하면 바로 응답할 수 있어요."
          );
        } else {
          setNotice("일시적으로 응답을 가져오지 못했어요. 잠시 후 다시 시도해주세요.");
        }
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch {
      setNotice("네트워크 오류로 응답을 받지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass-panel rounded-2xl p-5 md:p-6 flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-mono tracking-widest text-primary uppercase">Chrono-AI 코치</h3>
        <span className="text-[10px] font-mono text-white/30 uppercase">개인화 · 실시간 계산 연동</span>
      </div>
      <p className="text-xs text-white/40 mb-4 leading-relaxed">
        지금 입력한 오늘의 습관을 그대로 근거로 삼아 답해요 — 일반적인 수면 상식이 아니라
        「당신의」 Chrono-Twin 계산 결과에 대한 답변입니다.
      </p>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="text-xs px-3 py-1.5 rounded-full border border-white/15 text-white/60 hover:text-white hover:border-primary/50 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div className="flex-1 space-y-3 mb-4 max-h-[360px] overflow-y-auto pr-1">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === "user" ? "bg-primary/25 text-white" : "bg-white/8 text-white/80"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-xl px-3.5 py-2.5 text-sm bg-white/8 text-white/40 font-mono">생각하는 중…</div>
            </div>
          )}
        </div>
      )}

      {notice && (
        <p className="text-[11px] text-amber-300/80 mb-3 leading-relaxed border-t border-white/10 pt-2.5">{notice}</p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Chrono-Twin에 대해 무엇이든 물어보세요"
          className="flex-1 bg-black/20 border border-white/10 rounded-full px-4 py-2.5 text-sm outline-none focus:border-primary/50 transition-colors"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2.5 rounded-full bg-white text-black text-sm font-semibold disabled:opacity-40"
        >
          전송
        </button>
      </form>
    </div>
  );
}
