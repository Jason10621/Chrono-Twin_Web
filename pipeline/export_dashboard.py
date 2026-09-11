"""
대시보드용 JSON 내보내기
========================
파이프라인을 돌려 대시보드(dashboard/index.html)가 읽을 요약 JSON 을 만든다.

    python -m pipeline.export_dashboard [--subjects 40] [--days 14] [--out PATH]

기본 출력: dashboard/mock_data.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from . import correlation, dummy_data, regression
from .etl import run_etl
from .outliers import ANALYSIS_OUTLIER_COLS, remove_outliers
from .transforms.pharmacokinetics import decay_curve
from .transforms.photobiology import assess_lighting, led_evening_load, mel_der


def _round(o, n=3):
    if isinstance(o, dict):
        return {k: _round(v, n) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_round(v, n) for v in o]
    if isinstance(o, (float, np.floating)):
        return round(float(o), n)
    if isinstance(o, (np.integer,)):
        return int(o)
    return o


def build(subjects: int, days: int, seed: int) -> dict:
    ds = dummy_data.generate(subjects, days, seed=seed)
    res = run_etl(ds.responses, ds.profiles)
    clean, scan = remove_outliers(res.analysis, ANALYSIS_OUTLIER_COLS)

    models = regression.compare_models(clean)
    fe = regression.fit_within(clean, regression.DEFAULT_PREDICTORS, regression.DEFAULT_COVARIATES)
    models["피험자 고정효과(within)"] = fe

    # §5-2 상관분석 — VIF 는 통합+공변량 모형에서 가져와 교차참조
    vif_lookup = {t.name: t.vif for t in models["통합+공변량"].terms if t.vif}
    corr_analysis = correlation.correlation_analysis(
        clean, regression.TARGET, regression.DEFAULT_PREDICTORS, regression.DEFAULT_COVARIATES,
        vif_lookup=vif_lookup,
    )

    def model_json(r: regression.RegressionResult) -> dict:
        return {
            "label": r.model_label, "n": r.n_obs, "r2": r.r2, "r2_adj": r.r2_adj,
            "f": r.f_stat, "f_p": r.f_pvalue,
            "terms": [
                {"name": t.name, "beta": t.beta, "se": t.se, "t": t.t, "p": t.p,
                 "beta_std": t.beta_std, "vif": t.vif, "sig": t.significant}
                for t in r.terms
            ],
            "notes": r.notes,
        }

    # 분포 히스토그램 (대시보드에서 막대로)
    def hist(col: str, bins: int = 22) -> dict:
        v = clean[col].dropna().to_numpy()
        counts, edges = np.histogram(v, bins=bins)
        return {"counts": counts.tolist(),
                "edges": [round(float(e), 1) for e in edges],
                "mean": float(np.mean(v)), "sd": float(np.std(v, ddof=1))}


    # LED CCT×lux 부하 그리드
    ccts = list(range(2700, 6700, 200))
    luxes = list(range(20, 420, 40))
    led_grid = [[round(led_evening_load(l, c), 3) for c in ccts] for l in luxes]

    msfsc = res.msfsc.copy()
    msfsc_rows = msfsc.sort_values("msfsc_min").to_dict(orient="records") if not msfsc.empty else []

    # 크로노타입 분포
    prof_df = dummy_data.profiles_to_dataframe(ds)
    chrono_dist = prof_df["chronotype"].value_counts().to_dict()

    # 파생 피처 정확도 (파이프라인 자체검증)
    truth = dummy_data.truth_to_dataframe(ds)
    merged = clean.merge(truth, on=["subject_id", "survey_date"], how="inner")
    feat_acc = {}
    for calc, tru in [("bluelight_adj_min", "bl_adj_true"),
                      ("caffeine_residue_mg", "caf_residue_true"),
                      ("sleep_debt_min", "sleep_debt_true"),
                      ("led_evening_load", "led_load_true")]:
        feat_acc[calc] = {"r": float(merged[calc].corr(merged[tru])),
                          "mae": float((merged[calc] - merged[tru]).abs().mean())}

    lit_examples = [
        assess_lighting(40, 2700), assess_lighting(150, 4000),
        assess_lighting(300, 5000), assess_lighting(420, 6500),
    ]

    return _round({
        "meta": {
            "generated_from": "pipeline.export_dashboard",
            "is_mock": True,
            "subjects": subjects, "days": days, "seed": seed,
            "schema_version": "0.2.0",
            "ground_truth": ds.ground_truth,
            "injected_defects": ds.injected_defects,
        },
        "etl": {
            "n_raw": res.report.n_raw,
            "n_parsed": res.report.n_parsed,
            "n_quarantined": res.report.n_quarantined,
            "parse_errors": res.report.parse_errors,
            "imputed": res.report.imputed,
            "steps": res.report.steps,
        },
        "outliers": {
            "threshold": 3.0,
            "n_outlier_rows": scan.n_outlier_rows,
            "n_clean_rows": len(clean),
            "columns": {
                col: {"mu": rep.mu, "sigma": rep.sigma,
                      "n_hard": rep.n_hard_range, "n_z": rep.n_zscore,
                      "detail": rep.detail[:8]}
                for col, rep in scan.column_reports.items()
            },
        },
        "models": {k: model_json(v) for k, v in models.items()},
        "h4": regression.h4_verdict(models),
        "feature_accuracy": feat_acc,
        "distributions": {c: hist(c) for c in
                          ["phase_delay_min", "bluelight_adj_min",
                           "caffeine_residue_mg", "sleep_debt_min", "led_evening_load"]},
        "correlation": corr_analysis.to_dict(),
        "caffeine_decay": {
            "hours": [round(h, 2) for h in np.linspace(0, 12, 40).tolist()],
            "series": {
                "에너지드링크 80mg": [p[1] for p in decay_curve(80, np.linspace(0, 12, 40))],
                "아메리카노 125mg": [p[1] for p in decay_curve(125, np.linspace(0, 12, 40))],
                "커피 2잔 250mg": [p[1] for p in decay_curve(250, np.linspace(0, 12, 40))],
            },
        },
        "led": {
            "ccts": ccts, "luxes": luxes, "grid": led_grid,
            "mel_der_curve": [{"cct": c, "mel_der": mel_der(c)} for c in range(2700, 6700, 250)],
            "assessments": [
                {"led_lux": a.led_lux, "cct": a.color_temp_k, "melanopic_lux": a.melanopic_lux,
                 "evening_load": a.evening_load, "verdict": a.verdict, "rec": a.recommendation}
                for a in lit_examples
            ],
        },
        "msfsc": msfsc_rows,
        "chronotype_distribution": chrono_dist,
        "schema_fields": [
            {"field": "subject_id", "type": "string(uuid)", "source": "시스템", "since": "0.1"},
            {"field": "survey_date", "type": "date", "source": "설문", "since": "0.1"},
            {"field": "day_type", "type": "enum(work|free)", "source": "설문·달력", "since": "0.1"},
            {"field": "sleep_onset", "type": "timestamp", "source": "오픈 API/설문", "since": "0.1"},
            {"field": "sleep_wake", "type": "timestamp", "source": "오픈 API/설문", "since": "0.1"},
            {"field": "caffeine_intake", "type": "float(mg)", "source": "약학 파트", "since": "0.1"},
            {"field": "bluelight_duration", "type": "int(min)", "source": "생명공학 파트", "since": "0.1"},
            {"field": "led_lux", "type": "float(lux)", "source": "정책 파트(HCL)", "since": "0.2"},
            {"field": "led_color_temp", "type": "int(K)", "source": "생명공학 파트", "since": "0.2"},
            {"field": "brain_peak_score", "type": "float(0~24)", "source": "뇌과학 파트", "since": "0.1"},
            {"field": "exercised", "type": "bool", "source": "설문(보조)", "since": "0.1"},
        ],
    })


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--subjects", type=int, default=40)
    ap.add_argument("--days", type=int, default=14)
    ap.add_argument("--seed", type=int, default=20260904)
    ap.add_argument("--out", type=Path,
                    default=Path(__file__).parents[1] / "dashboard" / "mock_data.json")
    args = ap.parse_args(argv)
    data = build(args.subjects, args.days, args.seed)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {args.out}  ({args.out.stat().st_size/1024:.1f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
