import manifestJson from "./about-manifest.json";

/**
 * About 페이지의 "개발 흐름" 데이터.
 * 자료 파일은 tools/build_about_assets.py 가 "열람 전용" 형태(페이지 이미지·txt·html)로 만들어
 * public/about-files/ 에 두고, 쪽수·줄 수 같은 값은 about-manifest.json 에서 읽는다.
 */

export type FileKind = "pdf" | "html" | "image" | "code" | "text" | "link";
export type FileGroup = "doc" | "proto" | "code" | "result";
export type PhaseKey = "plan" | "experiment" | "build";
export type PersonKey = "lee" | "yun" | "hong" | "yu" | "jeon";
export type IconKey =
  | "lightbulb"
  | "book"
  | "sigma"
  | "clipboard"
  | "flask"
  | "workflow"
  | "globe"
  | "bot";

interface ManifestEntry {
  kind: string;
  pages?: number;
  w?: number;
  h?: number;
  lines?: number;
  lang?: string;
  path?: string;
  ext?: string;
}
export const MANIFEST = manifestJson as unknown as Record<string, ManifestEntry>;

export interface AboutFile {
  id: string;
  title: string;
  desc: string;
  kind: FileKind;
  group: FileGroup;
  by?: PersonKey;
  href?: string; // kind === "link"
}

export interface Stage {
  id: string;
  no: number;
  phase: PhaseKey;
  short: string;
  title: string;
  icon: IconKey;
  summary: string;
  note?: string;
  did: string[];
  files: AboutFile[];
}

export const PEOPLE: Record<PersonKey, { name: string; part: string }> = {
  lee: { name: "이정욱", part: "정보학 · 조장" },
  yun: { name: "윤지후", part: "정책" },
  hong: { name: "홍서준", part: "약학" },
  yu: { name: "유가빈", part: "뇌과학" },
  jeon: { name: "전윤서", part: "생명공학" },
};

export const PHASES: Record<PhaseKey, { label: string; color: "blue" | "orange" | "green" }> = {
  plan: { label: "기획 · 설계", color: "blue" },
  experiment: { label: "실험 · 검증", color: "orange" },
  build: { label: "개발 · 배포", color: "green" },
};

export const GROUP_LABEL: Record<FileGroup, string> = {
  doc: "보고서 · 문서",
  proto: "프로토타입",
  code: "코드",
  result: "결과 · 그림",
};

export const GROUP_COLOR: Record<FileGroup, "blue" | "purple" | "green" | "orange"> = {
  doc: "blue",
  proto: "purple",
  code: "green",
  result: "orange",
};

const LANG_LABEL: Record<string, string> = { py: "Python", ts: "TypeScript", tsx: "React (TSX)", sql: "SQL", css: "CSS" };

/** 카드에 보여줄 한 줄 정보 (예: "PDF · 20쪽", "Python · 322줄") */
export function fileMeta(f: AboutFile): string {
  const m = MANIFEST[f.id];
  switch (f.kind) {
    case "pdf":
      return `문서 · ${m?.pages ?? "?"}쪽`;
    case "html":
      return "직접 조작해 보는 화면";
    case "image":
      return "그림";
    case "code":
      return `${LANG_LABEL[m?.lang ?? ""] ?? "코드"} · ${m?.lines ?? "?"}줄`;
    case "text":
      return `텍스트 · ${m?.lines ?? "?"}줄`;
    case "link":
      return "새 탭에서 열기";
  }
}

export const STAGES: Stage[] = [
  {
    id: "s1",
    no: 1,
    phase: "plan",
    short: "주제 설정",
    title: "문제 발견 · 주제 설정",
    icon: "lightbulb",
    summary: "아침마다 조는 친구들, 정말 의지 문제일까? 질문 하나에서 연구가 시작됐어요.",
    did: [
      "정보학·약학·뇌과학·생명공학·정책, 5개 분야 5명이 함께 풀기로 했어요",
      "고등학생이 직접 해볼 수 있는 실험 아이디어를 카드로 정리했어요",
      "'독립적 기여도' 같은 모호한 표현을 고쳐 탐구 질문을 구체화했어요",
    ],
    files: [
      { id: "s1-ideas", title: "실험 아이디어 5가지", desc: "가설·측정 방법·분석 방법을 카드로 정리", kind: "html", group: "doc" },
      { id: "s1-notes", title: "탐구 아이디어 10가지", desc: "눌러서 변수와 측정 방법을 펼쳐보는 설계 카드", kind: "html", group: "doc" },
      { id: "s1-plan4", title: "4차시 조별 탐구 계획 구체화", desc: "핵심 질문을 다시 쓰고 가설·변인·표본 계획을 정리", kind: "pdf", group: "doc" },
    ],
  },
  {
    id: "s2",
    no: 2,
    phase: "plan",
    short: "자료조사",
    title: "분야별 자료조사",
    icon: "book",
    summary: "다섯 명이 각자의 분야에서 '청소년은 왜 밤에 못 잘까'를 조사했어요.",
    did: [
      "뇌과학 — 수면 단계(N3·REM)와 사회적 시차가 인지 기능에 미치는 영향",
      "생명공학 — 생체 시계 유전자와 블루라이트의 멜라토닌 억제",
      "약학 — 카페인 반감기와 수면 보조제의 약리학",
      "정보학 — 수면 데이터 수집·분석 플랫폼 설계 / 정책 — 등교 시간과 제도적 해법",
    ],
    files: [
      { id: "s2-yu", title: "뇌과학 자료조사", desc: "수면 단계와 사회적 시차가 뇌에 미치는 영향", kind: "pdf", group: "doc", by: "yu" },
      { id: "s2-jeon", title: "생명공학 자료조사", desc: "생체 시계 유전자와 블루라이트·멜라토닌", kind: "pdf", group: "doc", by: "jeon" },
      { id: "s2-hong", title: "약학 자료조사", desc: "카페인 반감기와 수면 보조제의 약리학", kind: "pdf", group: "doc", by: "hong" },
      { id: "s2-lee", title: "정보학 자료조사", desc: "데이터 파이프라인과 웹 플랫폼 설계", kind: "pdf", group: "doc", by: "lee" },
      { id: "s2-yun", title: "정책 자료조사", desc: "등교 시간 실증 연구와 정책 제언 방향", kind: "pdf", group: "doc", by: "yun" },
      { id: "s2-synth", title: "통합 이론적 배경 보고서", desc: "다섯 분야를 하나로 엮은 웹 보고서", kind: "html", group: "doc" },
      { id: "s2-logs", title: "1~3차 활동일지 취합", desc: "조원별 활동 기록을 한 문서로 모음", kind: "pdf", group: "doc", by: "lee" },
      { id: "s2-report", title: "ULIF 활동 보고서", desc: "초기 활동을 정리한 종합 보고서", kind: "pdf", group: "doc" },
    ],
  },
  {
    id: "s3",
    no: 3,
    phase: "plan",
    short: "모형 설계",
    title: "모형 설계 · 시뮬레이터",
    icon: "sigma",
    summary: "조사한 내용을 하나의 식으로 묶었어요.",
    note: "Y = β₀ + β₁X₁ + β₂X₂ + β₃X₃ + ε",
    did: [
      "블루라이트·카페인·수면 부채가 취침 지연에 주는 '독립적 기여도'를 다중선형회귀로 검증하기로 설계했어요",
      "입력 → 계산 엔진 → 출력의 3단 구조로 그리고, HTML 시뮬레이터로 직접 구현했어요",
      "수면 단계(N1·N2·N3·REM)별 손실 비율 모델 적용안을 정리했어요",
    ],
    files: [
      { id: "s3-plan", title: "실험계획서", desc: "가설·변인·분석 계획과 회귀 모형 (ULIF)", kind: "pdf", group: "doc" },
      { id: "s3-structure", title: "모듈 구조도", desc: "입력층 → 계산 엔진 → 출력층", kind: "image", group: "result" },
      { id: "s3-sim", title: "수면 위상 시뮬레이터", desc: "세 변수를 조절하면 예측 취침 시각이 바로 계산돼요", kind: "html", group: "proto" },
      { id: "s3-mlr", title: "다중선형회귀 원리 시각화", desc: "변수별 독립 기여도를 막대로 분해해서 보여줘요", kind: "html", group: "proto" },
      { id: "s3-coding", title: "코딩 원리 정리", desc: "시뮬레이터의 구조와 핵심 개념 요약", kind: "pdf", group: "doc" },
      { id: "s3-stages", title: "수면 단계별 손실 비율 모델안", desc: "N1·N2·N3·REM 단계별 적용 기준", kind: "text", group: "doc", by: "jeon" },
    ],
  },
  {
    id: "s4",
    no: 4,
    phase: "experiment",
    short: "실험 준비",
    title: "실험 설계 · 준비",
    icon: "clipboard",
    summary: "변수마다 일일 설문지와 5일 스케줄표를 만들어 실험 준비를 마쳤어요.",
    did: [
      "블루라이트·LED 조명·카페인, 세 가지 실험을 5일 연속 교차 설계로 짰어요",
      "일일 수면 설문지, 피실험자 스케줄표, 카페인 무섭취 대조군 가이드를 만들었어요",
      "설문조사 웹사이트를 만들어 1학년 학생들에게 배부하고 응답을 저장하도록 구성했어요",
      "남은 단계(정제 → 분석 → 시나리오 A·B·C 해석)를 진행 방향 문서로 정리했어요",
    ],
    files: [
      { id: "s4-direction", title: "진행 방향", desc: "완료된 일과 남은 실험 단계 정리", kind: "pdf", group: "doc", by: "lee" },
      { id: "s4-form-blue", title: "일일 수면 설문지", desc: "블루라이트 실험용 기록지", kind: "pdf", group: "doc" },
      { id: "s4-sched-blue", title: "블루라이트 5일 스케줄표", desc: "피실험자용 조건표", kind: "pdf", group: "doc" },
      { id: "s4-form-led", title: "LED 조명 일일 설문지", desc: "조도·색온도 노출과 수면 기록", kind: "pdf", group: "doc" },
      { id: "s4-sched-led", title: "LED 조명 5일 스케줄표", desc: "피실험자용 조건표", kind: "pdf", group: "doc" },
      { id: "s4-form-caf", title: "카페인 일일 설문지", desc: "섭취량·시각과 수면 기록", kind: "pdf", group: "doc" },
      { id: "s4-sched-caf", title: "카페인 5일 스케줄표", desc: "피실험자용 조건표", kind: "pdf", group: "doc" },
      { id: "s4-guide-caf", title: "카페인 무섭취 대조군 가이드", desc: "대조군이 지켜야 할 생활 수칙", kind: "pdf", group: "doc" },
      { id: "s4-survey", title: "설문조사 웹 (프로토타입)", desc: "카페인·수면·디지털 습관 19문항 설문 화면", kind: "html", group: "proto" },
    ],
  },
  {
    id: "s5",
    no: 5,
    phase: "experiment",
    short: "예비실험",
    title: "예비실험 · 2주차",
    icon: "flask",
    summary: "실제로 5일씩 해봤어요. 결과보다 중요한 걸 배웠어요 — 교란변수.",
    did: [
      "블루라이트·LED 조명·카페인, 5일 예비실험을 직접 해봤어요",
      "소음·알람 오작동·기록 수정 같은 교란변수를 발견했어요",
      "윤지후가 자기보고식 설문의 한계 3가지를 비판적으로 분석했어요",
      "다음 단계를 정했어요: 문항 분리 → 본 수집(30명 이상) → 자동 기록",
    ],
    files: [
      { id: "s5-report", title: "2주차 활동 보고서", desc: "예비실험 결과와 방법론 검토", kind: "pdf", group: "doc" },
      { id: "s5-hong", title: "카페인과 수면 위상 변화 분석", desc: "5일 자가기록과 약동학 해석", kind: "pdf", group: "doc", by: "hong" },
      { id: "s5-yu", title: "수면 중 뇌과학적 현상 조사", desc: "수면 단계별 뇌 변화 정리", kind: "pdf", group: "doc", by: "yu" },
      { id: "s5-jeon", title: "수면 설문의 생명공학적 분석", desc: "설문 문항을 생체 변수로 해석", kind: "pdf", group: "doc", by: "jeon" },
      { id: "s5-yun", title: "실험 진행 비판적 분석", desc: "설문 방법의 한계와 확장 방안", kind: "pdf", group: "doc", by: "yun" },
    ],
  },
  {
    id: "s6",
    no: 6,
    phase: "build",
    short: "파이프라인",
    title: "데이터 파이프라인",
    icon: "workflow",
    summary: "설문 응답이 들어오면 정제하고 분석까지 — 파이썬으로 자동화했어요.",
    did: [
      "수집 스키마를 정의하고(LED 조도·색온도 필드 추가) 파싱 오류·결측을 처리했어요",
      "Z-score 이상치 제거, MSFsc·카페인 약동학·LED 광생물학 변환을 구현했어요",
      "상관분석과 다중선형회귀, 피험자 고정효과 모형을 만들었어요",
      "더미 데이터에 심어둔 정답 계수를 파이프라인이 다시 찾아내는지로 자체 검증했어요",
    ],
    files: [
      { id: "s6-schema", title: "수집 스키마", desc: "원시 응답을 검증된 레코드로 바꾸는 구조", kind: "code", group: "code", by: "lee" },
      { id: "s6-etl", title: "ETL 정제", desc: "파싱 오류·결측 대체·파생 변수 계산", kind: "code", group: "code", by: "lee" },
      { id: "s6-outliers", title: "Z-score 이상치 제거", desc: "|Z|>3 판별과 허용 범위 검사", kind: "code", group: "code", by: "lee" },
      { id: "s6-mctq", title: "MSFsc 계산", desc: "수면 부채를 보정한 중간 수면 시각", kind: "code", group: "code", by: "lee" },
      { id: "s6-pk", title: "카페인 약동학", desc: "반감기 5.5시간으로 계산하는 잔류량", kind: "code", group: "code", by: "lee" },
      { id: "s6-photo", title: "LED 광생물학", desc: "색온도·조도를 멜라토닌 억제 부하로 환산", kind: "code", group: "code", by: "lee" },
      { id: "s6-corr", title: "상관분석", desc: "정규성 검정 후 피어슨/스피어만, 다중공선성 경보", kind: "code", group: "code", by: "lee" },
      { id: "s6-reg", title: "다중선형회귀", desc: "단순·통합·공변량·고정효과 모형", kind: "code", group: "code", by: "lee" },
      { id: "s6-sun", title: "일출·일몰 API 클라이언트", desc: "공개 API 연동과 재시도 처리", kind: "code", group: "code", by: "lee" },
      { id: "s6-test", title: "변환 함수 테스트", desc: "정답 계수 복원 등 자동 검증", kind: "code", group: "code", by: "lee" },
      { id: "s6-report", title: "회귀 분석 리포트", desc: "합성 데이터로 파이프라인을 돌린 출력", kind: "text", group: "result", by: "lee" },
      { id: "s6-corrmap", title: "상관 행렬 그림", desc: "변수 사이의 스피어만 상관", kind: "image", group: "result", by: "lee" },
      { id: "s6-ledmap", title: "LED 저녁 부하 지도", desc: "색온도 × 조도 → 멜라토닌 억제 부하", kind: "image", group: "result", by: "lee" },
    ],
  },
  {
    id: "s7",
    no: 7,
    phase: "build",
    short: "웹 플랫폼",
    title: "웹 플랫폼 · 3주차",
    icon: "globe",
    summary: "조원들의 제안을 모아 Chrono-Twin 웹사이트에 실제로 담았어요.",
    did: [
      "입력에 따라 색·모양·크기가 변하는 3D 디지털 트윈 아바타를 만들었어요",
      "홍서준의 Dose Echo, 유가빈의 단계별 진단 카드, 전윤서의 카페인 골든타임 계산을 구현했어요",
      "과제 제출·자료실·AI 챗봇이 있는 팀 협업 워크스페이스도 함께 운영했어요",
    ],
    files: [
      { id: "s7-report", title: "3주차 활동 보고서", desc: "웹 플랫폼 적용 방안과 진행 상황", kind: "pdf", group: "doc" },
      { id: "s7-yu-1", title: "웹사이트 추가 아이디어", desc: "사회적 활동·수면량 권고 기능 제안", kind: "pdf", group: "doc", by: "yu" },
      { id: "s7-yu-2", title: "웹사이트 반영안 · 진단 카드", desc: "수면 손실 수식과 단계별 경고 진단", kind: "pdf", group: "doc", by: "yu" },
      { id: "s7-jeon", title: "웹사이트 적용 방안", desc: "카페인 반감기 연산과 가상 시차 매핑", kind: "pdf", group: "doc", by: "jeon" },
      { id: "s7-hong-1", title: "웹사이트 적용 방안 · Dose Echo", desc: "카페인 잔존량을 익숙한 단위로 환산", kind: "pdf", group: "doc", by: "hong" },
      { id: "s7-hong-2", title: "카페인 잔존량 환산기 개발 보고서", desc: "계산 근거와 설계 과정", kind: "pdf", group: "doc", by: "hong" },
      { id: "s7-dose", title: "Dose Echo 프로토타입", desc: "섭취량과 시간을 바꿔보며 체험", kind: "html", group: "proto", by: "hong" },
      { id: "s7-model", title: "계산 엔진", desc: "회귀 계수와 파생 지표를 한곳에 모은 모델", kind: "code", group: "code", by: "lee" },
      { id: "s7-avatar", title: "3D 아바타", desc: "상태 점수 하나로 색·왜곡·크기를 움직임", kind: "code", group: "code", by: "lee" },
      { id: "s7-map", title: "세계 시차 지도", desc: "위상 지연을 도시의 시차로 비유", kind: "code", group: "code", by: "lee" },
      { id: "s7-caffeine", title: "카페인 환산기 화면", desc: "Dose Echo를 사이트에 통합", kind: "code", group: "code", by: "lee" },
      { id: "s7-sql", title: "과제 제출 DB 설계", desc: "협업 워크스페이스의 권한·제출 규칙 (SQL)", kind: "code", group: "code", by: "lee" },
      { id: "s7-prompt", title: "팀 AI 챗봇 프롬프트", desc: "협업 워크스페이스 AI의 역할과 규칙", kind: "code", group: "code", by: "lee" },
    ],
  },
  {
    id: "s8",
    no: 8,
    phase: "build",
    short: "AI 코치",
    title: "AI 코치 · 정책 대시보드",
    icon: "bot",
    summary: "내 결과를 알고 답하는 AI 코치, 그리고 연구 전 과정을 보여주는 대시보드.",
    did: [
      "Chrono-AI는 서버가 같은 계산식으로 다시 계산한 수치만 근거로 답해요",
      "'이렇게 바꾸면 몇 분 줄어드나'를 같은 모형으로 재계산해 행동을 제안해요",
      "라이트/다크 모드, 큰 글씨, 애플 스타일 서체로 디자인을 전면 개편했어요",
      "파이프라인의 모든 단계를 한눈에 보는 정책 대시보드를 만들었어요",
    ],
    files: [
      { id: "s8-dash", title: "정책 대시보드", desc: "파이프라인 결과를 한눈에 (새 탭)", kind: "link", group: "proto", by: "lee", href: "/dashboard.html" },
      { id: "s8-route", title: "Chrono-AI 서버", desc: "수치를 서버에서 다시 계산해 프롬프트에 담고, 모델이 막히면 자동 전환", kind: "code", group: "code", by: "lee" },
      { id: "s8-chat", title: "AI 코치 화면", desc: "질문·응답과 지연 안내", kind: "code", group: "code", by: "lee" },
      { id: "s8-whatif", title: "'이렇게 바꾸면' 화면", desc: "요인별 감소 효과를 효과순으로", kind: "code", group: "code", by: "lee" },
      { id: "s8-live", title: "실시간 공개 API 연동", desc: "서울 일몰·구름량을 불러오는 코드", kind: "code", group: "code", by: "lee" },
      { id: "s8-css", title: "디자인 토큰 (라이트/다크)", desc: "색·글자 크기·카드 스타일의 기준", kind: "code", group: "code", by: "lee" },
    ],
  },
];

export const ALL_FILES: AboutFile[] = STAGES.flatMap((s) => s.files);
export const FILE_COUNT = ALL_FILES.length;

export function findFile(fileId: string): { file: AboutFile; stage: Stage } | null {
  for (const stage of STAGES) {
    const file = stage.files.find((f) => f.id === fileId);
    if (file) return { file, stage };
  }
  return null;
}

/** 단계 자료를 만든 사람들(자료에 작성자가 표시된 경우만). 없으면 팀 전체. */
export function stagePeople(stage: Stage): PersonKey[] {
  const order: PersonKey[] = ["lee", "yun", "hong", "yu", "jeon"];
  const authors = new Set(stage.files.map((f) => f.by).filter(Boolean) as PersonKey[]);
  return authors.size > 0 ? order.filter((p) => authors.has(p)) : order;
}
