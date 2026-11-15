#!/usr/bin/env node
// Собирает JSON Zero Block из выгрузки extract.js (десктоп и, если есть, мобильный фрейм секции).
//
//   node to-zero.mjs --desktop hero.d.json [--mobile hero.m.json] [--assets assets.json] [--fonts fonts.json]
//     [--grid 1200] [--mobile-grid 360] [--screens 360,480,640,960,1200] [--mobile-from 640]
//     [--timestamp <ms>] --out hero.zero.json
//
// assets.json: { "<figma node id или imageHash>": { "url": "<CDN Tilda>", "w": 1600, "h": 900 } }
// fonts.json:  { "<семейство в Figma>": "<fontfamily для Tilda>" } — по умолчанию то же имя;
//              шрифты проекта: { "Tenor Sans": "var(--t-headline-font,Arial)", "Inter": "var(--t-text-font,Arial)" }.
// --styles:    ответ get_project_settings (или его globalstyles_json) — цвета из стилей проекта
//              пишутся как var(--uc-color-color-<id>,#hex), остальные попадают в отчёт.
// --eager:     блок первого экрана — картинки грузятся сразу (lazyoff: y).
// Рядом с --out пишется <out>.report.json: предупреждения, недостающие картинки, несовпавшие слои.
// Результат — черновик: проверь его по references/mapping.md и на страницах Tilda.
import fs from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
  return acc;
}, []));
if (!args.desktop || !args.out) {
  console.error('Нужны --desktop <выгрузка>.json и --out <блок>.json');
  process.exit(1);
}
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const desktop = read(args.desktop);
const mobile = args.mobile ? read(args.mobile) : null;
const assets = args.assets ? read(args.assets) : {};
const fonts = args.fonts ? read(args.fonts) : {};
const stylesRaw = args.styles ? read(args.styles) : null;
const colorStyles = (!stylesRaw ? [] : Array.isArray(stylesRaw) ? stylesRaw : (stylesRaw.globalstyles_json || []))
  .filter(s => s.type === 'color' && s.vars && s.vars.color)
  .map(s => ({ id: s.id, name: s.name, hex: s.vars.color.toLowerCase() }));
const GRID = +(args.grid || 1200);
const MGRID = +(args['mobile-grid'] || 360);
const SCREENS = (args.screens || '360,480,640,960,1200').split(',').map(Number).sort((a, b) => a - b);
const MOBILE_FROM = +(args['mobile-from'] || 640);
const TS = String(args.timestamp || Date.now());
const NBSP = args.nbsp || '#nbsp;'; // так неразрывный пробел записан в zero_block_instructions
if (SCREENS[SCREENS.length - 1] !== GRID) {
  console.error(`Самый широкий брейкпоинт (${SCREENS.at(-1)}) должен совпадать с --grid (${GRID}).`);
  process.exit(1);
}

const warnings = [...(desktop.warnings || []).map(w => ({ ...w, frame: 'desktop' })), ...((mobile && mobile.warnings) || []).map(w => ({ ...w, frame: 'mobile' }))];
const warn = (node, code, extra = {}) => warnings.push({ code, id: node.id, name: node.name, ...extra });
const missingAssets = [];
let counter = 0;
const newId = () => TS + String(++counter).padStart(6, '0');
let z = 0;
const int = v => String(Math.round(v));
const num = v => String(Math.round(v * 100) / 100);
const px4 = list => list.map(v => `${Math.round(v || 0)}px`).join(' ');

// Брейкпоинты: десктоп (без суффикса), уменьшенный десктоп, мобильные.
const lower = SCREENS.slice(0, -1).reverse();
// Уже мобильной сетки (320 при сетке 360) — мобильный фрейм уменьшается целиком.
const plan = lower.map(bp => (bp > MOBILE_FROM || !mobile)
  ? { bp, src: 'desktop', s: bp / GRID }
  : bp >= MGRID ? { bp, src: 'mobile', s: 1, dx: Math.round((bp - MGRID) / 2) }
  : { bp, src: 'mobile', s: bp / MGRID, dx: 0 });
if (!mobile) warnings.push({ code: 'NO_MOBILE_FRAME', hint: `брейкпоинты ≤ ${MOBILE_FROM} получили уменьшенный десктоп — нужен мобильный фрейм или ручная адаптация` });

const gxD = (desktop.width - GRID) / 2;
const gxM = mobile ? (mobile.width - MGRID) / 2 : 0;

// Пути слоёв для сопоставления десктопа и мобильного фрейма.
function index(tree) {
  const map = new Map();
  (function walk(node, path) {
    const seen = {};
    for (const c of node.children || []) {
      seen[c.name] = (seen[c.name] || 0) + 1;
      const p = (path ? path + '/' : '') + c.name + (seen[c.name] > 1 ? '#' + seen[c.name] : '');
      c._path = p;
      map.set(p, c);
      walk(c, p);
    }
  })(tree, '');
  return map;
}
// Фрейм без детей с картинкой — это картинка.
function normalize(node) {
  for (const c of node.children || []) normalize(c);
  if (node.kind === 'frame' && !(node.children || []).length && (node.fills || []).some(p => p.type === 'image')) node.kind = 'image';
}
normalize(desktop.tree);
if (mobile) normalize(mobile.tree);
const dIndex = index(desktop.tree);
const mIndex = mobile ? index(mobile.tree) : new Map();
const counterpart = node => {
  const m = mIndex.get(node._path);
  return m && m.kind === node.kind ? m : null;
};

// Цвет из стиля проекта: сначала по имени переменной Figma и цвету, затем только по цвету.
const unboundColors = new Map();
function ref(value, variable) {
  if (!value || !stylesRaw) return value;
  const key = value.toLowerCase();
  const note = () => {
    const u = unboundColors.get(key) || { color: key, variables: [], uses: 0 };
    u.uses++;
    if (variable && !u.variables.includes(variable)) u.variables.push(variable);
    unboundColors.set(key, u);
    return value;
  };
  if (!key.startsWith('#')) return note();
  const short = variable ? variable.split('/').pop().trim().toLowerCase() : null;
  let style = short && colorStyles.find(c => c.name.trim().toLowerCase() === short && c.hex === key);
  if (!style) {
    const same = colorStyles.filter(c => c.hex === key);
    if (same.length > 1) warnings.push({ code: 'STYLE_AMBIGUOUS', color: key, variable, styles: same.map(c => c.name) });
    style = same[0];
  }
  return style ? `var(--uc-color-color-${style.id},${key})` : note();
}
function fill(node) {
  const f = (node.fills || []).find(p => p.type === 'solid' || p.type === 'gradient');
  return f ? (f.type === 'solid' ? ref(f.color, f.variable) : ref(f.css)) : null;
}
function imageFill(node) {
  return (node.fills || []).find(p => p.type === 'image') || null;
}
// Картинки: какой файл нужен и в каком наибольшем размере он показывается (px макета, без учёта ретины).
const imageUse = new Map();
function assetKey(node) {
  const f = imageFill(node);
  if (assets[node.id]) return node.id;
  if (f && f.imageHash && assets[f.imageHash]) return f.imageHash;
  return !node.export && f && f.imageHash ? f.imageHash : node.id;
}
function useImage(key, node, w, h) {
  const u = imageUse.get(key) || { key, nodeId: node.id, imageHash: (imageFill(node) || {}).imageHash || null, name: node.name, export: !!node.export, maxW: 0, maxH: 0, uploaded: !!assets[key] };
  u.maxW = Math.max(u.maxW, Math.round(w));
  u.maxH = Math.max(u.maxH, Math.round(h));
  imageUse.set(key, u);
}
function asset(node) {
  const key = assetKey(node);
  const a = assets[key];
  if (!a && !missingAssets.some(m => m.key === key)) missingAssets.push({ key, id: node.id, name: node.name, imageHash: (imageFill(node) || {}).imageHash || null, export: !!node.export });
  return a || { url: '', w: Math.round(node.w), h: Math.round(node.h) };
}
function looks(o, node) {
  const r = node.radius;
  if (r && r.some(Boolean)) o.borderradius = px4(r);
  if (node.stroke) {
    o.borderwidth = px4(node.stroke.weights);
    o.bordercolor = ref(node.stroke.color, node.stroke.variable);
    o.borderstyle = node.stroke.dashed ? 'dashed' : 'solid';
  }
  if (node.shadows) o.shadows = node.shadows;
  if (node.filter) o.effects = node.filter;
  if (node.opacity !== undefined) o.opacity = num(node.opacity);
  if (node.rotation) o.rotate = num(-node.rotation);
  if (node.link) o.link = node.link;
}

// Типографика.
const lh = s => !s.lineHeight || s.lineHeight.unit === 'AUTO' ? '1.2'
  : String(Math.round((s.lineHeight.unit === 'PIXELS' ? s.lineHeight.value / s.size : s.lineHeight.value / 100) * 1000) / 1000);
const ls = s => !s.letterSpacing ? 0 : s.letterSpacing.unit === 'PIXELS' ? s.letterSpacing.value : s.size * s.letterSpacing.value / 100;
const CASE = { UPPER: 'uppercase', LOWER: 'lowercase', TITLE: 'capitalize' };
const ALIGN = { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'left' };
const family = f => fonts[f] || f;
function mainSegment(text) {
  return text.segments.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
}
function escape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\u00a0/g, NBSP).replace(/\r?\n|\u2028/g, '<br>');
}
function richText(node, base, allowLinks) {
  return node.text.segments.map(s => {
    let h = escape(s.characters);
    const style = [];
    if (s.color && s.color !== base.color) style.push(`color:${ref(s.color, s.variable)}`);
    if (s.weight !== base.weight) style.push(`font-weight:${s.weight}`);
    if (s.size !== base.size) style.push(`font-size:${Math.round(s.size)}px`);
    if (s.family !== base.family) warn(node, 'MIXED_FONT_FAMILY', { family: s.family });
    if (s.textCase !== base.textCase) warn(node, 'MIXED_TEXT_CASE', { range: [s.start, s.end] });
    if (style.length) h = `<span style="${style.join('; ')}">${h}</span>`;
    if (s.decoration === 'UNDERLINE' && !s.link) h = `<u>${h}</u>`;
    if (s.decoration === 'STRIKETHROUGH') h = `<s>${h}</s>`;
    if (s.link) {
      if (allowLinks) h = `<a href="${s.link}">${h}</a>`;
      else warn(node, 'TEXT_LINK_DROPPED', { link: s.link, hint: 'у текста есть link элемента — <a> внутри нельзя' });
    }
    return h;
  }).join('');
}
function headingTag(node) {
  const label = `${node.text.styleName || ''} ${node.name}`;
  if (/wordmark/i.test(label)) return null;
  if (/\bh1\b|display/i.test(label)) return 'h1';
  if (/\bh2\b/i.test(label)) return 'h2';
  if (/\bh3\b/i.test(label)) return 'h3';
  return null;
}
function typo(o, base) {
  o.fontfamily = family(base.family);
  o.fontweight = String(base.weight);
  o.lineheight = lh(base);
  const l = ls(base);
  if (l) o.letterspacing = num(l);
  if (base.gradient) o.color = ref(base.gradient);
  else if (base.color) o.color = ref(base.color, base.variable);
  if (CASE[base.textCase]) o.lettercase = CASE[base.textCase];
}

// Размеры и отзывчивые ключи по одному источнику.
function geometry(node, t) {
  const g = {};
  if (node._window) {
    g.left = '0'; g.width = '100';
  } else {
    g.left = int((node.x - t.gx) * t.s + (t.dx || 0));
    g.width = int(node.w * t.s);
  }
  g.top = int(node.y * t.s);
  g.height = int(node.h * t.s);
  return g;
}
function responsive(rec, node, t) {
  const out = geometry(node, t);
  const size = sz => String(t.s === 1 ? Math.round(sz) : Math.max(Math.round(sz * t.s), Math.min(Math.round(sz), 14)));
  if (node.kind === 'vector' && t.s !== 1) out.width = int(node.w); // иконки не уменьшаем
  if (node.kind === 'text') {
    const b = mainSegment(node.text);
    out.fontsize = size(b.size);
    out.lineheight = lh(b);
    if (ls(b)) out.letterspacing = num(ls(b) * t.s);
  }
  if (node.kind === 'button') {
    const b = mainSegment(node.label.text);
    out.fontsize = size(b.size);
  }
  if (rec.type === 'group' && node.layout) {
    const L = node.layout;
    out.padding = px4(L.padding.map(v => v * t.s));
    out.flexdirection = L.wrap ? 'wrap' : L.mode === 'HORIZONTAL' ? 'row' : 'column';
    const gap = String(Math.round(L.gap * t.s)), cross = String(Math.round(L.counterGap * t.s));
    if (L.mode === 'HORIZONTAL') { out.flexgapx = gap; out.flexgapy = L.wrap ? cross : gap; }
    else { out.flexgapy = gap; out.flexgapx = gap; }
  }
  return out;
}

const elements = [];
const groups = [];
const records = [];

function flexKeys(o, L) {
  o.flex = 'auto';
  const J = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end', SPACE_BETWEEN: 'space-between' };
  const A = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end', BASELINE: 'flex-start' };
  o.flexalignitems = A[L.counter] || 'flex-start';
  o.flexjustifycontent = J[L.primary] || 'flex-start';
}
function sizing(o, node, parent) {
  const M = { FIXED: 'fixed', HUG: 'hug', FILL: 'fill' };
  if (parent.flex) {
    o.widthmode = M[node.sizingH] || 'fixed';
    o.heightmode = M[node.sizingV] || 'fixed';
    if (node.absolute) { o.absolute = 'y'; warn(node, 'ABSOLUTE_IN_FLEX', { hint: 'проверь положение на странице' }); }
  } else if (node.kind === 'frame') {
    o.widthmode = node.sizingH === 'HUG' ? 'hug' : 'fixed';
    o.heightmode = node.sizingV === 'HUG' ? 'hug' : 'fixed';
  }
}
function units(o) {
  Object.assign(o, { leftunits: 'px', topunits: 'px', widthunits: o.widthunits || 'px', heightunits: 'px' });
}

function build(node, parent, source) {
  const t0 = source === 'mobile' ? { gx: gxM, s: 1 } : { gx: gxD, s: 1 };
  const sectionW = source === 'mobile' ? mobile.width : desktop.width;
  if (!parent.flex && Math.abs(node.x) < 1 && Math.abs(node.w - sectionW) < 1 && !node.rotation) node._window = true;
  const flowChildren = node.layout ? [...(node.children || [])].reverse() : (node.children || []);
  const zi = String(++z);

  if (node.kind === 'frame') {
    const visual = fill(node) || imageFill(node) || node.stroke || node.shadows || node.clips || node.filter;
    const physical = !!(node.layout || visual || parent.physical);
    const g = { id: newId(), name: node.name, zindex: zi };
    if (physical) g.type = 'physical';
    if (parent.groupId) g.groupid = parent.groupId;
    Object.assign(g, geometry(node, t0));
    if (node._window) { g.container = 'window'; warn(node, 'FULL_WIDTH_GROUP', { hint: 'группа на всю ширину окна — проверь, что ширина в % допустима' }); }
    sizing(g, node, parent);
    if (physical) {
      const f = fill(node), img = imageFill(node);
      if (f) g.bgcolor = f;
      if (img) g.bgimg = asset(node).url;
      looks(g, node);
      if (node.clips) g.overflow = 'hidden hidden';
      if (node.layout) { flexKeys(g, node.layout); Object.assign(g, responsive({ type: 'group' }, node, t0)); }
      else if (parent.flex) warn(node, 'FREE_FRAME_IN_FLEX', { hint: 'фрейм без автолейаута внутри автолейаута — дети встанут от сетки артборда; добавь автолейаут в Figma или проверь' });
    } else if (node.link) warn(node, 'LINK_ON_LOGICAL_GROUP', { link: node.link });
    if (g.container === 'window') g.widthunits = '%';
    groups.push(g);
    records.push({ type: 'group', obj: g, node, source, assetKey: imageFill(node) ? assetKey(node) : null });
    const ctx = { groupId: g.id, flex: !!node.layout, physical };
    for (const c of flowChildren) build(c, ctx, source);
    return;
  }

  const o = { elem_id: newId(), elem_type: '', zindex: zi, layer: node.name };
  if (parent.groupId) o.groupid = parent.groupId;
  Object.assign(o, geometry(node, t0));
  if (node._window) { o.container = 'window'; o.widthunits = '%'; }
  sizing(o, node, parent);

  if (node.kind === 'text') {
    const b = mainSegment(node.text);
    o.elem_type = 'text';
    const tag = headingTag(node);
    if (tag) o.tag = tag;
    o.text = richText(node, b, !node.link);
    o.textfit = node.text.autoResize === 'WIDTH_AND_HEIGHT' ? 'autowidth' : 'autoheight';
    o.align = ALIGN[node.text.alignH] || 'left';
    if (node.text.alignH === 'JUSTIFIED') warn(node, 'JUSTIFIED_TEXT');
    o.fontsize = String(Math.round(b.size));
    typo(o, b);
    if (parent.flex) o.heightmode = 'hug';
    looks(o, node);
    delete o.borderradius; delete o.borderwidth; delete o.bordercolor; delete o.borderstyle;
  } else if (node.kind === 'button') {
    const b = mainSegment(node.label.text);
    o.elem_type = 'button';
    o.caption = node.label.text.characters.replace(/\s*\n\s*/g, ' ').replace(/\u00a0/g, ' ');
    o.textfit = 'fixedsize';
    o.align = ALIGN[node.label.text.alignH] || 'center';
    o.fontsize = String(Math.round(b.size));
    typo(o, b);
    const f = fill(node);
    o.bgcolor = f || 'transparent';
    looks(o, node);
    const pl = Math.round(node.label.x - node.x), pr = Math.round(node.x + node.w - node.label.x - node.label.w);
    if (o.align !== 'center') o.padding = `0px ${Math.max(pr, 0)}px 0px ${Math.max(pl, 0)}px`;
    if (!node.link && !b.link) warn(node, 'BUTTON_NO_LINK', { hint: 'поставь ссылку, якорь или #popup' });
    if (node.icon) {
      o.btn_iconposition = node.icon.x > node.label.x ? 'right' : 'left';
      o.btn_iconsize = int(node.icon.w);
      o.btn_iconmargin = int(o.btn_iconposition === 'right' ? node.icon.x - node.label.x - node.label.w : node.label.x - node.icon.x - node.icon.w);
    }
  } else if (node.kind === 'image') {
    const a = asset(node);
    const f = imageFill(node);
    o.elem_type = 'image';
    o.img = a.url;
    o.filewidth = int(a.w); o.fileheight = int(a.h);
    o.imagefit = f && f.scaleMode === 'FIT' ? 'contain' : 'cover';
    o.heightmode = 'fixed';
    o.alt = '';
    if (args.eager) o.lazyoff = 'y';
    looks(o, node);
    if (node.figure === 'circle') o.borderradius = '3000px 3000px 3000px 3000px';
    if (f && f.opacity < 1) o.opacity = num(f.opacity * (node.opacity || 1));
  } else if (node.kind === 'vector') {
    o.elem_type = 'vector';
    const svg = node.svg.replace(/<svg\b([^>]*)>/, (m, attrs) => '<svg' + attrs.replace(/\s(width|height)="[^"]*"/g, '') + '>');
    const vb = (svg.match(/viewBox="([^"]+)"/) || [])[1];
    const [, , vw, vh] = vb ? vb.split(/[\s,]+/).map(Number) : [0, 0, node.w, node.h];
    o.vectorsvg = svg;
    o.vectorjson = '';
    o.filewidth = num(vw); o.fileheight = num(vh);
    o.heightmode = 'hug';
    delete o.height;
    if (node.rotation) o.rotate = num(-node.rotation);
    if (node.opacity !== undefined) o.opacity = num(node.opacity);
    if (node.link) o.link = node.link;
  } else {
    o.elem_type = 'shape';
    o.figure = node.figure === 'circle' ? 'circle' : 'rectangle';
    const f = fill(node);
    if (node.figure === 'line') {
      o.bgcolor = node.stroke ? ref(node.stroke.color, node.stroke.variable) : (f || '#000000');
      node.stroke = null;
    } else if (f) o.bgcolor = f;
    looks(o, node);
    if (node.figure === 'circle') o.borderradius = '3000px 3000px 3000px 3000px';
  }
  units(o);
  elements.push(o);
  records.push({ type: 'elem', obj: o, node, source, assetKey: o.elem_type === 'image' ? assetKey(node) : null });
}

// Корень секции — артборд.
const root = desktop.tree;
for (const c of root.children || []) build(c, {}, 'desktop');

// Мобильные слои без пары на десктопе: свои элементы, видимые только на мобильных брейкпоинтах.
const matched = new Set();
for (const r of records) { const m = counterpart(r.node); if (m) matched.add(m); }
if (mobile) {
  const groupOf = new Map(records.filter(r => r.type === 'group').map(r => [r.node._path, r.obj]));
  (function walk(node, parentPath) {
    for (const c of node.children || []) {
      if (matched.has(c)) { walk(c, c._path); continue; }
      const pg = parentPath ? groupOf.get(parentPath) : null;
      const before = records.length;
      build(c, pg ? { groupId: pg.id, flex: !!(dIndex.get(parentPath) || {}).layout, physical: pg.type === 'physical' } : {}, 'mobile');
      for (const r of records.slice(before)) r.mobileOnly = true;
      warn(c, 'MOBILE_ONLY_LAYER', { path: c._path });
    }
  })(mobile.tree, '');
}

// Брейкпоинты: значение пишем, только если оно отличается от действующего на следующем, более широком.
const RESP_KEYS = ['top', 'left', 'width', 'height', 'fontsize', 'lineheight', 'letterspacing', 'padding', 'flexdirection', 'flexgapx', 'flexgapy'];
for (const r of records) {
  const o = r.obj;
  const effective = Object.fromEntries(RESP_KEYS.filter(k => k in o).map(k => [k, o[k]]));
  const twin = r.source === 'desktop' ? counterpart(r.node) : r.node;
  if (r.source === 'desktop' && mobile && !twin) warn(r.node, 'DESKTOP_ONLY_LAYER', { path: r.node._path });
  if (twin && r.source === 'desktop' && twin.kind === 'text' && twin.text.characters !== r.node.text.characters) {
    warn(r.node, 'MOBILE_TEXT_DIFFERS', { hint: 'у элемента один текст на все брейкпоинты — нужен отдельный мобильный слой' });
  }
  if (r.mobileOnly) { o.hidden = 'y'; o[`hidden-res-${MOBILE_FROM}`] = 'n'; }
  else if (r.source === 'desktop' && mobile && !twin) o[`hidden-res-${MOBILE_FROM}`] = 'y';
  const shown = (v, bp) => r.node._window ? bp : +v.width;
  if (r.assetKey) useImage(r.assetKey, r.node, r.node._window ? 1920 : r.node.w, r.node.h);
  for (const p of plan) {
    let node, t;
    if (p.src === 'desktop') {
      if (r.source !== 'desktop') continue;
      node = r.node; t = { gx: gxD, s: p.s };
    } else {
      node = twin;
      if (!node) continue;
      twin._window = !!r.node._window;
      t = { gx: gxM, s: p.s, dx: p.dx };
    }
    if (r.type === 'group' && !node.layout && p.src === 'mobile' && r.node.layout) warn(r.node, 'MOBILE_LAYOUT_MISSING', {});
    const v = responsive(r, node, t);
    if (r.assetKey) useImage(r.assetKey, r.node, shown(v, p.bp), +v.height);
    if (r.obj.elem_type === 'vector') delete v.height;
    if (r.type === 'group' && !r.node.layout) { delete v.padding; delete v.flexdirection; delete v.flexgapx; delete v.flexgapy; }
    for (const [k, val] of Object.entries(v)) {
      if (!(k in effective) || effective[k] !== val) { o[`${k}-res-${p.bp}`] = val; effective[k] = val; }
    }
  }
}

// Артборд.
const block = {
  ab_screens: SCREENS.join(','),
  ab_title: desktop.name,
  ab_height: int(desktop.height),
  ab_bgattachment: 'scroll',
  ab_bgposition: 'center center',
};
const rootFill = fill(root), rootImg = imageFill(root);
if (rootFill) block.ab_bgcolor = rootFill;
if (rootImg) {
  block.ab_bgimg = asset(root).url;
  useImage(assetKey(root), root, 1920, desktop.height);
}
for (const p of plan) {
  const h = (p.src === 'desktop' ? desktop.height : mobile.height) * p.s;
  block[`ab_height-res-${p.bp}`] = int(h);
}
elements.forEach((e, i) => { block[String(i)] = e; });
if (groups.length) block.groups = groups;
block.timestamp = TS;

const json = JSON.stringify(block);
fs.writeFileSync(args.out, JSON.stringify(block, null, 1));
const report = {
  out: args.out,
  bytes: Buffer.byteLength(json),
  overLimit: Buffer.byteLength(json) > 250000,
  elements: elements.length,
  groups: groups.length,
  breakpoints: plan,
  missingAssets,
  images: [...imageUse.values()],
  unboundColors: stylesRaw ? [...unboundColors.values()] : 'стили проекта не переданы (--styles)',
  headings: elements.filter(e => e.tag).map(e => ({ tag: e.tag, layer: e.layer })),
  warnings,
};
fs.writeFileSync(args.out.replace(/\.json$/, '') + '.report.json', JSON.stringify(report, null, 1));
console.log(JSON.stringify({ out: args.out, bytes: report.bytes, overLimit: report.overLimit, elements: report.elements, groups: report.groups, missingAssets: missingAssets.length, unboundColors: Array.isArray(report.unboundColors) ? report.unboundColors.length : null, warnings: warnings.length }));
