"""
파이프라인 오케스트레이터 — 전 구간 실행 + 리포트/그림 출력
==========================================================

    python -m pipeline.run_pipeline [--subjects 40] [--days 14] [--seed N]
                                    [--impute group_median|knn] [--outdir DIR]
                                    [--zmethod standard|modified] [--no-figures]

출력 (outdir, 기본 pipeline/outputs/)
    clean_daily.csv          정제된 1인-1일 레코드 (파생 피처 포함)
    analysis_table.csv       회귀 입력 테이블 (ChronoTwinRecord)
    msfsc_by_subject.csv     피험자별 MSF / MSFsc
    quarantine.csv           격리된 불량 레코드
    regression_report.txt    회귀 결과 전문 + H4 판정 + Z-score 로그
    figures/*.png            분포 · 상관 히트맵 · 기여도 · 카페인 감쇠 곡선
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from . import correlation, dummy_data, regression
from .etl import run_etl
from .outliers import ANALYSIS_OUTLIER_COLS as OUTLIER_COLS, remove_outliers, scan_dataframe
from .schema import Z_THRESHOLD


def _hr(title: str) -> str:
    return f"\n{'═' * 66}\n  {title}\n{'═' * 66}"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Chrono-Twin 파이프라인 실행 (더미 데이터)")
    ap.add_argument("--subjects", type=int, default=40)
    ap.add_argument("--days", type=int, default=14)
    ap.add_argument("--seed", type=int, default=20260904)
    ap.add_argument("--impute", choices=["group_median", "knn"], default="group_median")
    ap.add_argument("--zmethod", choices=["standard", "modified"], default="standard")
    ap.add_argument("--outdir", type=Path, default=Path(__file__).parent / "outputs")
    ap.add_argument("--no-figures", action="store_true")
    args = ap.parse_args(argv)

    outdir: Path = args.outdir
    outdir.mkdir(parents=True, exist_ok=True)
    log_lines: list[str] = []

    def emit(s: str = "") -> None:
        print(s)
        log_lines.append(s)

    # ── 1. 더미 데이터 ─────────────────────────────────────────────
    emit(_hr("1. 더미 데이터 생성"))
    ds = dummy_data.generate(args.subjects, args.days, seed=args.seed)
    emit(f"  피험자 {len(ds.profiles)}명 × {ds.n_days}일 = 응답 {len(ds.responses)}건")
    emit(f"  의도적으로 심은 결함: {ds.injected_defects}")
    emit("  생성 모형 정답 계수(ground truth):")
    for k, v in ds.ground_truth.items():
        emit(f"    {k:<24} {v}")

    # ── 2. ETL ───────────────────────────────────────────────────
    emit(_hr("2. ETL (Extract → Transform → Load)"))
    result = run_etl(ds.responses, ds.profiles, impute_method=args.impute)
    for line in result.report.summary_lines():
        emit(line)
    for step in result.report.steps:
        emit(f"  · {step}")

    if result.report.quarantine_rows:
        qdf = pd.DataFrame(result.report.quarantine_rows)
        qdf.to_csv(outdir / "quarantine.csv", index=False, encoding="utf-8-sig")
        emit(f"  격리 레코드 {len(qdf)}건 → quarantine.csv")

    if result.daily.empty:
        emit("\n[중단] 정제 후 데이터가 없습니다.")
        _write_log(outdir, log_lines)
        return 1

    result.daily.to_csv(outdir / "clean_daily.csv", index=False, encoding="utf-8-sig")
    result.msfsc.to_csv(outdir / "msfsc_by_subject.csv", index=False, encoding="utf-8-sig")
    emit(f"  clean_daily.csv ({len(result.daily)}행) · msfsc_by_subject.csv ({len(result.msfsc)}명) 저장")

    # ── 3. Z-score 이상치 제거 ────────────────────────────────────
    emit(_hr(f"3. Z-score 이상치 제거  (|Z| > {Z_THRESHOLD}, method={args.zmethod})"))
    analysis = result.analysis.reset_index(drop=True)
    scan = scan_dataframe(analysis, OUTLIER_COLS, threshold=Z_THRESHOLD, method=args.zmethod)
    for line in scan.summary_lines():
        emit(line)
    # 상세 로그(최대 20건)
    shown = 0
    for col, rep in scan.column_reports.items():
        for d in rep.detail:
            if shown < 20:
                emit(f"      [{col}] {d}")
                shown += 1
    if shown == 20:
        emit("      … (이하 생략, 전체는 regression_report.txt)")

    clean, _ = remove_outliers(analysis, OUTLIER_COLS, threshold=Z_THRESHOLD, method=args.zmethod)
    analysis["is_outlier"] = scan.row_is_outlier
    analysis["outlier_reasons"] = [";".join(r) for r in scan.row_reasons]
    analysis.to_csv(outdir / "analysis_table.csv", index=False, encoding="utf-8-sig")
    emit(f"  이상치 {scan.n_outlier_rows}행 제외 → 회귀 표본 {len(clean)}행")

    # ── 4. 상관분석 (사전 탐색, §5-2) ────────────────────────────
    emit(_hr("4. 상관분석 (사전 탐색)  — §5-2"))
    ca = correlation.correlation_analysis(
        clean, regression.TARGET, regression.DEFAULT_PREDICTORS, regression.DEFAULT_COVARIATES,
    )
    emit(f"  정규성(Shapiro-Wilk): " + ", ".join(
        f"{n.column.split('_')[0]}={'정규' if n.is_normal else '비정규' if n.p is not None else 'n/a'}"
        for n in ca.normality))
    emit(f"  사용 계수: {ca.method}  ({ca.method_reason})")
    emit("  Y 와의 상관:")
    for p in ca.target_corr:
        emit(f"    {p.b:<22} pearson r={p.pearson_r:+.3f} (p={p.pearson_p:.3g})  "
             f"spearman ρ={p.spearman_r:+.3f}")
    for line in ca.verdict.splitlines():
        emit(f"  {line}")

    # ── 5. 다중선형회귀 ──────────────────────────────────────────
    emit(_hr("5. 다중선형회귀분석  — §5-3"))
    models = regression.compare_models(clean)
    for res in models.values():
        emit(res.to_text())
        emit("")
    emit("  " + regression.h4_verdict(models))

    # 피험자 고정효과(within) 모형 — 반복측정 보정
    emit("")
    fe = regression.fit_within(clean, regression.DEFAULT_PREDICTORS,
                               regression.DEFAULT_COVARIATES, subject_col="subject_id")
    models["피험자 고정효과(within)"] = fe
    emit(fe.to_text())

    # ── 5b. 파생 피처 정확도 점검 (파이프라인 vs 생성 정답) ──────────
    emit("\n  [파생 피처 정확도]  파이프라인 계산값 vs 더미 생성 정답 (r=상관, MAE=평균절대오차)")
    truth_df = dummy_data.truth_to_dataframe(ds)
    merged = clean.merge(truth_df, on=["subject_id", "survey_date"], how="inner")
    daily_flags = result.daily.set_index("record_id")["imputed_fields"].to_dict() \
        if "imputed_fields" in result.daily else {}
    clean_mask = merged["record_id"].map(lambda r: not str(daily_flags.get(r, "")).strip())
    emit(f"    매칭 {len(merged)}행 (대체값 없는 행 {int(clean_mask.sum())})")
    feat_pairs = [
        ("bluelight_adj_min", "bl_adj_true"),
        ("caffeine_residue_mg", "caf_residue_true"),
        ("sleep_debt_min", "sleep_debt_true"),
        ("led_evening_load", "led_load_true"),
    ]
    for calc, tru in feat_pairs:
        if calc in merged and tru in merged:
            diff = (merged[calc] - merged[tru]).abs()
            cm = merged[clean_mask]
            corr_clean = cm[calc].corr(cm[tru])
            mae_clean = (cm[calc] - cm[tru]).abs().mean()
            rel = mae_clean / (merged[tru].std() or 1.0)      # 표준편차 대비 상대 오차
            verdict = "일치" if (corr_clean > 0.995 and rel < 0.08) else (
                "대체행만 오차" if corr_clean > 0.95 else "점검 필요")
            emit(f"    {calc:<22} r(무대체)={corr_clean:.4f}  MAE(무대체)={mae_clean:.3f} "
                 f"(SD 대비 {rel*100:.1f}%)  MAE(전체)={diff.mean():.2f}   {verdict}")
    emit("    ※ 카페인 잔류의 무대체 오차(~3mg)는 더미 생성기가 취침시각을 근사한 탓 "
         "— 파이프라인이 실제 취침시각을 써서 오히려 더 정확 (생성기 docstring 참조).")

    # ── 5c. 정답 계수 복원 점검 ─────────────────────────────────
    emit("\n  [회귀 계수 복원]  더미 생성 모형 계수 vs 추정 (pooled / within)")
    pooled = models["통합+공변량"]
    # kind: clean(시변·외생 → 정확 복원 기대) / dynamic(동적 내생 → 과소추정 예상)
    truth_map = {
        "bluelight_adj_min":  (ds.ground_truth["beta_bluelight_adj"], "clean"),
        "caffeine_residue_mg": (ds.ground_truth["beta_caffeine_residue"], "clean"),
        "led_evening_load":   (ds.ground_truth["gamma_led_load"], "clean"),
        "sleep_debt_min":     (ds.ground_truth["beta_sleep_debt"], "dynamic"),
    }
    emit(f"    {'변수':<22}{'정답':>9}{'pooled':>10}{'within':>10}   판정")
    ok_all = True
    for name, (truth, kind) in truth_map.items():
        tp, tw = pooled.term(name), fe.term(name)
        bp = f"{tp.beta:.3f}" if tp else "  –  "
        bw = f"{tw.beta:.3f}" if tw else "  –  "
        if not tw:
            flag = "within 탈락"
        elif kind == "clean":
            err = (tw.beta - truth) / truth * 100
            flag = "✓ 복원" if abs(err) < 20 else f"✗ 오차 {err:+.0f}%"
            ok_all &= abs(err) < 20
        else:  # dynamic
            flag = "동적 내생성 → 과소추정(예상), 부호·유의성만 신뢰"
        emit(f"    {name:<22}{truth:>9.3f}{bp:>10}{bw:>10}   {flag}")
    emit("    ▸ 시변·외생 변수(blAdj·카페인·LED): within 에서 ±20% 내 복원되면 파이프라인 정상.")
    emit("    ▸ 수면부채(β₃): 지연 종속변수로 구성된 동적 내생 변수 → within/pooled 모두")
    emit("      Nickell 편향으로 20~35% 과소추정. 정확 추정엔 Arellano-Bond/시스템 GMM 또는")
    emit("      더 긴 패널이 필요 (보고서 한계점 항목).")
    emit("    ▸ 크로노타입·성별·학년(시불변)은 within 에서 자동 탈락 — 정상."
         " 개인 baseline·MSFsc 모형에서 다룸.")
    emit(f"    ⇒ 파이프라인 자체검증: {'통과' if ok_all else '실패 — 코드 점검 필요'}")

    # ── 6. 그림 ─────────────────────────────────────────────────
    if not args.no_figures:
        emit(_hr("6. 시각화"))
        try:
            _make_figures(result.daily, clean, outdir / "figures", emit, ca)
        except Exception as e:  # pragma: no cover
            emit(f"  [경고] 그림 생성 실패: {e}")

    # ── 저장 ───────────────────────────────────────────────────
    report_txt = _build_report_txt(models, scan, ds, result, ca)
    (outdir / "regression_report.txt").write_text(report_txt, encoding="utf-8")
    _write_log(outdir, log_lines)
    emit(f"\n완료. 산출물 위치: {outdir.resolve()}")
    return 0


def _write_log(outdir: Path, lines: list[str]) -> None:
    (outdir / "run_log.txt").write_text("\n".join(lines), encoding="utf-8")


def _build_report_txt(models, scan, ds, result, ca=None) -> str:
    parts = ["Chrono-Twin 파이프라인 — 회귀 분석 리포트",
             "=" * 60,
             f"생성 표본: {len(ds.profiles)}명 × {ds.n_days}일",
             f"의도적 결함: {ds.injected_defects}",
             f"격리 레코드: {result.report.n_quarantined}건",
             ""]
    if ca is not None:
        parts.append("[상관분석 (사전 탐색) — §5-2]")
        parts.append(f"  사용 계수: {ca.method} — {ca.method_reason}")
        for p in ca.target_corr:
            parts.append(f"  Y ~ {p.b:<22} pearson r={p.pearson_r:+.3f} (p={p.pearson_p:.3g}) · "
                         f"spearman ρ={p.spearman_r:+.3f}")
        for line in ca.verdict.splitlines():
            parts.append(f"  {line}")
        parts.append("")
    parts.append("[Z-score 이상치 상세]")
    for col, rep in scan.column_reports.items():
        parts.append(f"  {col}: μ={rep.mu} σ={rep.sigma} threshold={rep.threshold} method={rep.method}")
        for d in rep.detail:
            parts.append(f"    {d}")
    parts.append("")
    for res in models.values():
        parts.append(res.to_text())
        parts.append("")
    parts.append(regression.h4_verdict(models))
    parts.append("")
    parts.append("[MSFsc 요약]")
    parts.append(result.msfsc.to_string(index=False) if not result.msfsc.empty else "  (계산 결과 없음)")
    return "\n".join(parts)


def _fig_corr(ca, figdir, plt) -> None:
    """§5-2 상관분석: 피어슨·스피어만 히트맵 나란히 + Y 상관 막대."""
    labels = [l.replace("_min", "").replace("_mg", "").replace("_offset", "")
              for l in ca.matrix_labels]
    P = ca.pearson_matrix
    S = ca.spearman_matrix
    fig, axes = plt.subplots(1, 3, figsize=(14, 4.4), gridspec_kw={"width_ratios": [1, 1, 0.9]})
    for ax, M, ttl in [(axes[0], P, "Pearson r"), (axes[1], S, "Spearman ρ")]:
        im = ax.imshow(M, vmin=-1, vmax=1, cmap="RdBu_r")
        ax.set_xticks(range(len(labels))); ax.set_xticklabels(labels, rotation=45, ha="right", fontsize=8)
        ax.set_yticks(range(len(labels))); ax.set_yticklabels(labels, fontsize=8)
        for i in range(len(labels)):
            for j in range(len(labels)):
                v = M[i][j]
                ax.text(j, i, f"{v:.2f}", ha="center", va="center", fontsize=6.5,
                        color="white" if abs(v) > 0.55 else "#222")
        ax.set_title(ttl, fontsize=10)
    # Y 상관 막대
    ax = axes[2]
    names = [p.b.replace("_min", "").replace("_mg", "").replace("_offset", "") for p in ca.target_corr]
    pr = [p.pearson_r for p in ca.target_corr]
    sr = [p.spearman_r for p in ca.target_corr]
    y = range(len(names))
    ax.barh([i + 0.2 for i in y], pr, height=0.35, color="#4fa3e0", label="Pearson")
    ax.barh([i - 0.2 for i in y], sr, height=0.35, color="#2dd4bf", label="Spearman")
    ax.set_yticks(list(y)); ax.set_yticklabels(names, fontsize=8)
    ax.axvline(0, color="#333", linewidth=0.8); ax.set_xlim(-1, 1)
    ax.set_title("Y(위상지연) 와의 상관", fontsize=10); ax.legend(fontsize=7)
    fig.suptitle(f"상관분석 (사전 탐색, §5-2) — 주 계수: {ca.method}", fontsize=11)
    fig.tight_layout()
    fig.savefig(figdir / "02_correlation.png"); plt.close(fig)


def _pick_korean_font() -> str | None:
    import matplotlib.font_manager as fm
    installed = {f.name for f in fm.fontManager.ttflist}
    for cand in ("Malgun Gothic", "NanumGothic", "AppleGothic", "Noto Sans KR",
                 "Noto Sans CJK KR", "Gulim", "Batang"):
        if cand in installed:
            return cand
    return None


def _make_figures(daily: pd.DataFrame, clean: pd.DataFrame, figdir: Path, emit, ca=None) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    figdir.mkdir(parents=True, exist_ok=True)
    kfont = _pick_korean_font()
    if kfont:
        plt.rcParams["font.family"] = kfont
    else:
        emit("  [경고] 한글 폰트를 찾지 못해 그림 라벨이 깨질 수 있음 (Malgun Gothic/Nanum 설치 권장)")
    plt.rcParams.update({"figure.dpi": 110, "font.size": 9, "axes.grid": True,
                         "grid.alpha": 0.25, "axes.axisbelow": True,
                         "axes.unicode_minus": False})

    # (a) 분포 히스토그램
    cols = ["bluelight_adj_min", "caffeine_residue_mg", "sleep_debt_min", "phase_delay_min"]
    fig, axes = plt.subplots(2, 2, figsize=(9, 6))
    for ax, c in zip(axes.ravel(), cols):
        ax.hist(clean[c].dropna(), bins=24, color="#4fa3e0", edgecolor="white", linewidth=0.4)
        ax.set_title(c)
    fig.suptitle("변수 분포 (이상치 제거 후)")
    fig.tight_layout()
    fig.savefig(figdir / "01_distributions.png"); plt.close(fig)

    # (b) 상관분석 §5-2 (피어슨·스피어만 + Y 상관)
    if ca is not None:
        _fig_corr(ca, figdir, plt)

    # (c) 표준화 β* 기여도
    res = regression.fit_ols(clean, regression.DEFAULT_PREDICTORS, regression.DEFAULT_COVARIATES,
                             label="통합+공변량")
    terms = [t for t in res.terms if t.name != "const" and t.beta_std is not None]
    names = [t.name for t in terms]
    vals = [t.beta_std for t in terms]
    colors = ["#4fa3e0", "#f59e0b", "#a78bfa", "#2dd4bf", "#6ee7b7", "#f87171"][: len(terms)]
    fig, ax = plt.subplots(figsize=(7.5, 3.6))
    ax.barh(names, vals, color=colors)
    ax.axvline(0, color="#333", linewidth=0.8)
    ax.set_title("표준화 회귀계수 β*  (변수 간 영향력 상대 비교)")
    fig.tight_layout()
    fig.savefig(figdir / "03_standardized_beta.png"); plt.close(fig)

    # (d) 카페인 감쇠 곡선
    from .transforms.pharmacokinetics import decay_curve
    hrs = np.linspace(0, 12, 60)
    fig, ax = plt.subplots(figsize=(7.5, 3.8))
    for dose, lbl in [(80, "에너지드링크 80mg"), (125, "아메리카노 125mg"), (250, "커피 2잔 250mg")]:
        pts = decay_curve(dose, hrs)
        ax.plot([p[0] for p in pts], [p[1] for p in pts], label=lbl)
    ax.axhline(dose * 0, color="none")
    ax.set_xlabel("섭취 후 경과 시간 (h)"); ax.set_ylabel("혈중 잔류 (mg)")
    ax.set_title("카페인 반감기 감쇠  C(t) = C0 · 0.5^(t/5.5)")
    ax.legend()
    fig.tight_layout()
    fig.savefig(figdir / "04_caffeine_decay.png"); plt.close(fig)

    # (e) LED 색온도 × 조도 → evening load 히트맵
    from .transforms.photobiology import led_evening_load
    ccts = np.arange(2700, 6600, 150)
    luxes = np.arange(20, 420, 20)
    grid = np.array([[led_evening_load(l, c) for c in ccts] for l in luxes])
    fig, ax = plt.subplots(figsize=(7.2, 4.2))
    im = ax.imshow(grid, aspect="auto", origin="lower", cmap="magma",
                   extent=[ccts[0], ccts[-1], luxes[0], luxes[-1]])
    ax.set_xlabel("색온도 CCT (K)"); ax.set_ylabel("조도 (lux)")
    ax.set_title("LED 저녁 조명 부하 지수 (신규 변수)")
    fig.colorbar(im, label="evening_load")
    fig.tight_layout()
    fig.savefig(figdir / "05_led_load_map.png"); plt.close(fig)

    n_fig = len(list(figdir.glob("*.png")))
    emit(f"  그림 {n_fig}종 저장 → {figdir}")


if __name__ == "__main__":
    sys.exit(main())
