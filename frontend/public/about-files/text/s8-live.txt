/**
 * "당신이 자는 잠의 의미" 섹션에 쓰이는 실시간 보조 데이터.
 * 두 개의 무료·키 불필요 공개 API를 조합한다 — Sunrise-Sunset(파이프라인에서
 * 이미 검증됨)과 Open-Meteo. 둘 다 실패해도 섹션 자체가 깨지지 않도록
 * 항상 부분적으로라도 값을 채워 반환한다(네트워크 차단 환경 고려).
 */

const SEOUL_LAT = 37.5665;
const SEOUL_LON = 126.978;

export interface SeoulLiveContext {
  sunsetLabel: string | null;
  cloudCoverPct: number | null;
  isDaylightNow: boolean | null;
}

export async function fetchSeoulLiveContext(): Promise<SeoulLiveContext> {
  const result: SeoulLiveContext = { sunsetLabel: null, cloudCoverPct: null, isDaylightNow: null };

  const [sunRes, meteoRes] = await Promise.allSettled([
    fetch(`https://api.sunrise-sunset.org/json?lat=${SEOUL_LAT}&lng=${SEOUL_LON}&formatted=0`),
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${SEOUL_LAT}&longitude=${SEOUL_LON}&current=cloud_cover,is_day&timezone=Asia%2FSeoul`
    ),
  ]);

  try {
    if (sunRes.status === "fulfilled" && sunRes.value.ok) {
      const data = await sunRes.value.json();
      const iso = data?.results?.sunset;
      if (iso) {
        result.sunsetLabel = new Intl.DateTimeFormat("ko-KR", {
          timeZone: "Asia/Seoul",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date(iso));
      }
    }
  } catch {
    // 파싱 실패 시 sunsetLabel은 null로 유지
  }

  try {
    if (meteoRes.status === "fulfilled" && meteoRes.value.ok) {
      const data = await meteoRes.value.json();
      const cloud = data?.current?.cloud_cover;
      const isDay = data?.current?.is_day;
      result.cloudCoverPct = typeof cloud === "number" ? cloud : null;
      result.isDaylightNow = typeof isDay === "number" ? isDay === 1 : null;
    }
  } catch {
    // 파싱 실패 시 나머지 필드는 null로 유지
  }

  return result;
}
