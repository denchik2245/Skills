// Вставь в use_figma и вызови: return await extractSection(figma, 'SECTION_ID');
// Только чтение. Возвращает дерево секции с координатами от левого верхнего угла секции,
// разрешёнными цветами (переменные уже подставлены), текстом по диапазонам, SVG иконок
// и списком картинок, которые нужно забрать через download_assets.
// Результат сохрани в файл как есть: его читает scripts/to-zero.mjs.
async function extractSection(figma, rootId, opts = {}) {
  const maxSvg = opts.maxSvg || 15000;
  const root = await figma.getNodeByIdAsync(rootId);
  if (!root || !('absoluteTransform' in root) || !('children' in root)) {
    throw new Error('Нужен ID фрейма секции, не страницы и не отдельного слоя.');
  }
  const [[, , rx], [, , ry]] = root.absoluteTransform;
  const warnings = [];
  const images = [];
  const styleNames = new Map();
  const r2 = v => Math.round(v * 100) / 100;
  const ch = v => Math.round(v * 255);
  const warn = (node, code, extra = {}) => warnings.push({ code, id: node.id, name: node.name, ...extra });
  const VECTOR_TYPES = ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON'];

  function color(c, opacity = 1) {
    const a = Math.round((c.a === undefined ? 1 : c.a) * opacity * 1000) / 1000;
    if (a >= 1) return '#' + [c.r, c.g, c.b].map(v => ch(v).toString(16).padStart(2, '0')).join('');
    return `rgba(${ch(c.r)},${ch(c.g)},${ch(c.b)},${a})`;
  }
  function box(node) {
    const [[a, b, tx], [c, d, ty]] = node.absoluteTransform;
    const w = node.width, h = node.height;
    const cx = a * w / 2 + b * h / 2 + tx, cy = c * w / 2 + d * h / 2 + ty;
    // Невращённый прямоугольник вокруг того же центра: так Tilda применяет rotate.
    return { x: r2(cx - w / 2 - rx), y: r2(cy - h / 2 - ry), w: r2(w), h: r2(h), rotation: r2(node.rotation || 0) };
  }
  function gradient(paint, w, h) {
    const [[a, b, e], [c, d, f]] = paint.gradientTransform;
    const det = a * d - b * c;
    if (!det) return null;
    const inv = p => {
      const x = p[0] - e, y = p[1] - f;
      return [(d * x - b * y) / det * w, (-c * x + a * y) / det * h];
    };
    const stops = paint.gradientStops.map(s => ({ color: color(s.color, paint.opacity === undefined ? 1 : paint.opacity), pos: s.position }));
    if (paint.type === 'GRADIENT_LINEAR') {
      const p0 = inv([0, 0.5]), p1 = inv([1, 0.5]);
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
      const angle = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
      const rad = angle * Math.PI / 180, ux = Math.sin(rad), uy = -Math.cos(rad);
      const len = Math.abs(w * ux) + Math.abs(h * uy);
      const at = s => {
        const px = p0[0] + dx * s - w / 2, py = p0[1] + dy * s - h / 2;
        return Math.round(((px * ux + py * uy) / len + 0.5) * 1000) / 10;
      };
      return `linear-gradient(${Math.round(angle)}deg,` + stops.map(s => `${s.color} ${at(s.pos)}%`).join(',') + ')';
    }
    return 'radial-gradient(circle at center,' + stops.map(s => `${s.color} ${Math.round(s.pos * 1000) / 10}%`).join(',') + ')';
  }
  const varNames = new Map();
  async function varName(p) {
    const id = p.boundVariables && p.boundVariables.color && p.boundVariables.color.id;
    if (!id) return null;
    if (!varNames.has(id)) {
      const v = await figma.variables.getVariableByIdAsync(id);
      varNames.set(id, v ? v.name : null);
    }
    return varNames.get(id);
  }
  async function paints(node, list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const p of list) {
      if (p.visible === false) continue;
      if (p.type === 'SOLID') out.push({ type: 'solid', color: color(p.color, p.opacity === undefined ? 1 : p.opacity), variable: await varName(p) });
      else if (p.type.startsWith('GRADIENT_')) {
        const css = gradient(p, node.width, node.height);
        if (p.type !== 'GRADIENT_LINEAR') warn(node, 'GRADIENT_APPROX', { type: p.type });
        if (css) out.push({ type: 'gradient', css });
      } else if (p.type === 'IMAGE') {
        out.push({ type: 'image', imageHash: p.imageHash, scaleMode: p.scaleMode, opacity: p.opacity === undefined ? 1 : p.opacity });
        if (p.scaleMode === 'CROP' || p.scaleMode === 'TILE') warn(node, 'IMAGE_SCALE_MODE', { scaleMode: p.scaleMode });
      } else warn(node, 'PAINT_NOT_SUPPORTED', { type: p.type });
      if (p.blendMode && p.blendMode !== 'NORMAL' && p.blendMode !== 'PASS_THROUGH') warn(node, 'PAINT_BLEND_MODE', { blendMode: p.blendMode });
    }
    if (out.filter(p => p.type !== 'image').length > 1) warn(node, 'MULTIPLE_FILLS', { count: out.length });
    return out;
  }
  function radius(node) {
    if (!('cornerRadius' in node)) return null;
    if (typeof node.cornerRadius === 'number') return node.cornerRadius ? [node.cornerRadius, node.cornerRadius, node.cornerRadius, node.cornerRadius] : null;
    return [node.topLeftRadius, node.topRightRadius, node.bottomRightRadius, node.bottomLeftRadius];
  }
  async function stroke(node) {
    if (!('strokes' in node)) return null;
    const s = (await paints(node, node.strokes)).find(p => p.type === 'solid');
    if (!s) return null;
    const weights = typeof node.strokeWeight === 'number'
      ? [node.strokeWeight, node.strokeWeight, node.strokeWeight, node.strokeWeight]
      : [node.strokeTopWeight, node.strokeRightWeight, node.strokeBottomWeight, node.strokeLeftWeight];
    if (node.strokeAlign && node.strokeAlign !== 'INSIDE' && node.type !== 'TEXT') warn(node, 'STROKE_ALIGN', { strokeAlign: node.strokeAlign });
    return { color: s.color, variable: s.variable, weights, dashed: Array.isArray(node.dashPattern) && node.dashPattern.length > 0 };
  }
  function effects(node) {
    if (!('effects' in node)) return null;
    const shadows = [], filters = [];
    for (const e of node.effects) {
      if (e.visible === false) continue;
      if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
        shadows.push(`${e.type === 'INNER_SHADOW' ? 'inset ' : ''}${r2(e.offset.x)}px ${r2(e.offset.y)}px ${r2(e.radius)}px ${r2(e.spread || 0)}px ${color(e.color)}`);
        if (node.type === 'TEXT') warn(node, 'TEXT_SHADOW', {});
      } else if (e.type === 'LAYER_BLUR') filters.push(`filter: blur(${r2(e.radius / 2)}px);`);
      else if (e.type === 'BACKGROUND_BLUR') filters.push(`backdrop-filter: blur(${r2(e.radius / 2)}px);`);
      else warn(node, 'EFFECT_NOT_SUPPORTED', { type: e.type });
    }
    if (filters.length > 1) warn(node, 'MULTIPLE_FILTERS', { filters });
    return { shadows: shadows.join(', ') || null, filter: filters[0] || null };
  }
  function link(node) {
    for (const r of node.reactions || []) {
      for (const a of r.actions || (r.action ? [r.action] : [])) if (a && a.type === 'URL' && a.url) return a.url;
    }
    return null;
  }
  function layout(node) {
    if (!('layoutMode' in node) || node.layoutMode === 'NONE') return null;
    return {
      mode: node.layoutMode, wrap: node.layoutWrap === 'WRAP',
      padding: [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft],
      gap: node.itemSpacing, counterGap: node.counterAxisSpacing || 0,
      primary: node.primaryAxisAlignItems, counter: node.counterAxisAlignItems,
    };
  }
  function childLayout(node) {
    return {
      sizingH: node.layoutSizingHorizontal || null,
      sizingV: node.layoutSizingVertical || null,
      absolute: node.layoutPositioning === 'ABSOLUTE',
    };
  }
  async function styleName(id) {
    if (typeof id !== 'string' || !id) return null;
    if (!styleNames.has(id)) {
      const s = await figma.getStyleByIdAsync(id);
      styleNames.set(id, s ? s.name : null);
    }
    return styleNames.get(id);
  }
  function leaves(node, acc = []) {
    if (node.visible === false) return acc;
    if ('children' in node && node.type !== 'BOOLEAN_OPERATION') for (const c of node.children) leaves(c, acc);
    else acc.push(node);
    return acc;
  }
  function hasImageFill(node) {
    return Array.isArray(node.fills) && node.fills.some(p => p.type === 'IMAGE' && p.visible !== false);
  }
  function isIcon(node) {
    if (VECTOR_TYPES.includes(node.type)) return true;
    if (!['GROUP', 'FRAME', 'INSTANCE', 'COMPONENT'].includes(node.type)) return false;
    const all = leaves(node);
    if (!all.length || !all.every(n => VECTOR_TYPES.includes(n.type) || n.type === 'ELLIPSE' || n.type === 'RECTANGLE' || n.type === 'LINE')) return false;
    if (all.some(hasImageFill) || hasImageFill(node)) return false;
    return /icon|svg|logo|arrow|chevron|иконк|логотип|стрелк/i.test(node.name) || (node.width <= 160 && node.height <= 160 && all.some(n => VECTOR_TYPES.includes(n.type)));
  }
  function hasMask(node) {
    return 'children' in node && node.children.some(c => c.isMask);
  }
  async function svg(node) {
    try {
      const s = await node.exportAsync({ format: 'SVG_STRING' });
      if (s.length > maxSvg) { warn(node, 'SVG_TOO_LARGE', { bytes: s.length }); return null; }
      if (/<image[\s>]/i.test(s)) warn(node, 'SVG_HAS_RASTER', {});
      return s;
    } catch (e) {
      warn(node, 'SVG_EXPORT_FAILED', { message: String(e) });
      return null;
    }
  }
  async function text(node) {
    if (node.hasMissingFont) warn(node, 'MISSING_FONT', {});
    const segs = node.getStyledTextSegments(['fontName', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textCase', 'textDecoration', 'fills', 'hyperlink']);
    return {
      characters: node.characters,
      alignH: node.textAlignHorizontal,
      alignV: node.textAlignVertical,
      autoResize: node.textAutoResize,
      styleName: await styleName(node.textStyleId),
      segments: await Promise.all(segs.map(async s => ({
        start: s.start, end: s.end, characters: s.characters,
        family: s.fontName.family, style: s.fontName.style, weight: s.fontWeight,
        size: s.fontSize, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing,
        textCase: s.textCase, decoration: s.textDecoration,
        ...(await (async () => {
          const f = await paints(node, s.fills);
          const solid = f.find(p => p.type === 'solid') || {};
          return { color: solid.color || null, variable: solid.variable || null, gradient: (f.find(p => p.type === 'gradient') || {}).css || null };
        })()),
        link: s.hyperlink && s.hyperlink.type === 'URL' ? s.hyperlink.value : null,
      }))),
    };
  }
  function base(node, kind) {
    const out = { id: node.id, name: node.name, type: node.type, kind, ...box(node), ...childLayout(node) };
    if ('opacity' in node && node.opacity < 1) out.opacity = r2(node.opacity);
    if (node.blendMode && !['NORMAL', 'PASS_THROUGH'].includes(node.blendMode)) warn(node, 'LAYER_BLEND_MODE', { blendMode: node.blendMode });
    const l = link(node);
    if (l) out.link = l;
    return out;
  }
  async function decorate(out, node) {
    out.fills = await paints(node, node.fills);
    out.radius = radius(node);
    out.stroke = await stroke(node);
    const fx = effects(node);
    if (fx && fx.shadows) out.shadows = fx.shadows;
    if (fx && fx.filter) out.filter = fx.filter;
    return out;
  }
  function addImage(node, out, source) {
    const fill = (out.fills || []).find(p => p.type === 'image');
    images.push({ nodeId: node.id, name: node.name, imageHash: fill ? fill.imageHash : null, source, w: out.w, h: out.h });
  }
  async function visit(node, depth) {
    if (node.visible === false) { warn(node, 'HIDDEN_SKIPPED', {}); return null; }
    if (node.isMask) return null;
    if (hasMask(node) && depth > 0) {
      warn(node, 'MASK_EXPORTED_AS_IMAGE', {});
      const out = base(node, 'image');
      out.export = true;
      addImage(node, out, 'export');
      return out;
    }
    if (node.type === 'TEXT') {
      const out = await decorate(base(node, 'text'), node);
      out.text = await text(node);
      if (out.stroke) warn(node, 'TEXT_STROKE', {});
      return out;
    }
    if (depth > 0 && /^(button|btn|кнопка)/i.test(node.name) && 'children' in node) {
      const texts = leaves(node).filter(n => n.type === 'TEXT');
      if (texts.length === 1) {
        const out = await decorate(base(node, 'button'), node);
        const bg = node.children.find(c => c.type === 'RECTANGLE' && c.visible !== false && Math.abs(c.width - node.width) < 2 && Math.abs(c.height - node.height) < 2);
        if (bg && !out.fills.length) { out.fills = await paints(bg, bg.fills); out.radius = radius(bg); out.stroke = await stroke(bg); const fx = effects(bg); if (fx && fx.shadows) out.shadows = fx.shadows; }
        out.label = { ...box(texts[0]), text: await text(texts[0]) };
        const icon = node.children.find(c => c.visible !== false && c !== bg && c.type !== 'TEXT' && isIcon(c));
        if (icon) { out.icon = { ...box(icon), svg: await svg(icon) }; warn(node, 'BUTTON_ICON', { hint: 'подбери btn_icon или оставь отдельным vector' }); }
        return out;
      }
    }
    if (depth > 0 && isIcon(node)) {
      const out = base(node, 'vector');
      out.svg = await svg(node);
      if (!out.svg) { out.kind = 'image'; out.export = true; out.exportFormat = 'svg'; addImage(node, out, 'export-svg'); }
      return out;
    }
    const isContainer = 'children' in node && node.type !== 'BOOLEAN_OPERATION';
    if (!isContainer) {
      const out = await decorate(base(node, 'shape'), node);
      out.figure = node.type === 'ELLIPSE' ? 'circle' : node.type === 'LINE' ? 'line' : 'rectangle';
      if (node.type === 'LINE') out.h = (out.stroke && out.stroke.weights[0]) || 1;
      if (node.type === 'ELLIPSE' && Math.abs(node.width - node.height) > 1) warn(node, 'ELLIPSE_NOT_CIRCLE', {});
      if (!['RECTANGLE', 'ELLIPSE', 'LINE'].includes(node.type)) warn(node, 'NODE_AS_SHAPE', { type: node.type });
      if (out.fills.some(p => p.type === 'image')) { out.kind = 'image'; addImage(node, out, 'fill'); }
      return out;
    }
    const out = await decorate(base(node, 'frame'), node);
    out.layout = layout(node);
    out.clips = !!node.clipsContent;
    if (out.fills.some(p => p.type === 'image')) addImage(node, out, 'fill');
    out.children = [];
    for (const c of node.children) {
      const v = await visit(c, depth + 1);
      if (v) out.children.push(v);
    }
    return out;
  }
  const tree = await visit(root, 0);
  const palette = {};
  (function collect(n) {
    const add = (c, v) => { if (c) { const k = c.toLowerCase(); palette[k] = palette[k] || { color: k, variables: [], uses: 0 }; palette[k].uses++; if (v && !palette[k].variables.includes(v)) palette[k].variables.push(v); } };
    for (const f of n.fills || []) if (f.type === 'solid') add(f.color, f.variable);
    if (n.stroke) add(n.stroke.color, n.stroke.variable);
    for (const t of [n.text, n.label && n.label.text]) if (t) for (const s of t.segments) add(s.color, s.variable);
    for (const c of n.children || []) collect(c);
  })(tree);
  return { rootId, name: root.name, width: r2(root.width), height: r2(root.height), tree, images, palette: Object.values(palette), warnings };
}
