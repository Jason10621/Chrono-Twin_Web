"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ChevronLeft, ChevronRight, Eye, Minus, Plus, X } from "lucide-react";
import { MANIFEST, fileMeta, type AboutFile, type Stage } from "@/lib/aboutData";
import { highlight } from "@/lib/highlight";

const BASE = "/about-files";
const ZOOMS = [0.75, 1, 1.4, 1.9];
const PAGE_BASE_PX = 820;

/* ── 문서(PDF·한글·워드) : 페이지 이미지를 세로로 쌓아서 보여준다. 원본 파일은 공개하지 않는다. ── */
function PageStack({ file, zoom, scroller }: { file: AboutFile; zoom: number; scroller: RefObject<HTMLDivElement | null> }) {
  const m = MANIFEST[file.id];
  const total = m?.pages ?? 0;
  const aspect = m?.w && m?.h ? m.w / m.h : 0.707;
  const [current, setCurrent] = useState(1);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        let bestPage = 0;
        let bestRatio = 0;
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > bestRatio) {
            bestRatio = e.intersectionRatio;
            bestPage = Number((e.target as HTMLElement).dataset.page);
          }
        }
        if (bestPage) setCurrent(bestPage);
      },
      { root, threshold: [0.3, 0.6] }
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [scroller, total]);

  return (
    <>
      <div className={`flex justify-center px-4 py-6 md:py-10 ${zoom > 1 ? "w-max min-w-full" : "w-full"}`}>
        <div
          className="space-y-5"
          style={{ width: Math.round(PAGE_BASE_PX * zoom), maxWidth: zoom <= 1 ? "100%" : undefined }}
        >
          {Array.from({ length: total }, (_, i) => (
            <div
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              data-page={i + 1}
              className="relative w-full overflow-hidden rounded-lg bg-white shadow-[0_2px_16px_rgb(0_0_0/0.14)]"
              style={{ aspectRatio: String(aspect) }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${BASE}/pages/${file.id}/${String(i + 1).padStart(2, "0")}.webp`}
                alt={`${file.title} ${i + 1}쪽`}
                loading={i < 2 ? "eager" : "lazy"}
                decoding="async"
                draggable={false}
                className="block h-full w-full"
              />
            </div>
          ))}
        </div>
      </div>
      {total > 1 && (
        <div className="nav-blur pointer-events-none fixed bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-full px-4 py-2 text-[15px] font-semibold tabular-nums shadow-[0_6px_24px_rgb(0_0_0/0.18)]">
          {current} / {total}
        </div>
      )}
    </>
  );
}

/* ── 코드 · 텍스트 ── */
function useText(id: string) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setText(null);
    fetch(`${BASE}/text/${id}.txt`)
      .then((r) => (r.ok ? r.text() : ""))
      .then((t) => alive && setText(t))
      .catch(() => alive && setText(""));
    return () => {
      alive = false;
    };
  }, [id]);
  return text;
}

function CodeView({ file }: { file: AboutFile }) {
  const m = MANIFEST[file.id];
  const text = useText(file.id);
  const lines = useMemo(() => (text ? highlight(text, m?.lang ?? "ts") : []), [text, m?.lang]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <p className="mb-3 font-mono text-[15px] text-fg-2">{m?.path}</p>
      <div className="overflow-x-auto rounded-[20px] bg-surface p-4 ring-1 ring-line/10 md:p-6">
        {text === null ? (
          <p className="py-10 text-center text-[17px] text-fg-2">불러오는 중…</p>
        ) : (
          <div className="w-max min-w-full font-mono text-[14.5px] leading-[1.75]">
            {lines.map((ln, i) => (
              <div key={i} className="flex">
                <span className="w-12 shrink-0 select-none pr-4 text-right text-fg-3">{i + 1}</span>
                <span className="whitespace-pre">
                  {ln.length > 0
                    ? ln.map((t, j) => (
                        <span key={j} className={`tok-${t.t}`}>
                          {t.v}
                        </span>
                      ))
                    : " "}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TextView({ file }: { file: AboutFile }) {
  const text = useText(file.id);
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-10">
      <div className="overflow-x-auto rounded-[20px] bg-surface p-5 ring-1 ring-line/10 md:p-8">
        {text === null ? (
          <p className="py-10 text-center text-[17px] text-fg-2">불러오는 중…</p>
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-[15px] leading-[1.8]">{text}</pre>
        )}
      </div>
    </div>
  );
}

/* ── 그림 ── */
function ImageView({ file, zoom }: { file: AboutFile; zoom: number }) {
  const ext = MANIFEST[file.id]?.ext ?? "png";
  return (
    <div className={`flex justify-center px-4 py-6 md:py-10 ${zoom > 1 ? "w-max min-w-full" : "w-full"}`}>
      <div
        className="rounded-[20px] bg-white p-3 shadow-[0_2px_16px_rgb(0_0_0/0.14)] md:p-6"
        style={{ width: Math.round(1000 * zoom), maxWidth: zoom <= 1 ? "100%" : undefined }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${BASE}/img/${file.id}.${ext}`} alt={file.title} draggable={false} className="block h-auto w-full" />
      </div>
    </div>
  );
}

/* ── 전체 화면 뷰어 ── */
export default function FileViewer({
  file,
  stage,
  siblings,
  onClose,
  onNavigate,
}: {
  file: AboutFile;
  stage: Stage;
  siblings: AboutFile[];
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [zoomIdx, setZoomIdx] = useState(1);
  const zoomable = file.kind === "pdf" || file.kind === "image";
  const idx = siblings.findIndex((f) => f.id === file.id);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  useEffect(() => {
    closeBtn.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && prev && file.kind !== "html") onNavigate(prev.id);
      else if (e.key === "ArrowRight" && next && file.kind !== "html") onNavigate(next.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNavigate, prev, next, file.kind]);

  const block = (e: { preventDefault: () => void }) => e.preventDefault();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={file.title}
      className="about-viewer view-only fixed inset-0 z-[60] flex flex-col bg-bg"
      onContextMenu={block}
      onCopy={block}
      onCut={block}
      onDragStart={block}
    >
      <header className="nav-blur flex h-[60px] shrink-0 items-center gap-2 px-3 md:gap-3 md:px-6">
        <button
          ref={closeBtn}
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="icon-btn shrink-0"
        >
          <X className="h-6 w-6" strokeWidth={2} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold leading-tight md:text-[19px]">{file.title}</p>
          <p className="truncate text-[14px] leading-tight text-fg-2">
            {stage.no}단계 {stage.short} · {fileMeta(file)}
          </p>
        </div>

        {zoomable && (
          <div className="hidden items-center sm:flex">
            <button
              type="button"
              className="icon-btn disabled:opacity-30"
              aria-label="축소"
              disabled={zoomIdx === 0}
              onClick={() => setZoomIdx((z) => Math.max(0, z - 1))}
            >
              <Minus className="h-5 w-5" strokeWidth={2.2} />
            </button>
            <span className="w-12 text-center text-[14px] font-medium tabular-nums text-fg-2">
              {Math.round(ZOOMS[zoomIdx] * 100)}%
            </span>
            <button
              type="button"
              className="icon-btn disabled:opacity-30"
              aria-label="확대"
              disabled={zoomIdx === ZOOMS.length - 1}
              onClick={() => setZoomIdx((z) => Math.min(ZOOMS.length - 1, z + 1))}
            >
              <Plus className="h-5 w-5" strokeWidth={2.2} />
            </button>
          </div>
        )}

        <span className="hidden items-center gap-1.5 rounded-full bg-fg/[0.07] px-3 py-1.5 text-[14px] font-medium text-fg-2 lg:inline-flex">
          <Eye className="h-4 w-4" strokeWidth={2} />
          열람 전용
        </span>

        {siblings.length > 1 && (
          <div className="flex items-center">
            <button
              type="button"
              className="icon-btn disabled:opacity-30"
              aria-label="이전 자료"
              disabled={!prev}
              onClick={() => prev && onNavigate(prev.id)}
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={2} />
            </button>
            <button
              type="button"
              className="icon-btn disabled:opacity-30"
              aria-label="다음 자료"
              disabled={!next}
              onClick={() => next && onNavigate(next.id)}
            >
              <ChevronRight className="h-6 w-6" strokeWidth={2} />
            </button>
          </div>
        )}
      </header>

      {file.kind === "html" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="shrink-0 px-5 py-2 text-center text-[14px] text-fg-2">
            직접 눌러보며 체험할 수 있는 화면이에요
          </p>
          <iframe
            title={file.title}
            src={`${BASE}/html/${file.id}.html`}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            className="min-h-0 w-full flex-1 border-0 bg-white"
          />
        </div>
      ) : (
        <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
          {file.kind === "pdf" && <PageStack file={file} zoom={ZOOMS[zoomIdx]} scroller={scroller} />}
          {file.kind === "image" && <ImageView file={file} zoom={ZOOMS[zoomIdx]} />}
          {file.kind === "code" && <CodeView file={file} />}
          {file.kind === "text" && <TextView file={file} />}
        </div>
      )}
    </div>
  );
}
