"""
intake.py — inspect and normalize a messy survey export before analysis.

Real exports (Google Forms, Typeform, Тестограф, SurveyMonkey, Яндекс Взгляд) rarely
arrive analysis-ready: multi-select answers are crammed into one comma-separated cell,
"Другое" sits as free text, scales come through as strings, and there are junk rows
(blank, duplicate, test submissions). Running analysis on that silently produces wrong
bases. This module surfaces those problems and offers safe transforms — it never
changes data without you asking; it reports first.

Usage:
    python intake.py path/to/export.csv          # print an intake report
    # or import for use in a script:
    from intake import load, detect_types, split_multiselect, flag_junk
"""
from __future__ import annotations
import sys
from collections import Counter

try:
    import pandas as pd
except ImportError:  # pragma: no cover
    pd = None

TRUEY = {"1", "true", "yes", "да", "y", "x", "✓", "checked"}
MULTI_SEPARATORS = [";", ",", "|", "\n"]


def load(path: str):
    """Load csv/tsv/xlsx into a DataFrame, keeping values as-is for inspection."""
    low = path.lower()
    if low.endswith((".xlsx", ".xls")):
        return pd.read_excel(path, dtype=object)
    sep = "\t" if low.endswith(".tsv") else ","
    return pd.read_csv(path, dtype=object, sep=sep, keep_default_na=True)


def detect_types(df) -> dict[str, str]:
    """Heuristic guess of each column's question type.

    Returns col -> one of: id, numeric, scale, single, multi, open_text, empty.
    Heuristics are conservative; always eyeball the report and correct as needed.
    """
    out = {}
    for col in df.columns:
        s = df[col].dropna().astype(str).str.strip()
        s = s[s != ""]
        out[col] = _guess(col, s)
    return out


def _guess(col: str, s) -> str:
    name = str(col).lower()
    if s.empty:
        return "empty"
    if any(k in name for k in ("id", "respondent", "timestamp", "время", "email")):
        return "id"
    nunique = s.nunique()
    # looks like a multi-select cell: many rows contain a separator token
    for sep in MULTI_SEPARATORS:
        share_with_sep = (s.str.contains(rf"\s*{_esc(sep)}\s*", regex=True)).mean()
        if sep != "," and share_with_sep > 0.15:
            return "multi"
        if sep == "," and share_with_sep > 0.30 and s.str.len().mean() > 15:
            return "multi"
    # numeric / scale
    nums = pd.to_numeric(s, errors="coerce").dropna()
    if len(nums) / len(s) > 0.9:
        lo, hi = nums.min(), nums.max()
        if hi - lo <= 10 and nunique <= 11:
            return "scale"
        return "numeric"
    # short closed set -> single; long free text -> open
    if nunique <= max(12, int(len(s) * 0.2)) and s.str.len().mean() < 40:
        return "single"
    return "open_text"


def _esc(sep: str) -> str:
    return {"|": r"\|", "\n": r"\n"}.get(sep, sep)


def suggest_separator(series) -> str | None:
    """Pick the most likely delimiter inside a multi-select column."""
    s = series.dropna().astype(str)
    best, best_share = None, 0.0
    for sep in MULTI_SEPARATORS:
        share = s.str.contains(rf"{_esc(sep)}", regex=True).mean()
        if share > best_share:
            best, best_share = sep, share
    return best if best_share > 0.1 else None


def split_multiselect(series, sep: str | None = None, prefix: str = "opt"):
    """Explode a combined multi-select cell into one binary column per option.

    Returns a DataFrame aligned to the input index. This is the transform that keeps
    multiple-choice bases correct — after splitting, each option is a clean 0/1.
    """
    sep = sep or suggest_separator(series) or ","
    s = series.fillna("").astype(str)
    options = Counter()
    parsed = []
    for cell in s:
        parts = [p.strip() for p in cell.split(sep) if p.strip()]
        parsed.append(parts)
        options.update(parts)
    cols = {}
    for opt, _ in options.most_common():
        safe = opt[:40]
        cols[f"{prefix}_{safe}"] = [1 if opt in parts else 0 for parts in parsed]
    return pd.DataFrame(cols, index=series.index)


def flag_junk(df, id_col: str | None = None) -> dict:
    """Report rows that usually should be dropped or reviewed, without dropping them."""
    n = len(df)
    all_blank = df.apply(lambda r: all(
        (str(v).strip() == "" or pd.isna(v)) for v in r), axis=1)
    dup = df.duplicated(keep="first")
    dup_id = None
    if id_col and id_col in df.columns:
        dup_id = df[id_col].duplicated(keep=False)
    return {
        "total_rows": n,
        "blank_rows": int(all_blank.sum()),
        "duplicate_rows": int(dup.sum()),
        "duplicate_ids": int(dup_id.sum()) if dup_id is not None else None,
    }


def report(path: str) -> None:
    """Print a human-readable intake report."""
    df = load(path)
    types = detect_types(df)
    junk = flag_junk(df)
    print(f"\n=== INTAKE REPORT: {path} ===")
    print(f"rows: {junk['total_rows']} | blank: {junk['blank_rows']} | "
          f"duplicate rows: {junk['duplicate_rows']}")
    print("\ncolumn types (heuristic — verify!):")
    for col, t in types.items():
        note = ""
        if t == "multi":
            sep = suggest_separator(df[col])
            note = f"  (separator looks like '{sep}'; run split_multiselect)"
        miss = df[col].isna().mean()
        miss_note = f"  missing={miss*100:.0f}%" if miss > 0.02 else ""
        print(f"  - {col}: {t}{note}{miss_note}")
    print("\nreminders:")
    print("  * percentages go over the ANSWERED base, not total rows;")
    print("  * multi-select shares do not sum to 100%;")
    print("  * a scale column shown only to a subgroup keeps its own (smaller) base;")
    print("  * check representativeness before trusting segment cuts (see SKILL.md).")


if __name__ == "__main__":  # pragma: no cover
    if len(sys.argv) < 2:
        print("usage: python intake.py <export.csv|.xlsx>")
        sys.exit(1)
    report(sys.argv[1])
