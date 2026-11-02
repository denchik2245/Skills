"""
build_charts.py — reusable chart renderer for survey reports.

Two things are kept fixed so every report reads consistently: the *structure*
(1200px, white canvas, Arial, sorted horizontal bars, base note in Russian) and the
*neutral roles* (title, labels, gridlines, axis). The one thing that changes is the
*bar color*, which the user picks. Intensity encodes magnitude — the largest share is
always the darkest shade — so a reader can rank answers by depth of color, not by row
position.

Usage:
    from build_charts import hbar_chart, scale_step_chart, PALETTES

    hbar_chart(
        labels=["Интерфейс", "Цена", "Доверие"],
        pcts=[0.667, 0.367, 0.267],
        out_path="chart_barriers.png",
        title="Барьеры использования",
        n=120, base_note="n=120; можно выбрать несколько вариантов",
        base_color="#6FBE73",          # default green ДЗ; pass any hex to rebrand
    )

If the user gives a color name instead of a hex, map it via PALETTES (blue, green,
etc.) or pass your own hex.
"""
from __future__ import annotations
import colorsys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

# Fixed neutral roles — never change with the chosen color.
TITLE = "#2A2A2A"
LABEL = "#6F6F6F"
GRID = "#E6E6E6"
AXIS = "#A8A8A8"

# Convenience base colors. Default is green ДЗ; add your brand hex freely.
PALETTES = {
    "green": "#6FBE73",
    "blue": "#2F6FBE",
    "violet": "#7C5CBF",
    "teal": "#2FA8A8",
    "orange": "#E08A2F",
    "gray": "#6F6F6F",
}

# Prefer Arial to match the house style; fall back to fonts that ship on Linux/mac
# and cover Cyrillic, so charts render identically whether or not Arial is installed.
import logging
logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)
plt.rcParams["font.family"] = "sans-serif"
plt.rcParams["font.sans-serif"] = [
    "Arial", "Liberation Sans", "DejaVu Sans", "Helvetica", "sans-serif",
]


# --------------------------------------------------------------------------- #
# Color ramp
# --------------------------------------------------------------------------- #
def _hex_to_rgb(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def _rgb_to_hex(rgb) -> str:
    return "#" + "".join(f"{int(round(c * 255)):02X}" for c in rgb)


def _blend(rgb, target, t):
    return tuple(rgb[i] * (1 - t) + target[i] * t for i in range(3))


def make_ramp(base_hex: str) -> tuple[str, str]:
    """Derive (light_end, dark_end) from a single base color.

    Light end blends toward white; dark end deepens by lowering lightness in HLS.
    Works for any base hue, so rebranding is just swapping the base color.
    """
    rgb = _hex_to_rgb(base_hex)
    light = _blend(rgb, (1, 1, 1), 0.62)
    h, l, s = colorsys.rgb_to_hls(*rgb)
    dark = colorsys.hls_to_rgb(h, max(0.0, l * 0.62), min(1.0, s * 1.05))
    return _rgb_to_hex(light), _rgb_to_hex(dark)


def value_colors(values, base_hex: str) -> list[str]:
    """One color per bar: highest value -> darkest, lowest -> lightest.

    Shade is driven by the value itself (relative to the max), NOT by order, so a
    naturally-ordered chart still shows the biggest bar as the darkest.
    """
    light, dark = make_ramp(base_hex)
    lrgb, drgb = _hex_to_rgb(light), _hex_to_rgb(dark)
    vmax = max(values) if values else 1
    out = []
    for v in values:
        t = (v / vmax) if vmax else 0.0
        out.append(_rgb_to_hex(_blend(lrgb, drgb, t)))
    return out


# --------------------------------------------------------------------------- #
# Charts
# --------------------------------------------------------------------------- #
def hbar_chart(labels, pcts, out_path, title, n, base_note,
               base_color: str = "#6FBE73", natural_order: bool = False,
               dpi: int = 100) -> str:
    """Horizontal bar chart, percent labels, value-based color intensity.

    By default bars are sorted by descending percent. Set natural_order=True to keep
    the incoming order (frequency, time, company size) — color still encodes value.
    """
    base_color = PALETTES.get(base_color, base_color)
    pairs = list(zip(labels, pcts))
    if not natural_order:
        pairs.sort(key=lambda p: p[1], reverse=True)
    labels = [p[0] for p in pairs]
    pcts = [p[1] for p in pairs]
    colors = value_colors(pcts, base_color)

    rows = len(labels)
    fig_h = max(2.6, 0.92 * rows + 1.7)
    fig, ax = plt.subplots(figsize=(12, fig_h), dpi=dpi)
    y = range(rows)
    ax.barh(list(y), [p * 100 for p in pcts], color=colors,
            height=0.62, zorder=3)
    ax.set_yticks(list(y))
    ax.set_yticklabels([_wrap(l) for l in labels], fontsize=13, color=LABEL)
    ax.invert_yaxis()

    xmax = min(100, (int(max(pcts) * 100) // 10 + 1) * 10)
    ax.set_xlim(0, xmax)
    ax.set_xticks(range(0, xmax + 1, 10))
    ax.set_xticklabels([f"{t}%" for t in range(0, xmax + 1, 10)],
                       fontsize=11, color=LABEL)
    ax.xaxis.grid(True, color=GRID, zorder=0)
    for spine in ("top", "right", "left"):
        ax.spines[spine].set_visible(False)
    ax.spines["bottom"].set_color(AXIS)
    ax.tick_params(length=0)

    for yi, p in zip(y, pcts):
        ax.text(p * 100 + xmax * 0.012, yi, f"{p*100:.1f}%",
                va="center", ha="left", fontsize=12, color=TITLE)

    ax.set_title(title, fontsize=17, color=TITLE, fontweight="bold",
                 pad=16, loc="center")
    fig.text(0.5, 0.015, base_note, ha="center", fontsize=10, color=LABEL)
    fig.subplots_adjust(left=0.30, right=0.90, top=0.86, bottom=0.12)
    fig.savefig(out_path, facecolor="white")
    plt.close(fig)
    return out_path


def scale_step_chart(distribution, out_path, title, n, base_note,
                     base_color: str = "#6FBE73", dpi: int = 100) -> str:
    """1-5 scale as an ordered vertical distribution (score 1..5, left to right).

    distribution: list of {"score": int, "pct": float}. Blocks keep score order;
    color intensity encodes each score's share.
    """
    base_color = PALETTES.get(base_color, base_color)
    distribution = sorted(distribution, key=lambda d: d["score"])
    scores = [d["score"] for d in distribution]
    pcts = [d["pct"] for d in distribution]
    colors = value_colors(pcts, base_color)

    fig, ax = plt.subplots(figsize=(12, 7.6), dpi=dpi)
    ax.bar(range(len(scores)), [p * 100 for p in pcts], color=colors,
           width=0.72, zorder=3)
    ax.set_xticks(range(len(scores)))
    ax.set_xticklabels([str(s) for s in scores], fontsize=13, color=LABEL)
    ax.set_ylim(0, 100)
    ax.set_yticks(range(0, 101, 20))
    ax.set_yticklabels([f"{t}%" for t in range(0, 101, 20)],
                       fontsize=11, color=LABEL)
    ax.yaxis.grid(True, color=GRID, zorder=0)
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    ax.spines["left"].set_color(AXIS)
    ax.spines["bottom"].set_color(AXIS)
    ax.tick_params(length=0)
    for xi, p in zip(range(len(scores)), pcts):
        ax.text(xi, p * 100 + 1.5, f"{p*100:.1f}%", ha="center",
                fontsize=12, color=TITLE)
    ax.set_title(title, fontsize=17, color=TITLE, fontweight="bold", pad=16)
    fig.text(0.12, 0.02, base_note, ha="left", fontsize=10, color=LABEL)
    fig.subplots_adjust(left=0.10, right=0.94, top=0.88, bottom=0.12)
    fig.savefig(out_path, facecolor="white")
    plt.close(fig)
    return out_path


def _wrap(label: str, width: int = 28) -> str:
    if len(label) <= width:
        return label
    words, lines, cur = label.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width and cur:
            lines.append(cur); cur = w
        else:
            cur = f"{cur} {w}".strip()
    lines.append(cur)
    return "\n".join(lines[:2])


if __name__ == "__main__":  # pragma: no cover
    hbar_chart(["Интерфейс", "Цена", "Доверие"], [0.667, 0.367, 0.267],
               "demo_bar.png", "Барьеры использования", 120,
               "n=120; можно выбрать несколько вариантов")
    print("wrote demo_bar.png")
