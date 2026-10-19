"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ImageIcon, Share2 } from "lucide-react";
import { delaySentence } from "@/lib/chronoTwinModel";
import { matchJetlagCity } from "@/lib/jetlagCities";

const W = 1080;
const H = 1350;
const FONT = '"SF Pro Display","SF Pro KR","Pretendard Variable",Pretendard,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif';

const signed = (m: number) => `${m >= 0 ? "+" : "−"}${Math.abs(Math.round(m))}`;

/** 결과를 1080×1350 이미지로 그린다. 입력값 같은 개인 정보는 넣지 않고, 도시 비유와 위상 지연 숫자만 담는다. */
async function drawCard(phaseDelayMin: number, host: string): Promise<Blob> {
  try {
    await document.fonts.load(`700 100px ${FONT}`);
    await document.fonts.load(`500 40px ${FONT}`);
    await document.fonts.ready;
  } catch {
    /* 폰트 준비를 못 기다려도 기본 서체로 그린다 */
  }

  const { city, virtualHours } = matchJetlagCity(phaseDelayMin);
  const isSeoul = city.city === "서울";
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");

  // 배경
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b1226");
  bg.addColorStop(1, "#14233f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  glow(W * 0.85, H * 0.18, 620, "rgba(10,132,255,0.34)");
  glow(W * 0.1, H * 0.82, 560, isSeoul ? "rgba(48,209,88,0.26)" : "rgba(255,159,10,0.26)");

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `600 44px ${FONT}`;
  ctx.fillText("Chrono-Twin", 90, 130);

  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.font = `500 46px ${FONT}`;
  ctx.fillText("오늘 내 몸의 시간은", 90, 380);

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 150px ${FONT}`;
  if (isSeoul) {
    ctx.fillText("서울 그대로", 90, 540);
    ctx.fillText("예요", 90, 700);
  } else {
    ctx.fillText(city.city, 90, 540);
    ctx.fillText("시간이에요", 90, 700);
  }

  // 위상 지연 숫자
  const tone = isSeoul || phaseDelayMin < 50 ? "#64d2ff" : phaseDelayMin <= 120 ? "#ff9f0a" : "#ff6961";
  ctx.fillStyle = tone;
  ctx.font = `700 230px ${FONT}`;
  const num = signed(phaseDelayMin);
  ctx.fillText(num, 90, 960);
  const numW = ctx.measureText(num).width;
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.font = `500 70px ${FONT}`;
  ctx.fillText("분", 90 + numW + 18, 960);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `600 54px ${FONT}`;
  ctx.fillText(delaySentence(phaseDelayMin), 90, 1050);

  if (!isSeoul) {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `500 40px ${FONT}`;
    ctx.fillText(`서울보다 약 ${virtualHours.toFixed(1)}시간 느려요`, 90, 1112);
  }

  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = `600 40px ${FONT}`;
  ctx.fillText(host, 90, 1236);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = `500 30px ${FONT}`;
  ctx.fillText("발표용 비유예요 · 더미 데이터로 검증한 간이 추정이에요", 90, 1288);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob_failed"))), "image/png")
  );
}

export default function ShareCard({ phaseDelayMin }: { phaseDelayMin: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<{ url: string; blob: Blob } | null>(null);
  const [canShare, setCanShare] = useState(false);
  const lastUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    },
    []
  );

  // 숫자가 바뀌면 이전 카드는 낡은 값이므로 지운다.
  useEffect(() => {
    setCard(null);
  }, [phaseDelayMin]);

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      const blob = await drawCard(phaseDelayMin, window.location.host);
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
      const url = URL.createObjectURL(blob);
      lastUrl.current = url;
      setCard({ url, blob });
      try {
        const file = new File([blob], "chrono-twin.png", { type: "image/png" });
        setCanShare(typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }));
      } catch {
        setCanShare(false);
      }
    } catch {
      setError("카드를 만들지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!card) return;
    try {
      const file = new File([card.blob], "chrono-twin.png", { type: "image/png" });
      await navigator.share({ files: [file], title: "Chrono-Twin", text: "오늘 내 몸의 시간은?" });
    } catch {
      /* 공유창을 닫은 경우 — 아무것도 하지 않는다 */
    }
  };

  const save = () => {
    if (!card) return;
    const a = document.createElement("a");
    a.href = card.url;
    a.download = "chrono-twin.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="card mt-5 text-center">
      <p className="t-card-title">친구에게 보여주기</p>
      <p className="t-lead mx-auto mt-3 max-w-xl">결과를 이미지 카드로 만들어요. 내가 입력한 값은 들어가지 않아요.</p>

      {!card ? (
        <button type="button" onClick={make} disabled={busy} className="btn btn-primary mt-7 disabled:opacity-60">
          <ImageIcon className="mr-2 h-5 w-5" strokeWidth={2.2} />
          {busy ? "만드는 중…" : "카드 만들기"}
        </button>
      ) : (
        <div className="mt-7">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.url}
            alt="Chrono-Twin 결과 카드"
            className="mx-auto w-full max-w-[360px] rounded-[24px] shadow-[0_10px_40px_rgb(0_0_0/0.25)]"
          />
          <div className="mt-7 flex flex-wrap items-center justify-center gap-4">
            {canShare && (
              <button type="button" onClick={share} className="btn btn-primary">
                <Share2 className="mr-2 h-5 w-5" strokeWidth={2.2} />
                공유하기
              </button>
            )}
            <button type="button" onClick={save} className={canShare ? "link" : "btn btn-primary"}>
              <Download className="mr-2 h-5 w-5" strokeWidth={2.2} />
              이미지 저장
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-4 text-[16px] text-tx-orange">{error}</p>}
    </div>
  );
}
