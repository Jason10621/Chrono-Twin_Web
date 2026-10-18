"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import {
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  ClipboardList,
  Code2,
  ExternalLink,
  FileText,
  FlaskConical,
  Globe,
  ImageIcon,
  Lightbulb,
  Sigma,
  Sparkles,
  Workflow,
  type LucideProps,
} from "lucide-react";
import {
  ALL_FILES,
  GROUP_COLOR,
  GROUP_LABEL,
  PEOPLE,
  PHASES,
  STAGES,
  fileMeta,
  stagePeople,
  type AboutFile,
  type FileGroup,
  type IconKey,
  type Stage,
} from "@/lib/aboutData";
import FileViewer from "./FileViewer";

const ICONS: Record<IconKey, ComponentType<LucideProps>> = {
  lightbulb: Lightbulb,
  book: BookOpen,
  sigma: Sigma,
  clipboard: ClipboardList,
  flask: FlaskConical,
  workflow: Workflow,
  globe: Globe,
  bot: Bot,
};

const fill = (c: string, a = 1) => `rgb(var(--sys-${c}) / ${a})`;
const ink = (c: string) => `var(--t-${c})`;

/** 파일 종류에 맞는 아이콘 */
function FileIcon({ f, className }: { f: AboutFile; className?: string }) {
  if (f.kind === "code") return <Code2 className={className} strokeWidth={1.8} />;
  if (f.kind === "image") return <ImageIcon className={className} strokeWidth={1.8} />;
  if (f.kind === "html") return <Sparkles className={className} strokeWidth={1.8} />;
  if (f.kind === "link") return <ExternalLink className={className} strokeWidth={1.8} />;
  return <FileText className={className} strokeWidth={1.8} />;
}

/* ─────────────────────────── 가로 플로우 (데스크톱) ─────────────────────────── */

function FlowTrack({ activeIdx, onSelect }: { activeIdx: number; onSelect: (i: number) => void }) {
  const n = STAGES.length;
  const progress = (activeIdx / (n - 1)) * 100;
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const runs = useMemo(() => {
    const out: { phase: Stage["phase"]; from: number; span: number }[] = [];
    STAGES.forEach((s, i) => {
      const last = out[out.length - 1];
      if (last && last.phase === s.phase) last.span += 1;
      else out.push({ phase: s.phase, from: i + 1, span: 1 });
    });
    return out;
  }, []);

  const gradient = `linear-gradient(90deg, ${fill("blue")} 0%, ${fill("blue")} 30%, ${fill("orange")} 40%, ${fill(
    "orange"
  )} 60%, ${fill("green")} 70%, ${fill("green")} 100%)`;

  function onKey(e: KeyboardEvent, i: number) {
    let next = i;
    if (e.key === "ArrowRight") next = Math.min(n - 1, i + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, i - 1);
    else return;
    e.preventDefault();
    onSelect(next);
    btnRefs.current[next]?.focus();
  }

  return (
    <div role="group" aria-label="개발 단계 흐름">
      {/* 단계 묶음 */}
      <div className="mb-8 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {runs.map((r) => {
          const c = PHASES[r.phase].color;
          return (
            <div key={r.phase} style={{ gridColumn: `${r.from} / span ${r.span}` }} className="px-3">
              <div className="h-[5px] rounded-full" style={{ background: fill(c, 0.6) }} />
              <p
                className="mx-auto mt-3.5 w-fit rounded-full px-4 py-1.5 text-[16px] font-semibold"
                style={{ background: fill(c, 0.14), color: ink(c) }}
              >
                {PHASES[r.phase].label}
              </p>
            </div>
          );
        })}
      </div>

      <div className="relative">
        {/* 흐르는 선 */}
        <div className="pointer-events-none absolute top-[33px]" style={{ left: `${50 / n}%`, right: `${50 / n}%` }}>
          <div className="h-[6px] w-full rounded-full" style={{ background: gradient, opacity: 0.28 }} />
          <div
            className="absolute inset-0 h-[6px] rounded-full transition-[clip-path] duration-700 ease-out"
            style={{ background: gradient, clipPath: `inset(0 ${100 - progress}% 0 0 round 999px)` }}
          />
          {Array.from({ length: n - 1 }, (_, i) => (
            <span
              key={i}
              className="absolute top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-fg-3 shadow-[0_1px_4px_rgb(0_0_0/0.12)]"
              style={{ left: `${((i + 0.5) / (n - 1)) * 100}%` }}
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2.6} />
            </span>
          ))}
          <span className="flow-dot absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full" />
        </div>

        {/* 노드 */}
        <div className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {STAGES.map((s, i) => {
            const c = PHASES[s.phase].color;
            const Icon = ICONS[s.icon];
            const active = i === activeIdx;
            return (
              <button
                key={s.id}
                ref={(el) => {
                  btnRefs.current[i] = el;
                }}
                type="button"
                onClick={() => onSelect(i)}
                onKeyDown={(e) => onKey(e, i)}
                aria-current={active ? "step" : undefined}
                className="group relative flex flex-col items-center px-1 text-center outline-offset-[10px]"
              >
                <span className="relative">
                  {active && (
                    <span
                      aria-hidden
                      className="node-pulse absolute inset-0 rounded-full"
                      style={{ background: fill(c, 0.35) }}
                    />
                  )}
                  <span
                    className={`relative flex h-[72px] w-[72px] items-center justify-center rounded-full transition-all duration-300 ${
                      active ? "" : "group-hover:-translate-y-1 group-hover:scale-105"
                    }`}
                    style={
                      active
                        ? {
                            background: `linear-gradient(150deg, ${fill(c)}, ${fill(c, 0.72)}), rgb(var(--surface))`,
                            color: "#fff",
                            transform: "scale(1.1)",
                            boxShadow: `0 0 0 8px ${fill(c, 0.18)}, 0 16px 36px ${fill(c, 0.45)}`,
                          }
                        : {
                            background: `linear-gradient(${fill(c, 0.14)}, ${fill(c, 0.14)}), rgb(var(--surface))`,
                            color: ink(c),
                            boxShadow: `inset 0 0 0 2.5px ${fill(c, 0.45)}`,
                          }
                    }
                  >
                    <Icon className="h-8 w-8" strokeWidth={1.8} />
                  </span>
                  <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-fg text-[14px] font-semibold tabular-nums text-bg ring-[3px] ring-surface">
                    {s.no}
                  </span>
                </span>
                <span
                  className="mt-5 text-[18px] font-semibold leading-tight transition-colors"
                  style={{ color: active ? "rgb(var(--fg))" : "rgb(var(--fg-2))" }}
                >
                  {s.short}
                </span>
                <span className="mt-1 text-[14px] text-fg-2">자료 {s.files.length}개</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── 세로 타임라인 (모바일) ─────────────────────────── */

function FlowList({
  activeIdx,
  onSelect,
  onOpen,
}: {
  activeIdx: number;
  onSelect: (i: number) => void;
  onOpen: (f: AboutFile) => void;
}) {
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);

  function select(i: number) {
    onSelect(i);
    // 위쪽 항목이 접히며 밀리는 걸 보정해, 눌린 단계가 화면 위쪽에 오도록 맞춘다
    requestAnimationFrame(() => rowRefs.current[i]?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }

  return (
    <ol className="relative md:hidden" aria-label="개발 단계 흐름">
      <span
        aria-hidden
        className="absolute bottom-6 left-[23px] top-6 w-[3px] rounded-full"
        style={{
          background: `linear-gradient(180deg, ${fill("blue", 0.5)}, ${fill("orange", 0.5)} 50%, ${fill("green", 0.5)})`,
        }}
      />
      {STAGES.map((s, i) => {
        const c = PHASES[s.phase].color;
        const Icon = ICONS[s.icon];
        const active = i === activeIdx;
        return (
          <li
            key={s.id}
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            className="relative scroll-mt-[68px] pb-2"
          >
            <button
              type="button"
              onClick={() => select(i)}
              aria-expanded={active}
              className="flex w-full items-center gap-4 py-2 text-left"
            >
              <span
                className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-all duration-300"
                style={
                  active
                    ? { background: fill(c), color: "#fff", boxShadow: `0 0 0 6px ${fill(c, 0.18)}` }
                    : {
                        background: `linear-gradient(${fill(c, 0.14)}, ${fill(c, 0.14)}), rgb(var(--surface))`,
                        color: ink(c),
                        boxShadow: `inset 0 0 0 2.5px ${fill(c, 0.5)}`,
                      }
                }
              >
                <Icon className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold" style={{ color: ink(c) }}>
                  {s.no}단계 · {PHASES[s.phase].label}
                </span>
                <span className="block text-[19px] font-semibold leading-snug">{s.title}</span>
              </span>
              <ChevronRight
                className={`h-5 w-5 shrink-0 text-fg-2 transition-transform ${active ? "rotate-90" : ""}`}
                strokeWidth={2}
              />
            </button>
            {active && (
              <div className="mt-2">
                <DetailPanel stage={s} onOpen={onOpen} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ─────────────────────────── 단계 상세 + 자료 목록 ─────────────────────────── */

function FileCard({ f, onOpen }: { f: AboutFile; onOpen: (f: AboutFile) => void }) {
  const c = GROUP_COLOR[f.group];
  const author = f.by ? PEOPLE[f.by].name : null;
  return (
    <button
      type="button"
      onClick={() => onOpen(f)}
      className="group flex w-full items-center gap-4 rounded-[20px] bg-surface-2 p-4 text-left transition hover:bg-fg/[0.09] active:scale-[0.99]"
    >
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
        style={{ background: fill(c, 0.14), color: ink(c) }}
      >
        <FileIcon f={f} className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold leading-snug">{f.title}</span>
        <span className="mt-0.5 block text-[15px] leading-snug text-fg-2">{f.desc}</span>
        <span className="mt-1.5 block text-[14px] text-fg-2">
          {fileMeta(f)}
          {author && <span> · {author}</span>}
        </span>
      </span>
      {f.kind === "link" ? (
        <ExternalLink className="h-5 w-5 shrink-0 text-fg-2" strokeWidth={2} />
      ) : (
        <span className="flex shrink-0 items-center gap-0.5 text-[15px] font-medium text-tx-blue">
          열람
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.2} />
        </span>
      )}
    </button>
  );
}

function DetailPanel({ stage, onOpen }: { stage: Stage; onOpen: (f: AboutFile) => void }) {
  const c = PHASES[stage.phase].color;
  const [group, setGroup] = useState<FileGroup | "all">("all");

  const counts = useMemo(() => {
    const m = new Map<FileGroup, number>();
    stage.files.forEach((f) => m.set(f.group, (m.get(f.group) ?? 0) + 1));
    return m;
  }, [stage]);
  const files = group === "all" ? stage.files : stage.files.filter((f) => f.group === group);
  const people = stagePeople(stage);

  return (
    <div className="card panel-in !p-6 md:!p-10">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-4">
          <span
            className="text-[clamp(48px,7vw,76px)] font-semibold leading-none tracking-[-0.04em] tabular-nums"
            style={{ color: ink(c) }}
          >
            {String(stage.no).padStart(2, "0")}
          </span>
          <h3 className="t-card-title">{stage.title}</h3>
        </div>
        <span
          className="rounded-full px-3.5 py-1.5 text-[15px] font-semibold"
          style={{ background: fill(c, 0.14), color: ink(c) }}
        >
          {PHASES[stage.phase].label}
        </span>
      </div>

      <p className="t-lead mt-5 max-w-3xl">{stage.summary}</p>
      {stage.note && (
        <p className="mt-4 w-fit max-w-full rounded-2xl bg-surface-2 px-5 py-3 text-[clamp(18px,2.4vw,22px)] font-medium tracking-tight">
          {stage.note}
        </p>
      )}

      <div className="mt-9 grid gap-x-12 gap-y-9 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <h4 className="text-[19px] font-semibold">이 단계에서 한 일</h4>
          <ul className="mt-4 space-y-3.5">
            {stage.did.map((d) => (
              <li key={d} className="flex gap-3 text-[17px] leading-snug">
                <span
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                  style={{ background: fill(c, 0.16), color: ink(c) }}
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
                <span>{d}</span>
              </li>
            ))}
          </ul>

          <h4 className="mt-9 text-[19px] font-semibold">자료를 만든 사람</h4>
          <div className="mt-4 flex flex-wrap gap-2">
            {people.map((p) => (
              <span key={p} className="rounded-full bg-fg/[0.07] px-3.5 py-1.5 text-[15px]">
                <b className="font-semibold">{PEOPLE[p].name}</b>
                <span className="ml-1.5 text-fg-2">{PEOPLE[p].part}</span>
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-[19px] font-semibold">
              자료 <span className="text-fg-2">{stage.files.length}</span>
            </h4>
            {counts.size > 1 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="자료 종류 필터">
                <button type="button" aria-pressed={group === "all"} onClick={() => setGroup("all")} className="chip !min-h-[38px] !px-4 !text-[15px]">
                  전체
                </button>
                {(Array.from(counts.keys()) as FileGroup[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={group === g}
                    onClick={() => setGroup(g)}
                    className="chip !min-h-[38px] !px-4 !text-[15px]"
                  >
                    {GROUP_LABEL[g]} {counts.get(g)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 grid gap-2.5">
            {files.map((f) => (
              <FileCard key={f.id} f={f} onOpen={onOpen} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── 전체 ─────────────────────────── */

const FILE_IDS = new Set(ALL_FILES.map((f) => f.id));

export default function AboutFlow() {
  const [activeId, setActiveId] = useState(STAGES[0].id);
  const [openId, setOpenId] = useState<string | null>(null);
  const pushedRef = useRef(false);

  // #s3 → 3단계 선택, #s3/s3-plan → 해당 자료 열기 (주소 공유·뒤로가기 지원)
  useEffect(() => {
    const apply = () => {
      const [s, f] = window.location.hash.replace("#", "").split("/");
      if (STAGES.some((x) => x.id === s)) setActiveId(s);
      setOpenId(f && FILE_IDS.has(f) ? f : null);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  const activeIdx = Math.max(0, STAGES.findIndex((s) => s.id === activeId));
  const stage = STAGES[activeIdx];

  const selectStage = useCallback((i: number) => {
    const id = STAGES[i].id;
    setActiveId(id);
    window.history.replaceState(null, "", `#${id}`);
  }, []);

  const openFile = useCallback(
    (f: AboutFile) => {
      if (f.kind === "link" && f.href) {
        window.open(f.href, "_blank", "noopener,noreferrer");
        return;
      }
      pushedRef.current = true;
      window.location.hash = `${activeId}/${f.id}`;
    },
    [activeId]
  );

  const closeFile = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", `#${activeId}`);
      setOpenId(null);
    }
  }, [activeId]);

  const opened = openId ? stage.files.find((f) => f.id === openId) ?? null : null;
  const viewable = stage.files.filter((f) => f.kind !== "link");

  return (
    <>
      <div className="flow-stage hidden rounded-[32px] px-6 pb-10 pt-9 md:block">
        <FlowTrack activeIdx={activeIdx} onSelect={selectStage} />
      </div>
      <FlowList activeIdx={activeIdx} onSelect={selectStage} onOpen={openFile} />

      <div className="relative mt-10 hidden md:block">
        <span
          aria-hidden
          className="absolute -top-2 h-5 w-5 rotate-45 rounded-[5px] bg-surface transition-[left] duration-500"
          style={{ left: `calc(24px + (100% - 48px) * ${(activeIdx + 0.5) / STAGES.length} - 10px)` }}
        />
        <div className="relative">
          <DetailPanel key={stage.id} stage={stage} onOpen={openFile} />
        </div>
      </div>

      {opened && (
        <FileViewer
          key={opened.id}
          file={opened}
          stage={stage}
          siblings={viewable}
          onClose={closeFile}
          onNavigate={(id) => {
            window.history.replaceState(null, "", `#${activeId}/${id}`);
            setOpenId(id);
          }}
        />
      )}
    </>
  );
}
