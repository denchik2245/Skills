# Quantitative Research Analysis Logic

## Purpose

Use this reference to analyze quantitative UX/product research in a disciplined way: start from research hypotheses, calculate with correct bases, quantify uncertainty, compare only meaningful segments, and end with product decisions. Write final reports, executive summaries, methodology sections, table headers, findings, and recommendations in Russian by default, unless the user explicitly requests another language.

## Default Analysis Frame

Use this frame for each hypothesis:

| Element | Meaning |
| --- | --- |
| Hypothesis | Product/research assumption being tested. |
| Metric | Observable indicator that can support or refute the hypothesis. |
| Question(s) | Survey question(s) used for the metric. |
| Base | Respondents eligible for the calculation. |
| Calculation | Count, percent, confidence interval, scale summary, or test. |
| Evidence | What the numbers show. |
| Status | Confirmed, partly confirmed, not confirmed, or inconclusive. |
| Product implication | What to build, change, prioritize, or research next. |

## Dataset Inspection Checklist

Before calculating:

- Identify total rows, completed rows, partial rows, and duplicate or test responses.
- List sample variables: segment, tariff/plan, cohort, role, geography, tenure, usage frequency.
- Identify routing/branching: which questions were shown only to subgroups.
- Classify questions as single choice, multiple choice, scale, numeric, ranking, matrix, or open text.
- Check missing values and decide whether missing means not shown, skipped, or false.
- Preserve original question text and option labels in outputs where possible.

## Bases And Percentages

Use the most relevant denominator:

- Whole sample base: for profiling variables shown to everyone.
- Answered base: for ordinary survey questions with missing values or partial completion.
- Eligible base: for branched questions shown only to a subset.
- Option base for multiple choice: respondents with non-null values in the option block, unless export format requires a different rule.

Always show or store `n`, `count`, and `%`. In reports, say: "Percentages are calculated from respondents who answered the specific question/block because bases differ across the survey."

## Question-Type Calculations

Single choice:

- Count each answer.
- Sort by percent unless natural order matters.
- Calculate Wilson 95% CI for each share.

Multiple choice:

- Treat each option as a binary indicator.
- Count respondents selecting the option.
- Use the eligible/responded block base.
- Sort options by percent.
- Avoid summing option percentages to 100%.

Scales:

- Keep distribution by score.
- Calculate mean and median when useful.
- Use top-2-box (`4-5` on a 1-5 scale) for positive usefulness, agreement, likelihood, or difficulty.
- For negative/difficulty scales, name the direction clearly: "high difficulty: 4-5".

Numeric:

- Report median, mean, min/max, and relevant percentiles.
- Bin only when it improves interpretation.
- Inspect outliers before using averages.

Open text:

- Code themes if needed.
- Treat as qualitative illustration unless coded systematically.
- Do not use open answers as prevalence claims without a clear coded base.

## Charts And Visual Style

The chart *structure* is fixed for consistency, but the *bar color* is chosen by the user. Before rendering any charts, ask which base color or palette to use (default: green ДЗ palette). Keep the neutral roles — title, labels, gridlines, axis — constant regardless of the chosen color, so only the data bars change hue. Derive a light-to-dark ramp from the chosen base color so intensity can encode magnitude.

### Chart Selection

Single choice:

- Use horizontal bar charts for nominal answers.
- Use horizontal bars even for most compact single-choice questions; keep the report visually consistent.
- Use natural ordering only when answers have a meaningful sequence, such as frequency, time, company size, or ordered scale labels.
- Sort by descending percentage unless natural order is more important.

Multiple choice:

- Use horizontal bar charts sorted by descending percentage.
- State that the question is multiple choice when useful.
- Do not use pie charts; option percentages can exceed 100% in total.

Scales:

- For 1-5 scales, preserve the order from 1 to 5.
- Use the ДЗ-style ordered cumulative/step-like vertical distribution chart, not a generic horizontal bar chart.
- Use a top-2-box metric card or bar when the decision depends on positive intensity.
- Label direction clearly in Russian, for example: "Оценки 4-5", "Высокая сложность: 4-5".

Segment comparisons:

- Use grouped bars only for a small number of metrics or segments.
- Prefer a table for p-values and confidence intervals.
- Do not create segment charts for every available segment; visualize only meaningful hypothesis-driven differences.

Time, numeric, or binned values:

- Use histograms, ordered bars, box plots, or percentile tables depending on the data shape.
- Use median as the primary summary when distributions are skewed.

### Required Chart Labels

Every chart should include:

- Russian title that states the measured construct, not just the question number.
- `n` and base note in Russian, for example: `n=153; проценты от ответивших`.
- Percent labels on bars when the chart is used in a report or presentation.
- Clear option labels, shortened only if the full wording is available in the table/appx.

Avoid:

- unlabeled axes;
- unexplained denominators;
- chart titles like "Q4" without human-readable meaning;
- mixing counts and percentages in one axis.

### Visual Style

Fixed structure with a user-chosen bar color. Neutrals stay constant; only the data-bar hue comes from the user's choice. `scripts/build_charts.py` implements this; the spec below is the reference it follows and the fallback when you must render a chart by hand.

- Canvas: PNG, 1200px wide.
- Background: white.
- Fonts: Arial; title Arial Bold.
- Title: centered at the top, 34px, dark gray `#2A2A2A`.
- Answer labels: gray `#6F6F6F`, 22-23px, wrapped to 2 lines for long Russian labels.
- Value labels: percentages with one decimal place, dark gray `#2A2A2A`.
- Gridlines: `#E6E6E6`.
- Axis line: `#A8A8A8`.
- Do not show chart borders.
- Bar color: build a light-to-dark ramp from the user's chosen base color (primary, light end, dark accent for tables/accents).
- Default palette when the user has no preference — green ДЗ: primary `#6FBE73`, light `#CFECC6`, dark accent `#2F7D45`.

For horizontal bar charts:

- Width: `1200`.
- Left margin: about `430px` to fit long Russian answer labels.
- Right margin: about `130px`.
- Top margin: `92px`; use `118px` for compact charts with 3 or fewer rows.
- Row height: `82px`; use `96px` for compact charts.
- Bar height: `50px`.
- Bar corners: small radius, about `4px`.
- Axis: vertical zero line at the left of bars plus light vertical gridlines.
- X-axis: percent ticks at 10 p.p. intervals; use 25 p.p. ticks for compact charts when the axis is wide.
- Axis max: round the maximum percentage up to the next 10 p.p., capped at 100%.
- Bars: encode percentage magnitude with color intensity, not row position. The highest percentage/share must always be the darkest shade of the chosen color (the dark end of the ramp), and lower shares must become progressively lighter toward the light end.
- If answer order is natural and the chart is not sorted by percent, still calculate bar color from the value: the largest value is darkest even if it appears in the middle of the chart.
- For equal or nearly equal values, use the same or nearly same shade so the chart does not imply a false difference.
- Avoid strong left-to-right gradients inside each bar; if used, keep them very subtle. The main visual encoding must be the bar length and the value-based shade.
- Labels: place percent values just to the right of the bar end.

For 1-5 scale charts:

- Width/height: `1200 x 760`.
- Plot margins: left `110`, right `80`, top `100`, bottom `110`.
- Y-axis: 0-100%, with light horizontal gridlines.
- Show 0% and 100% labels on the y-axis.
- X-axis labels: numeric scores `1`, `2`, `3`, `4`, `5`.
- Draw vertical blocks in the chosen bar color in score order as cumulative distribution steps.
- Place percent labels inside blocks when there is enough height; otherwise place them just above the block.
- Add base note at the bottom left: `n=<base>; проценты от ответивших`.

Avoid:

- 3D charts;
- pie/donut charts for survey analysis unless there are exactly 2-3 mutually exclusive categories and the user asks for it;
- decorative gradients, shadows, excessive borders, pictograms, or illustration-like chart styling;
- overloading charts with p-values, CI whiskers, and long methodology notes.

### Chart-To-Table Integrity

Each chart must be traceable to a calculation table with:

- question;
- answer/option;
- base `n`;
- count;
- percent;
- confidence interval if calculated;
- small-base note if applicable.

If a chart filters, groups, or reorders values, preserve that transformation in the chart data table or explain it in a note.

## Uncertainty And Tests

For proportions:

- Prefer Wilson 95% confidence intervals.
- For segment comparisons, use a two-sided z-test for proportions with `p < 0.05`.
- Mark comparisons with base `<30` as small-base and phrase cautiously.

Do not over-test every possible segment split. Compare only when:

- It maps to a hypothesis.
- It affects product prioritization or positioning.
- The base is large enough to interpret.

Default segment comparison pattern:

1. Primary segment versus all other known segments.
2. Exclude unknown/missing segment from segment tests.
3. Report `x/n (%)`, CI if space allows, `p-value`, and interpretation.

## Hypothesis Status Rules

Confirmed:

- Direct metric supports the hypothesis, and the evidence is not contradicted by adjacent metrics.

Partly confirmed:

- The literal hypothesis is too strong or too narrow, but related demand/behavior is present.

Not confirmed:

- Direct metric does not support the assumption; call this out plainly.

Inconclusive:

- Base is too small, data is mixed, routing makes the answer ambiguous, or the metric is not a good proxy.

## Product Interpretation Pattern

Use this paragraph structure:

1. What the data says.
2. What assumption it supports or refutes.
3. What this means for product direction.
4. What limitation or follow-up remains.

Use Russian wording in deliverables. Example phrasing:

- "Прямая формулировка гипотезы не подтверждается: этот сценарий выбрали только X%. Однако смежная потребность заметна: Y% высоко оценили связанный workflow. Возможность стоит переформулировать с A на B."
- "Различие между сегментами статистически значимо, но в обеих группах спрос высокий. Это аргумент за широкий MVP с сегментным акцентом, а не за функцию только для одного сегмента."
- "Результат выглядит направленно интересным, но база мала; использовать как гипотезу для бэклога, а не как жесткое основание для приоритизации."

## Recommended Report Structure

1. Methodology
   - source, sample size, fielding context if known;
   - percentage bases;
   - confidence intervals and tests;
   - segment comparison rules;
   - small-base warning.
2. Executive summary
   - 3-6 high-signal findings;
   - include at least one non-finding if important.
3. Hypothesis table
   - hypothesis;
   - status;
   - evidence;
   - product implication.
4. Key metrics
   - metric;
   - question;
   - `n`;
   - count;
   - percent;
   - confidence interval;
   - note.
5. Sample profile
6. Detailed findings by product theme
7. Segment differences
8. Limitations
9. Recommendations / next steps

## Useful Deliverable Tables

Key metrics table:

| Hypothesis | Metric | Question | n | Count | % | 95% CI | Note |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |

Hypothesis table:

| Hypothesis | Status | Evidence | Product implication |
| --- | --- | --- | --- |

Segment test table:

| Hypothesis | Metric | Segment A | Segment B | p | Result | Note |
| --- | --- | ---: | ---: | ---: | --- | --- |

## Tone For Findings

Prefer cautious, decision-oriented Russian language:

- "поддерживает гипотезу", "не поддерживает гипотезу", "частично поддерживает";
- "указывает на", "согласуется с";
- "использовать как вход для приоритизации";
- "не трактовать как доказательство, потому что...".

Avoid:

- claiming causality from survey shares;
- over-interpreting small bases;
- saying "users need" when the data only says "users selected";
- burying product implications under raw tables.
