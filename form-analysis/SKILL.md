---
name: form-analysis
description: Analyze and visualize quantitative UX/product research data from surveys, spreadsheets, CSV/XLSX exports, or prepared analysis artifacts. Use when Codex needs to calculate or explain survey results, validate hypotheses, compare segments, handle single choice / multiple choice / scale questions, produce methodology notes, executive summaries, research reports, product implications, or reusable analysis plans for quantitative studies.
---

# Analyze Quant Data

## Overview

Use this skill to turn quantitative research data into hypothesis-level findings and product decisions. Prefer a structured analysis that separates raw descriptive statistics from evidence, interpretation, limitations, and recommendations. Write reports, findings, methodology notes, table labels, and recommendations in Russian by default, unless the user explicitly requests another language.

## Bundled Scripts

Prefer these bundled scripts over re-writing statistics or chart code by hand. They encode the correct base logic and the house visual style once, so every researcher gets identical, correct output instead of a slightly different reinvention each time. Install deps if needed: `pip install pandas matplotlib openpyxl --break-system-packages`.

- `scripts/intake.py` — inspect and normalize a messy export before analysis. Run `python scripts/intake.py export.csv` for a report of column types, missing values, junk rows, and multi-select cells that need splitting. Import `split_multiselect`, `flag_junk`, `detect_types` for transforms.
- `scripts/calc.py` — the math: `summarize_single`, `summarize_multi`, `summarize_scale` (correct answered/eligible bases, Wilson 95% CI, top-2-box), plus `ztest_proportions` for segment comparison. Import these rather than hand-coding percentages.
- `scripts/build_charts.py` — the charts: `hbar_chart` and `scale_step_chart` render the fixed structure with a value-based color ramp from any base color (`base_color="#6FBE73"` default green, or a name from `PALETTES`). Neutrals stay constant; the highest share is always the darkest shade.

Read a script's docstring before using it. If a task needs something the scripts do not cover, extend them rather than forking a one-off copy.

## Core Workflow

1. Identify the research objective, target audience, survey logic, source files, and expected deliverable.
2. Inspect and normalize the dataset before calculating: columns, question text, answer formats, missing values, branching, segments, completion status, and open-text fields. Real exports (Google Forms, Typeform, Тестограф, SurveyMonkey) are rarely analysis-ready — multi-select answers often sit combined in one comma-separated cell, "Другое" arrives as free text, scales come through as strings, and blank/duplicate/test rows inflate the base. Run `scripts/intake.py` first; split combined multi-select cells into clean binary columns and decide what each missing value means (not shown vs skipped vs false) before any percentage is computed.
3. Define the analysis frame as `hypothesis -> metric -> question(s) -> base -> calculation -> interpretation -> product implication`.
4. Calculate each question using the correct base: percentages must usually be from respondents who answered that question, not from the total sample, unless the user explicitly asks otherwise.
5. Treat question types differently:
   - Single choice: answer frequencies, counts, percentages, confidence intervals.
   - Multiple choice: percentage selecting each option among respondents shown/answering the block.
   - Scales: distribution, mean/median when helpful, and top-box or top-2-box when tied to decisions.
   - Numeric fields: distribution, median, mean, outliers, bins if useful.
   - Open text: thematic signals only; do not present as statistically representative unless coded with a clear base.
6. Add uncertainty and guardrails: confidence intervals for shares, small-base flags, and explicit notes where routing or incomplete responses affect interpretation.
7. Compare segments only when comparison answers the research question. Avoid decorative cuts.
8. Build charts only after calculations are correct; every chart must preserve the same base, sorting, and interpretation rules as the table behind it.
9. Convert results into statuses such as `confirmed`, `partly confirmed`, `not confirmed`, or `inconclusive`; explain the evidence and the product implication.
10. Deliver findings in Russian in the order: methodology, sample, hypothesis table, key metrics, segment differences, interpretation, limitations, recommendations.

## Statistical Defaults

Use these defaults unless the user or local methodology says otherwise:

- Percentages: `count / answered_n` for the specific question or block.
- Confidence intervals for proportions: Wilson 95%.
- Segment comparison for proportions: two-sided z-test, `p < 0.05`.
- Small base warning: flag `n < 30`; still calculate, but phrase conclusions cautiously.
- Scales: use top-2-box for 1-5 usefulness, difficulty, agreement, or likelihood scales when the product decision depends on positive intensity.
- Branching: preserve different bases per block; never silently force all results to total `N`.

## Representativeness

Correct math on a skewed sample still misleads, so check who is actually in the data before trusting any share. State the sample composition against the target audience: if one segment, plan, geography, or recruitment channel dominates (for example 80% of respondents from a single cohort), say so up front and treat headline numbers as that group's view, not the whole population's. When quotas or weights are available, apply and describe them; when they are not, name the skew as a limitation rather than presenting shares as population-level truth. This is especially important before segment cuts — a comparison is only interpretable if each segment is large enough and not a self-selected sliver.

## Interpretation Rules

- Do not equate a high percentage with a product recommendation automatically. Ask what behavior, pain, risk, or demand it evidences.
- Separate direct confirmation from adjacent opportunity. Example: if a specific behavior is rare but a related need is strong, mark the original hypothesis as partly/not confirmed and reframe the opportunity.
- Make product implications specific: feature direction, MVP scope, prioritization, positioning, or next research.
- When evidence is mixed, preserve the tension instead of smoothing it away.
- Mention meaningful non-findings, especially when a popular assumption is not supported.

## Charts And Visual Style

The visual *structure* below is fixed so every report looks consistent, but the *color* is the user's choice. The reason for the split: the layout rules (base notes, sorting, value-based intensity) protect the integrity of the data, while color is a branding/taste decision that changes per project or team.

### Ask for the chart color first

Before building any charts, ask the user which base color or palette they want, and only then start rendering. Do this every time you are about to produce charts, even if a default exists — a quick confirmation avoids redoing a full set of PNGs in the wrong color. Phrase it simply, for example: "Какой основной цвет для графиков использовать? По умолчанию — зелёный (палитра ДЗ)."

Once you have a base color:

- Derive a light-to-dark ramp from it so intensity can encode magnitude (see the intensity rule below). Keep the neutral roles — title, labels, gridlines, axis — constant regardless of the chosen color, so only the data bars change hue.
- If the user has no preference or says "любой"/"как обычно", fall back to the default green ДЗ palette: `#6FBE73` (primary), `#CFECC6` (light end), `#2F7D45` (dark accent), with neutrals `#2A2A2A` (title/values), `#6F6F6F` (labels), `#E6E6E6` (gridlines), `#A8A8A8` (axis).

### Fixed structural rules (color-independent)

- Use charts to clarify findings, not to decorate the report.
- Use 1200px-wide PNG charts on a white background with Arial fonts, dark gray title text, gray answer labels, and light gray gridlines. Bars use the user's chosen color.
- For single choice and multiple choice questions, use horizontal bar charts sorted by descending percent unless the answers have a natural order.
- Encode bar color intensity by percentage/share, not by row position: the answer with the highest percent must always have the darkest shade of the chosen color, and lower shares should be progressively lighter toward the light end of the ramp.
- For 1-5 scales, use an ordered cumulative/step-like vertical distribution chart; keep score order from 1 to 5.
- Always show `n` and explain the base in Russian, for example: `n=116; проценты от ответивших`.
- For multiple choice, never imply that percentages sum to 100%.
- Keep confidence intervals and p-values in tables or appendix unless the user explicitly asks to show them on charts.

`scripts/build_charts.py` already implements all of the above (canvas size, neutrals, sorting, value-based intensity, base note); pass it the chosen `base_color` rather than re-styling charts by hand.

## Outputs

Choose the smallest useful output for the user's request:

- Brief logic summary: concise bullets explaining the analysis method.
- Analysis plan: hypotheses, metrics, bases, comparisons, and outputs before calculation.
- Full analysis: tables/charts plus narrative findings.
- Report section: methodology, executive summary, hypothesis statuses, limitations.
- Reusable template: calculation checklist or script outline for future studies.

Match the depth to the reader. A researcher wants full methodology, bases, and CIs; a product manager wants the executive summary, hypothesis statuses, and the "so what" without the statistical apparatus. When unsure who the deliverable is for, ask.

## Handoff To Final Format

This skill produces the analysis and charts; deliver them in the format the audience actually consumes rather than stopping at loose PNGs and tables.

- Confluence report → use the `quantitative-confluence-report` skill; it expects the finished metrics, statuses, and charts this skill produces.
- Slide deck for stakeholders/PMs → use the `pptx` skill, leading with the executive summary and hypothesis table.
- Word document → use the `docx` skill for a formal written report.

Finish the analysis here first, then pass the researched numbers and charts into the format skill — do not restate raw calculations inside the format step.

## Reference

For detailed phrasing patterns, metric definitions, chart rules, visual style, and report structure, read `references/analysis-logic.md` when the task asks for a full analysis, visualizations, a methodology section, a research report, or a reusable template.
