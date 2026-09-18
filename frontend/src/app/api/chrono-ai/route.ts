import { NextRequest, NextResponse } from "next/server";
import {
  computeChronoTwin,
  diagnosePhaseDelay,
  phaseDelayBreakdown,
  sleepCycleImpact,
  caffeineFamiliarUnits,
  caffeineSafeHoursNeeded,
  SEVERITY_LABEL,
  type ChronoTwinInputs,
} from "@/lib/chronoTwinModel";
import { matchJetlagCity } from "@/lib/jetlagCities";

export const runtime = "nodejs";
// Gemini가 혼잡할 때 응답이 수십 초까지 걸리는 경우를 관찰해 여유를 둠(Vercel 기본 제한 대비).
export const maxDuration = 60;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * 서버가 클라이언트 입력값(inputs)을 그대로 받아 chronoTwinModel로 직접 재계산한다.
 * 프론트가 보낸 "결과값"을 신뢰하지 않고 서버에서 단일 소스로 재산출함으로써,
 * AI 프롬프트에 들어가는 수치가 항상 실제 계산 로직과 일치하도록 보장한다.
 */
function buildSystemPrompt(inputs: ChronoTwinInputs): string {
  const result = computeChronoTwin(inputs);
  const diag = diagnosePhaseDelay(result.phaseDelayMin);
  const breakdown = phaseDelayBreakdown(inputs, result);
  const cycles = sleepCycleImpact(result.phaseDelayMin, inputs.avgRecentSleepHours);
  const { city, virtualHours } = matchJetlagCity(result.phaseDelayMin);
  const units = caffeineFamiliarUnits(result.caffeineResidueMg);
  const safeHours = caffeineSafeHoursNeeded(inputs.caffeineMg);

  const breakdownText = breakdown
    .map((b) => `  · ${b.label}: ${b.contributionMin >= 0 ? "+" : "−"}${Math.abs(b.contributionMin).toFixed(1)}분`)
    .join("\n");
  const unitLabel = (key: string) => (key === "coffee" ? "잔" : key === "energy" ? "캔" : "개");
  const unitsText = units.map((u) => `${u.label} ${u.count.toFixed(1)}${unitLabel(u.key)}`).join(", ");

  return `당신은 EURIF 동아리가 만든 청소년 수면 위상 연구 플랫폼 "Chrono-Twin"의 AI 코치 "Chrono-AI"입니다.
아래 제공되는, 사용자가 방금 입력한 오늘의 습관을 바탕으로 서버가 실제로 계산한 수치만을 근거로 답하세요.
의학적 진단이나 처방은 하지 말고 생활 습관 코칭 관점에서 이야기하세요. 답변은 한국어로, 3~6문장 내외로
친근하지만 근거 있게, 과장 없이 작성하세요. 질문과 관련 없는 수치까지 모두 나열하지 마세요.

[오늘 이 사용자의 Chrono-Twin 계산 결과]
- 추정 수면 위상 지연: ${result.phaseDelayMin.toFixed(0)}분 (${SEVERITY_LABEL[result.severity]} · ${diag.title})
- 지연 원인 분해(전부 더하면 위 지연치와 정확히 일치):
${breakdownText}
- 취침 시 잔존 카페인: ${result.caffeineResidueMg.toFixed(0)}mg (${unitsText || "거의 없음"} 분량) · 안전 수준(50mg)까지 총 ${safeHours.toFixed(1)}시간 필요
- 5일 누적 수면부채: ${result.sleepDebtMin.toFixed(0)}분
- 오늘 패턴대로면 완전한 수면 주기(약 90분) ${cycles.baselineCycles}회 중 ${cycles.cyclesLost}회 손실 예상
- 체감 가상 시차: 서울 기준 「${city.city}」와 약 ${virtualHours.toFixed(1)}시간 시차`;
}

async function callGemini(system: string, messages: ChatMessage[]): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("no_gemini_key");
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: { temperature: 0.6, maxOutputTokens: 1024 },
      }),
    }
  );
  if (!res.ok) throw new Error(`gemini_http_${res.status}`);
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  if (!text) throw new Error("gemini_empty");
  return text;
}

async function callClaude(system: string, messages: ChatMessage[]): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("no_claude_key");
  const model = process.env.CLAUDE_MODEL || "claude-sonnet-5";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) throw new Error(`claude_http_${res.status}`);
  const data = await res.json();
  const text = (data?.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
  if (!text) throw new Error("claude_empty");
  return text;
}

export async function POST(req: NextRequest) {
  let body: { inputs?: ChronoTwinInputs; messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { inputs, messages } = body;
  if (!inputs || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasClaude = !!process.env.ANTHROPIC_API_KEY;

  if (!hasGemini && !hasClaude) {
    return NextResponse.json(
      { error: "no_provider_configured", detail: "GEMINI_API_KEY 또는 ANTHROPIC_API_KEY가 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  const system = buildSystemPrompt(inputs);
  const trimmed = messages.slice(-12);

  const preferred = process.env.AI_PROVIDER;
  let order: ("gemini" | "claude")[];
  if (preferred === "gemini") order = ["gemini", "claude"];
  else if (preferred === "claude") order = ["claude", "gemini"];
  else order = hasClaude ? ["claude", "gemini"] : ["gemini", "claude"];

  const errors: string[] = [];
  for (const provider of order) {
    try {
      if (provider === "gemini" && hasGemini) {
        const text = await callGemini(system, trimmed);
        return NextResponse.json({ reply: text, provider: "gemini" });
      }
      if (provider === "claude" && hasClaude) {
        const text = await callClaude(system, trimmed);
        return NextResponse.json({ reply: text, provider: "claude" });
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return NextResponse.json({ error: "provider_failed", detail: errors.join("; ") }, { status: 502 });
}
