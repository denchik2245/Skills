// Вставляй в начало каждого use_figma-скрипта. Состояние между вызовами не сохраняется.
// Задай PAGE_ID и PREFIX (префикс стилей проекта, например 'V3/').
const PAGE_ID = '__PAGE_ID__';
const PREFIX = '__PREFIX__';
const page = await figma.getNodeByIdAsync(PAGE_ID); await figma.setCurrentPageAsync(page);
const PS = {}, TS = {};
for (const s of await figma.getLocalPaintStylesAsync()) if (s.name.startsWith(PREFIX)) PS[s.name.slice(PREFIX.length)] = s;
for (const s of await figma.getLocalTextStylesAsync()) if (s.name.startsWith(PREFIX)) TS[s.name.slice(PREFIX.length)] = s;
// Шрифты грузим из самих стилей — так скрипт не зависит от выбранного шрифта
const fontKeys = new Set();
for (const s of Object.values(TS)) { const k = s.fontName.family + '|' + s.fontName.style; if (!fontKeys.has(k)) { fontKeys.add(k); await figma.loadFontAsync(s.fontName); } }
const CC = { horizontal: 'CENTER', vertical: 'MIN' };

async function fillS(n, k) { await n.setFillStyleIdAsync(PS[k].id); }

// Неразрывные пробелы: короткие предлоги, союзы и частицы переносятся вместе со следующим словом,
// тире не уходит в начало строки, число не отрывается от единицы. Переводы строк не трогает.
const NB_WORDS = 'в|во|на|и|с|со|к|ко|у|о|об|обо|по|за|из|от|до|не|ни|а|но|да|же|ли|бы|для|без|при|под|над|про|что|или|как|из-за|из-под';
const NB_RE = new RegExp('(^|[\\s(«"„—-])(' + NB_WORDS + ')[ \\t]+', 'gi');
function nb(s) {
  if (typeof s !== 'string') return s;
  let prev;
  do { prev = s; s = s.replace(NB_RE, (m, a, w) => a + w + ' '); } while (s !== prev);
  s = s.replace(/[ \t]+—/g, ' —');
  s = s.replace(/(\d)[ \t]+(?=[A-Za-zА-Яа-яЁё%₽€$])/g, '$1 ');
  return s;
}

// Прямоугольник / эллипс. o: {ellipse, radius, fill(стиль) | img(hash) | paints, stroke(стиль), sw, opacity, c, name}
async function R(p, x, y, w, h, o = {}) {
  const r = o.ellipse ? figma.createEllipse() : figma.createRectangle(); p.appendChild(r);
  r.x = x; r.y = y; r.resize(w, h); r.name = o.name || 'Shape';
  if (o.radius != null && !o.ellipse) r.cornerRadius = o.radius;
  r.fills = [];
  if (o.fill) await fillS(r, o.fill); else if (o.img) r.fills = [{ type: 'IMAGE', imageHash: o.img, scaleMode: 'FILL' }]; else if (o.paints) r.fills = o.paints;
  if (o.stroke) { await r.setStrokeStyleIdAsync(PS[o.stroke].id); r.strokeWeight = o.sw || 1; r.strokeAlign = 'INSIDE'; }
  if (o.opacity != null) r.opacity = o.opacity;
  if (o.c) r.constraints = o.c;
  return r;
}

// Фрейм или компонент (o.comp). Без автолейаута.
async function F(p, x, y, w, h, o = {}) {
  const f = o.comp ? figma.createComponent() : figma.createFrame(); p.appendChild(f);
  f.x = x; f.y = y; f.resize(w, h); f.name = o.name || 'Frame'; f.fills = [];
  if (o.fill) await fillS(f, o.fill);
  if (o.img) f.fills = [{ type: 'IMAGE', imageHash: o.img, scaleMode: 'FILL' }];
  if (o.paints) f.fills = o.paints;
  if (o.radius != null) f.cornerRadius = o.radius;
  f.clipsContent = o.clip !== false;
  if (o.stroke) { await f.setStrokeStyleIdAsync(PS[o.stroke].id); f.strokeWeight = o.sw || 1; f.strokeAlign = 'INSIDE'; }
  if (o.c) f.constraints = o.c;
  return f;
}

// Текст. w — целая ширина или 'auto' (замерить и округлить вверх). Высота = строки × интерлиньяж.
async function T(p, x, y, w, str, style, color, o = {}) {
  const t = figma.createText(); p.appendChild(t);
  await t.setTextStyleIdAsync(TS[style].id); t.characters = o.raw ? str : nb(str); await fillS(t, color);
  if (o.align) t.textAlignHorizontal = o.align;
  if (w === 'auto') { t.textAutoResize = 'WIDTH_AND_HEIGHT'; const ww = Math.ceil(t.width); t.textAutoResize = 'HEIGHT'; t.resize(ww, t.height); }
  else { t.textAutoResize = 'HEIGHT'; t.resize(w, t.height); }
  t.x = x; t.y = y; t.name = o.name || 'Text';
  if (o.c) t.constraints = o.c;
  return t;
}

// Иконки — компоненты с именем icon/<name> на странице
const ICONS = {}; for (const c of page.findAllWithCriteria({ types: ['COMPONENT'] })) if (c.name.startsWith('icon/')) ICONS[c.name.slice(5)] = c;
async function recolor(node, color) { for (const v of node.findAll(n => 'strokes' in n && n.type !== 'INSTANCE')) { if (v.strokes.length) await v.setStrokeStyleIdAsync(PS[color].id); if (v.fills.length) await v.setFillStyleIdAsync(PS[color].id); } }
async function I(p, name, x, y, color, o = {}) { const i = ICONS[name].createInstance(); p.appendChild(i); i.x = x; i.y = y; if (color) await recolor(i, color); if (o.c) i.constraints = o.c; i.name = o.name || 'Icon'; return i; }
async function swapIcon(inst, name, color) { const ic = inst.findOne(n => n.type === 'INSTANCE' && n.name === 'Icon'); ic.swapComponent(ICONS[name]); await recolor(ic, color); }

// Свойства инстанса по имени без суффикса '#id'
function prop(inst, map) { const d = inst.componentProperties; const u = {}; for (const [k, v] of Object.entries(map)) { const key = Object.keys(d).find(x => x.split('#')[0] === k); if (key) u[key] = nb(v); } inst.setProperties(u); }
// Привязать текстовые слои компонента к TEXT-свойствам: [[layerName, propName, default], ...]
function textProps(c, list) { for (const [layer, pr, def] of list) { const k = c.addComponentProperty(pr, 'TEXT', nb(def)); c.findOne(n => n.name === layer).componentPropertyReferences = { characters: k }; } }

// Сдвинуть всё ниже секции на d и растянуть страницу (и соседние фреймы ниже, если переданы)
function shiftBelow(pageFrame, section, d, extra = []) { if (!d) return; for (const k of pageFrame.children) if (k.y > section.y + 10) k.y += d; pageFrame.resize(pageFrame.width, pageFrame.height + d); for (const e of extra) e.y += d; }

const ids = [];
