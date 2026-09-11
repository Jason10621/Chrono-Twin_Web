/**
 * 스타일라이즈드 "홀로그램" 세계지도용 점(dot) 좌표 생성
 * =====================================================
 * 실제 국경선 대신, 대륙 실루엣을 대략적인 위경도 다각형으로 잡고
 * 그 안쪽에 격자점을 샘플링해 "레이더 스캔" 느낌의 점묘 지도를 만든다.
 * 정치적 정확성이 아니라 발표 자료용 시각적 인상이 목적.
 */

type LatLon = [number, number]; // [lat, lon]

const CONTINENTS: LatLon[][] = [
  // North America
  [[71, -168], [71, -95], [60, -65], [45, -52], [25, -80], [16, -92], [14, -102], [23, -110], [32, -117], [49, -125], [60, -140]],
  // South America
  [[12, -72], [10, -62], [-5, -35], [-23, -43], [-34, -58], [-55, -68], [-45, -73], [-20, -70], [-4, -81], [7, -77]],
  // Europe
  [[71, 25], [70, 60], [55, 60], [45, 40], [36, -9], [43, -9], [51, 3], [60, 5]],
  // Africa
  [[37, 10], [32, 35], [12, 51], [-2, 42], [-26, 33], [-34, 20], [-33, 18], [-20, 12], [10, -17], [15, -17], [25, -15], [35, -6]],
  // Asia
  [[70, 60], [75, 100], [70, 140], [55, 140], [40, 130], [20, 110], [5, 100], [8, 80], [15, 73], [25, 60], [30, 48], [15, 42], [12, 45], [25, 35], [40, 28], [55, 30]],
  // Australia
  [[-11, 131], [-12, 143], [-25, 153], [-38, 148], [-35, 138], [-32, 115], [-20, 113], [-14, 126]],
];

// 좁은 섬(일본, 인도네시아 등)은 다각형 샘플링에서 누락되기 쉬워 점 몇 개를 직접 추가
const EXTRA_ISLAND_DOTS: LatLon[] = [
  [45.4, 141.7], [39.7, 141.1], [36.2, 139.8], [34.7, 135.5], [33.6, 130.4], // Japan
  [3.6, 98.7], [-6.2, 106.8], [-7.8, 112.7], [-8.5, 118.5], [1.5, 124.8], // Indonesia
  [14.6, 121.0], [10.3, 123.9], // Philippines
  [21.0, 105.8], [13.7, 100.5], [16.8, 96.2], [11.6, 104.9], // Indochina
  [51.5, -0.1], [53.3, -6.3], [55.9, -3.2], // UK/Ireland
];

function pointInPolygon(lat: number, lon: number, poly: LatLon[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [lat_i, lon_i] = poly[i];
    const [lat_j, lon_j] = poly[j];
    const intersect =
      lat_i > lat !== lat_j > lat &&
      lon < ((lon_j - lon_i) * (lat - lat_i)) / (lat_j - lat_i) + lon_i;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** 시드 고정 의사난수 (렌더마다 지도가 흔들리지 않도록). */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function generateWorldDots(stepDeg = 3.2): LatLon[] {
  const dots: LatLon[] = [];
  let seed = 0;
  for (let lat = -55; lat <= 72; lat += stepDeg) {
    for (let lon = -170; lon <= 150; lon += stepDeg) {
      seed++;
      const jLat = lat + (pseudoRandom(seed) - 0.5) * stepDeg * 0.6;
      const jLon = lon + (pseudoRandom(seed + 0.5) - 0.5) * stepDeg * 0.6;
      for (const poly of CONTINENTS) {
        if (pointInPolygon(jLat, jLon, poly)) {
          dots.push([jLat, jLon]);
          break;
        }
      }
    }
  }
  return [...dots, ...EXTRA_ISLAND_DOTS];
}
