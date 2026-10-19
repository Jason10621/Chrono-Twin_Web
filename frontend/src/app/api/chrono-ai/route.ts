import { NextRequest, NextResponse } from "next/server";
import {
  computeChronoTwin,
  diagnosePhaseDelay,
  phaseDelayBreakdown,
  sleepCycleImpact,
  caffeineFamiliarUnits,
  caffeineSafeHoursNeeded,
  normalizeInputs,
  phaseDelayRange,
  whatIfActions,
  DEFAULT_CAFFEINE_HALF_LIFE_H,
  type ChronoTwinInputs,
} from "@/lib/chronoTwinModel";
import { matchJetlagCity } from "@/lib/jetlagCities";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** 방금 슬라이더가 바뀌었다면, 무엇이 얼마나 달라졌는지 서버가 직접 비교한 문장을 만든다. */
function describeChange(prev: ChronoTwinInputs, cur: ChronoTwinInputs): string {
  const diffs: string[] = [];
  const num = (label: string, a: number, b: number, unit: string, digits = 0) => {
    if (Math.abs(a - b) > 1e-9) diffs.push(`${label} ${a.toFixed(digits)}${unit} → ${b.toFixed(digits)}${unit}`);
  };
  num("스마트폰 사용", prev.bluelightMin, cur.bluelightMin, "분");
  num("화면 밝기", prev.screenBrightness * 100, cur.screenBrightness * 100, "%");
  num("카페인", prev.caffeineMg, cur.caffeineMg, "mg");
  num("카페인 후 경과", prev.hoursSinceCaffeine, cur.hoursSinceCaffeine, "시간", 1);
  num("조명 밝기", prev.ledLux, cur.ledLux, "lux");
  num("조명 색온도", prev.ledColorTempK, cur.ledColorTempK, "K");
  num("최근 평균 수면", prev.avgRecentSleepHours, cur.avgRecentSleepHours, "시간", 1);
  if (prev.exercisedToday !== cur.exercisedToday) {
    diffs.push(`오늘 운동 ${prev.exercisedToday ? "함" : "안 함"} → ${cur.exercisedToday ? "함" : "안 함"}`);
  }
  if (diffs.length === 0) return "";
  const a = computeChronoTwin(prev).phaseDelayMin;
  const b = computeChronoTwin(cur).phaseDelayMin;
  return `
[방금 사용자가 슬라이더를 바꿨어요 — 서버가 비교한 값]
  · 바뀐 것: ${diffs.join(", ")}
  · 위상 지연 ${a.toFixed(0)}분 → ${b.toFixed(0)}분 (${(b - a).toFixed(0)}분)
  · 질문에 답할 때 이 변화가 무엇을 뜻하는지부터 설명하세요.
`;
}

/**
 * 서버가 클라이언트 입력값(inputs)을 그대로 받아 chronoTwinModel로 직접 재계산한다.
 * 프론트가 보낸 "결과값"을 신뢰하지 않고 서버에서 단일 소스로 재산출함으로써,
 * AI 프롬프트에 들어가는 수치가 항상 실제 계산 로직과 일치하도록 보장한다.
 */
function buildSystemPrompt(inputs: ChronoTwinInputs, previous?: ChronoTwinInputs): string {
  const result = computeChronoTwin(inputs);
  const range = phaseDelayRange(result.phaseDelayMin);
  const halfLife = inputs.caffeineHalfLifeH ?? DEFAULT_CAFFEINE_HALF_LIFE_H;
  const offset = inputs.personalOffsetMin ?? 0;
  const diag = diagnosePhaseDelay(result.phaseDelayMin);
  const breakdown = phaseDelayBreakdown(inputs, result);
  const cycles = sleepCycleImpact(result.phaseDelayMin, inputs.avgRecentSleepHours);
  const { city, virtualHours } = matchJetlagCity(result.phaseDelayMin);
  const units = caffeineFamiliarUnits(result.caffeineResidueMg);
  const safeHours = caffeineSafeHoursNeeded(inputs.caffeineMg, halfLife);

  const breakdownText = breakdown
    .map((b) => `  · ${b.label}: ${b.contributionMin >= 0 ? "+" : "−"}${Math.abs(b.contributionMin).toFixed(1)}분`)
    .join("\n");
  const unitLabel = (key: string) => (key === "coffee" ? "잔" : key === "energy" ? "캔" : "개");
  const unitsText = units.map((u) => `${u.label} ${u.count.toFixed(1)}${unitLabel(u.key)}`).join(", ");

  const { actions, allSavedMin, afterMin } = whatIfActions(inputs, 5);
  const actionsText =
    actions.length > 0
      ? actions.map((a) => `  · ${a.label}(${a.detail}): 위상 지연 약 ${Math.round(a.savedMin)}분 감소`).join("\n") +
        `\n  · 전부 실천하면 ${result.phaseDelayMin.toFixed(0)}분 → ${afterMin.toFixed(0)}분 (약 ${Math.round(allSavedMin)}분 감소)`
      : "  · 더 줄일 만한 요인이 거의 없음(지금 습관 유지)";

  return `당신은 ULIF 동아리가 만든 청소년 수면 위상 연구 플랫폼 "Chrono-Twin"의 AI 코치 "Chrono-AI"입니다.
아래 제공되는, 사용자가 방금 입력한 오늘의 습관을 바탕으로 서버가 실제로 계산한 수치만을 근거로 답하세요.
의학적 진단이나 처방은 하지 말고 생활 습관 코칭 관점에서 이야기하세요. 답변은 한국어로, 3~6문장 내외로
친근하지만 근거 있게, 과장 없이 작성하세요.
질문이 가리키는 주제(카페인·조명·스마트폰·수면 시간·운동 등)에 해당하는 수치를 먼저 쓰고, 질문과 관련 없는
수치는 나열하지 마세요. "어떻게 바꿔야 해?" 같은 행동 질문에는 아래 [바꿨을 때의 효과]의 수치를 근거로
구체적인 행동 한두 가지를 권하세요. 아래에 없는 수치는 지어내지 마세요.
마크다운 서식(**, #, -, \`\` 등)을 절대 쓰지 말고 순수 텍스트 문장으로만 답하세요. 답변은 반드시
완결된 문장으로 끝내세요(문장 중간에 끊지 마세요).

[사용자가 입력한 오늘의 습관]
- 스마트폰: 자기 전 2시간 동안 ${Math.round(inputs.bluelightMin)}분 사용, 화면 밝기 ${Math.round(inputs.screenBrightness * 100)}%
- 카페인: 오후 6시 이후 ${Math.round(inputs.caffeineMg)}mg, 마신 뒤 ${inputs.hoursSinceCaffeine}시간 지나 취침
- 방 조명: ${Math.round(inputs.ledLux)}lux, 색온도 ${Math.round(inputs.ledColorTempK)}K(2700K=전구색, 4000K=주백색, 6500K=주광색)
- 최근 5일 평균 수면 ${inputs.avgRecentSleepHours}시간, 오늘 운동 ${inputs.exercisedToday ? "함" : "안 함"}
- 사용자 설정: 카페인 반감기 가정 ${halfLife}시간${Math.abs(halfLife - DEFAULT_CAFFEINE_HALF_LIFE_H) < 0.01 ? "(기본값)" : "(사용자가 고른 민감도 반영)"}${Math.abs(offset) >= 0.5 ? `, 개인 기록 보정 ${offset >= 0 ? "+" : "−"}${Math.abs(offset).toFixed(0)}분` : ""}
${previous ? describeChange(previous, inputs) : ""}
[바꿨을 때의 효과 — 같은 계산식으로 다시 계산한 값]
${actionsText}

[오늘 이 사용자의 Chrono-Twin 계산 결과]
- 추정 수면 위상 지연: ${result.phaseDelayMin.toFixed(0)}분 (${diag.title}) — 오차 범위 약 ${range.lo.toFixed(0)}~${range.hi.toFixed(0)}분(더미 데이터 검증 기준, 실제 사람은 더 클 수 있음)
- 지연 원인 분해(전부 더하면 위 지연치와 정확히 일치):
${breakdownText}
- 취침 시 잔존 카페인: ${result.caffeineResidueMg.toFixed(0)}mg (${unitsText || "거의 없음"} 분량) · 안전 수준(50mg)까지 총 ${safeHours.toFixed(1)}시간 필요
- 5일 누적 수면부채: ${result.sleepDebtMin.toFixed(0)}분
- 오늘 패턴대로면 완전한 수면 주기(약 90분) ${cycles.baselineCycles}회 중 ${cycles.cyclesLost}회 손실 예상
- 체감 가상 시차: 서울 기준 「${city.city}」와 약 ${virtualHours.toFixed(1)}시간 시차`;
}

/**
 * 2026-09-19 실측: gemini-3.6-flash 는 Gemini 3.x 계열답게 maxOutputTokens 를
 * "생각(thinking)"과 공유한다 — thinkingBudget을 0으로 끄지 않으면 응답이 무응답
 * 상태로 멈추거나(전체 예산을 thinking이 다 써버림) 문장 중간에 잘려서 나온다.
 * "-lite" 모델은 thinkingConfig 필드 자체를 보내면 400(INVALID_ARGUMENT)을
 * 반환하므로 모델별로 다르게 구성해야 한다.
 */
function generationConfigFor(model: string) {
  const base = { temperature: 0.6, maxOutputTokens: 2048 };
  if (model.includes("lite")) return base;
  return { ...base, thinkingConfig: { thinkingBudget: 0 } };
}

/**
 * Gemini 단일 모델 호출 — perCallTimeoutMs 안에 응답이 없으면 스스로 포기하고
 * AbortError를 던진다. 무료 티어는 모델별로 하루 요청 한도(예: 20회/일)가 있어
 * 한도를 넘기면 HTTP 429(RESOURCE_EXHAUSTED)를 반환한다 — 모델마다 한도가
 * 별도라서, 1차 모델이 소진돼도 2차(lite) 모델은 보통 계속 쓸 수 있다.
 */
async function callGeminiModel(
  system: string,
  messages: ChatMessage[],
  model: string,
  perCallTimeoutMs: number
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("no_gemini_key");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), perCallTimeoutMs);

  try {
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
          generationConfig: generationConfigFor(model),
        }),
        signal: controller.signal,
      }
    );
    if (!res.ok) throw new Error(`gemini_${model}_http_${res.status}`);
    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
    if (!text) throw new Error(`gemini_${model}_empty`);
    return text;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`gemini_${model}_timeout_${perCallTimeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  let body: { inputs?: Partial<ChronoTwinInputs>; previousInputs?: Partial<ChronoTwinInputs>; messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { inputs: rawInputs, previousInputs, messages } = body;
  if (!rawInputs || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  // 클라이언트 값은 믿지 않고 모형이 받는 범위로 맞춘다(NaN·범위 밖 값 차단).
  const inputs = normalizeInputs(rawInputs);
  const previous = previousInputs ? normalizeInputs(previousInputs) : undefined;

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "no_provider_configured", detail: "GEMINI_API_KEY가 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  const system = buildSystemPrompt(inputs, previous);
  const trimmed = messages.slice(-12);

  // 1차: 품질 우선 모델(thinkingBudget:0 적용 후 7~8초 내 응답) → 2차: lite 모델
  // (매번 1~3초 내 응답, thinkingConfig 미지원). 무료 티어는 모델별 일일 한도가
  // 따로 있어, 1차 모델 한도가 소진돼도(429) 2차로 자연스럽게 넘어간다.
  const primaryModel = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite";

  const attempts: { model: string; timeoutMs: number }[] =
    primaryModel === fallbackModel
      ? [{ model: primaryModel, timeoutMs: 20_000 }]
      : [
          { model: primaryModel, timeoutMs: 10_000 },
          { model: fallbackModel, timeoutMs: 20_000 },
        ];

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const text = await callGeminiModel(system, trimmed, attempt.model, attempt.timeoutMs);
      return NextResponse.json({ reply: text, model: attempt.model });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return NextResponse.json({ error: "provider_failed", detail: errors.join("; ") }, { status: 502 });
}
