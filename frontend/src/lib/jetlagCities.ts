/**
 * "세계 시차 지도" — 위상 지연(분)을 실제 도시의 시차로 은유 변환
 * =================================================================
 *
 * 근거: 윤지후(정책 파트) 보고서 원문 —
 *   "크로노타입이 늦은 학생들을 이른 등교 시스템에 맞추는 것은,
 *    매일 아침 해외여행을 다녀오듯 시차 부적응을 겪게 만드는
 *    '사회적 시차증'을 유발한다."
 *
 * 이 모듈은 그 은유를 숫자로 만든다: 오늘의 위상 지연(분)을
 * "몇 시간 시차 나는 도시에서 통근한 것과 같은가"로 환산해
 * 실제 도시 하나를 골라준다. 서울(KST, UTC+9) 기준 서쪽으로 이동.
 *
 * ⚠ 이 매핑은 과학적 시차 등가식이 아니라 발표·전달용 은유 장치다.
 *   AMPLIFY 는 "위상 지연 1시간 = 체감 시차 X시간"으로 극적으로 보이게
 *   조정한 발표용 계수 — 파이프라인의 회귀 계수(β)와는 무관하다.
 */

export interface JetlagCity {
  city: string;
  country: string;
  utcOffset: number; // 표준시 기준(서머타임 미반영, 발표용 근사)
  lat: number;
  lon: number;
  hoursFromSeoul: number; // 이 항목이 대표하는 "가상 시차"의 임계 중심값
  blurb: string;
  timezone: string; // IANA 타임존 — 실시간 현지 시각 표시용(실측 데이터)
}

export const SEOUL = { city: "서울", country: "대한민국", lat: 37.5665, lon: 126.978, utcOffset: 9, timezone: "Asia/Seoul" };

// 서울 기준 서쪽으로 갈수록 시차가 커지는 순서로 정렬 (가상 시차 중심값 기준)
export const JETLAG_CITIES: JetlagCity[] = [
  { city: "서울", country: "대한민국", utcOffset: 9, lat: 37.5665, lon: 126.978, hoursFromSeoul: 0, blurb: "시차 없음 — 생체 시계와 생활이 잘 맞는 상태", timezone: "Asia/Seoul" },
  { city: "베이징", country: "중국", utcOffset: 8, lat: 39.9042, lon: 116.4074, hoursFromSeoul: 1.5, blurb: "가벼운 시차 — 인접 시간대 단거리 이동 수준", timezone: "Asia/Shanghai" },
  { city: "방콕", country: "태국", utcOffset: 7, lat: 13.7563, lon: 100.5018, hoursFromSeoul: 3, blurb: "동남아 장거리 여행 직후와 비슷한 시차", timezone: "Asia/Bangkok" },
  { city: "다카", country: "방글라데시", utcOffset: 6, lat: 23.8103, lon: 90.4125, hoursFromSeoul: 4.5, blurb: "남아시아행 야간 비행 다음날 같은 컨디션", timezone: "Asia/Dhaka" },
  { city: "두바이", country: "아랍에미리트", utcOffset: 4, lat: 25.2048, lon: 55.2708, hoursFromSeoul: 6.5, blurb: "중동 환승 여행급 시차 — 체내 시계가 상당히 어긋난 상태", timezone: "Asia/Dubai" },
  { city: "모스크바", country: "러시아", utcOffset: 3, lat: 55.7558, lon: 37.6173, hoursFromSeoul: 8, blurb: "유라시아 대륙 횡단급 시차", timezone: "Europe/Moscow" },
  { city: "카이로", country: "이집트", utcOffset: 2, lat: 30.0444, lon: 31.2357, hoursFromSeoul: 9.5, blurb: "아프리카·유럽 경계 시간대 — 심각한 위상 지연", timezone: "Africa/Cairo" },
  { city: "파리", country: "프랑스", utcOffset: 1, lat: 48.8566, lon: 2.3522, hoursFromSeoul: 11, blurb: "유럽 직항 시차 — 며칠은 적응이 필요한 수준", timezone: "Europe/Paris" },
  { city: "런던", country: "영국", utcOffset: 0, lat: 51.5074, lon: -0.1278, hoursFromSeoul: 13, blurb: "그리니치 표준시. 지구 반대편에 가까운 극심한 시차", timezone: "Europe/London" },
  { city: "상파울루", country: "브라질", utcOffset: -3, lat: -23.5505, lon: -46.6333, hoursFromSeoul: 15.5, blurb: "남미 장거리 이동급 — 생체 리듬이 완전히 뒤집힌 수준", timezone: "America/Sao_Paulo" },
  { city: "뉴욕", country: "미국", utcOffset: -5, lat: 40.7128, lon: -74.006, hoursFromSeoul: 18, blurb: "지구 반대편. 매일 밤 뉴욕 시차로 등교하는 셈", timezone: "America/New_York" },
];

/** 위상 지연(분) → 가상 시차(시간). AMP=1/12 은 발표용 극적 배율(과학적 근거 아님). */
const AMPLIFY_MIN_TO_HOUR = 1 / 12; // 180분 지연 → 15h 가상 시차

export function phaseDelayToVirtualHours(phaseDelayMin: number): number {
  const h = Math.max(0, phaseDelayMin) * AMPLIFY_MIN_TO_HOUR;
  return Math.min(19, h);
}

export function matchJetlagCity(phaseDelayMin: number): { city: JetlagCity; virtualHours: number } {
  const virtualHours = phaseDelayToVirtualHours(phaseDelayMin);
  let best = JETLAG_CITIES[0];
  let bestDist = Infinity;
  for (const c of JETLAG_CITIES) {
    const d = Math.abs(c.hoursFromSeoul - virtualHours);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return { city: best, virtualHours };
}

/** 등장방형(equirectangular) 투영: lat/lon → SVG viewBox 좌표 (0..W, 0..H). */
export function projectLatLon(lat: number, lon: number, width: number, height: number) {
  const x = ((lon + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return { x, y };
}
