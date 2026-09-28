"""
calc.py — reusable statistics for quantitative survey analysis.

Why this exists: every analysis re-derives the same math (Wilson CI, two-proportion
z-test, top-2-box) and the same base logic (percent of *answered*, not of total N).
Getting the base wrong is the most common way survey reports mislead, so the logic
lives here once, correctly, instead of being retyped per project.

Import it:
    from calc import summarize_single, summarize_multi, summarize_scale, ztest_proportions

Or run a demo against a CSV to see the shape of the output:
    python calc.py path/to/survey.csv --single q1_frequency --scale q3_usefulness
"""
from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import Sequence

try:
    import pandas as pd
except ImportError:  # pragma: no cover
    pd = None

Z95 = 1.959963984540054  # z for 95% two-sided


# --------------------------------------------------------------------------- #
# Core proportions
# --------------------------------------------------------------------------- #
def wilson_ci(count: int, n: int, z: float = Z95) -> tuple[float, float]:
    """Wilson score interval for a proportion. Returns (low, high) in [0, 1].

    Preferred over the normal approximation because it behaves well for small n
    and for shares near 0% or 100%, which are common in survey options.
    """
    if n == 0:
        return (0.0, 0.0)
    p = count / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = (z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / denom
    return (max(0.0, center - half), min(1.0, center + half))


def ztest_proportions(c1: int, n1: int, c2: int, n2: int) -> dict:
    """Two-sided z-test for the difference of two independent proportions.

    Returns diff (p1 - p2), z, p_value, and a `significant` flag at p < 0.05.
    Use only when the comparison maps to a hypothesis and both bases are usable.
    """
    if n1 == 0 or n2 == 0:
        return {"diff": 0.0, "z": 0.0, "p_value": 1.0, "significant": False,
                "small_base": True}
    p1, p2 = c1 / n1, c2 / n2
    p_pool = (c1 + c2) / (n1 + n2)
    se = math.sqrt(p_pool * (1 - p_pool) * (1 / n1 + 1 / n2))
    if se == 0:
        return {"diff": p1 - p2, "z": 0.0, "p_value": 1.0, "significant": False,
                "small_base": min(n1, n2) < 30}
    z = (p1 - p2) / se
    p_value = 2 * (1 - _norm_cdf(abs(z)))
    return {
        "diff": p1 - p2, "z": z, "p_value": p_value,
        "significant": p_value < 0.05,
        "small_base": min(n1, n2) < 30,
    }


def _norm_cdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


# --------------------------------------------------------------------------- #
# Question summaries — each returns a list of dict rows (easy to DataFrame/CSV)
# --------------------------------------------------------------------------- #
@dataclass
class Row:
    answer: str
    count: int
    n: int
    pct: float
    ci_low: float
    ci_high: float
    small_base: bool = field(default=False)

    def as_dict(self) -> dict:
        d = self.__dict__.copy()
        d["small_base"] = self.n < 30
        return d


def _answered(series) -> "pd.Series":
    """Answered base: drop nulls and empty strings (skips / not-shown)."""
    s = series.dropna()
    if s.dtype == object:
        s = s[s.astype(str).str.strip() != ""]
    return s


def summarize_single(series, order: Sequence[str] | None = None,
                     sort_desc: bool = True) -> list[dict]:
    """Single choice: frequency, percent of answered base, Wilson 95% CI.

    Base = respondents who answered this question, never total N.
    Pass `order` to preserve a natural sequence (frequency, time, size); otherwise
    rows are sorted by descending percent.
    """
    s = _answered(series)
    n = len(s)
    counts = s.value_counts()
    rows = []
    for ans, cnt in counts.items():
        lo, hi = wilson_ci(int(cnt), n)
        rows.append(Row(str(ans), int(cnt), n, cnt / n, lo, hi).as_dict())
    if order:
        idx = {str(a): i for i, a in enumerate(order)}
        rows.sort(key=lambda r: idx.get(r["answer"], 1e9))
    elif sort_desc:
        rows.sort(key=lambda r: r["pct"], reverse=True)
    return rows


def summarize_multi(df, option_cols: dict[str, str], base_mask=None) -> list[dict]:
    """Multiple choice: each option is a binary indicator.

    option_cols: {column_name: human_label}. A cell counts as selected when it is
    truthy (1, True, "yes", non-empty for a checked box). base = respondents who
    saw/answered the block (all rows by default, or a boolean `base_mask`).

    Percentages are share-of-respondents and MUST NOT be presented as summing to
    100% — several options can be picked by one person.
    """
    sub = df if base_mask is None else df[base_mask]
    n = len(sub)
    rows = []
    for col, label in option_cols.items():
        selected = sub[col].apply(_is_selected).sum()
        lo, hi = wilson_ci(int(selected), n)
        rows.append(Row(label, int(selected), n, (selected / n) if n else 0.0,
                        lo, hi).as_dict())
    rows.sort(key=lambda r: r["pct"], reverse=True)
    return rows


def _is_selected(v) -> bool:
    if v is None:
        return False
    if isinstance(v, (int, float)):
        return v == 1 or v is True
    s = str(v).strip().lower()
    return s in {"1", "true", "yes", "да", "y", "x", "✓"}


def summarize_scale(series, lo: int = 1, hi: int = 5,
                    top_box: int = 2) -> dict:
    """Scales (default 1-5): distribution, mean, median, and top-box share.

    top-2-box (scores 4-5 on a 1-5 scale) is the decision-relevant metric when the
    product choice depends on positive intensity. Returns a CI on the top-box share
    so you know how solid it is.
    """
    s = pd.to_numeric(_answered(series), errors="coerce").dropna()
    n = len(s)
    dist = []
    for score in range(lo, hi + 1):
        cnt = int((s == score).sum())
        dist.append({"score": score, "count": cnt, "n": n,
                     "pct": (cnt / n) if n else 0.0})
    top_scores = range(hi - top_box + 1, hi + 1)
    top_count = int(s.isin(list(top_scores)).sum())
    tb_lo, tb_hi = wilson_ci(top_count, n)
    return {
        "n": n,
        "mean": round(float(s.mean()), 3) if n else None,
        "median": float(s.median()) if n else None,
        "distribution": dist,
        f"top{top_box}box_count": top_count,
        f"top{top_box}box_pct": (top_count / n) if n else 0.0,
        f"top{top_box}box_ci": (tb_lo, tb_hi),
        "small_base": n < 30,
    }


# --------------------------------------------------------------------------- #
# Demo CLI
# --------------------------------------------------------------------------- #
def _demo():  # pragma: no cover
    import argparse, json
    ap = argparse.ArgumentParser(description="Demo of calc.py summaries on a CSV.")
    ap.add_argument("csv")
    ap.add_argument("--single", action="append", default=[])
    ap.add_argument("--scale", action="append", default=[])
    ap.add_argument("--multi", nargs="+", default=[],
                    help="columns forming one multiple-choice block")
    args = ap.parse_args()
    df = pd.read_csv(args.csv)
    out = {}
    for c in args.single:
        out[c] = summarize_single(df[c])
    for c in args.scale:
        out[c] = summarize_scale(df[c])
    if args.multi:
        out["multi"] = summarize_multi(df, {c: c for c in args.multi})
    print(json.dumps(out, ensure_ascii=False, indent=2, default=float))


if __name__ == "__main__":  # pragma: no cover
    _demo()
