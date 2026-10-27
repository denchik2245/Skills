// Собирает концепцию: неразрывные пробелы, PNG/JPG десктопа (1920) и мобильной версии (375),
// координаты пояснений (элементы с data-note), обложку для отклика (cover.jpg), превью ссылки (og.jpg)
// и страницу просмотрщика. node build.mjs <slug> [--only desktop|mobile] [--page]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, projectDir, readJson, writeJson, nb, typografHtml, syncSite, esc, SITE_TEMPLATE, die } from './lib.mjs';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { die('Нет playwright. Выполни: cd ' + path.resolve(SITE_TEMPLATE, '..') + ' && npm install && npx playwright install chromium'); }

const args = process.argv.slice(2);
const oi = args.indexOf('--only');
const only = oi >= 0 ? args.splice(oi, 2)[1] : null;
// --page: только обновить просмотрщик и страницу проекта, без рендера картинок (после правок site/)
const pi = args.indexOf('--page');
const pageOnly = pi >= 0 && Boolean(args.splice(pi, 1));
const slug = args[0];
const cfg = loadConfig();
const dir = projectDir(cfg, slug);
const meta = readJson(path.join(dir, 'meta.json'));

// Экраны концепции. Мобильная версия рендерится в 2× — иначе картинка 375 px слишком мелкая для отклика
const SCREENS = {
  desktop: { file: 'desktop.html', width: 1920, height: 1080, scale: 1 },
  mobile: { file: 'mobile.html', width: 375, height: 812, scale: 2 },
};
if (!fs.existsSync(path.join(dir, SCREENS.desktop.file))) {
  if (fs.existsSync(path.join(dir, 'a.html'))) die('Это проект старого формата (варианты a/b/c, просмотрщик viewer-legacy) — его не пересобираем.');
  die(`В ${dir} нет desktop.html.`);
}
syncSite(cfg);

const screens = Object.entries(SCREENS).filter(([, s]) => fs.existsSync(path.join(dir, s.file)));
meta.screens = Object.fromEntries(screens.map(([id, s]) => [id, {
  ...meta.screens?.[id], file: s.file, png: id + '.png', jpg: id + '.jpg',
}]));
meta.title = nb(meta.title);
meta.description = nb(meta.description || '');
meta.notes = (meta.notes || []).map(n => ({ ...n, title: nb(n.title || ''), text: nb(n.text || '') }));

const report = { warnings: [] };
if (!meta.screens.mobile) report.warnings.push('Нет mobile.html — на странице будет только десктоп.');

if (!pageOnly) {
  for (const [, s] of screens) {
    const p = path.join(dir, s.file);
    const src = fs.readFileSync(p, 'utf8');
    const out = typografHtml(src);
    if (out !== src) fs.writeFileSync(p, out);
  }

  // headless shell ставится не всегда — тогда запускаем полный Chromium в headless-режиме
  const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chromium' }));
  try {
    for (const [id, s] of screens) {
      if (only && id !== only) continue;
      const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.scale });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push('JS: ' + e.message));
      page.on('requestfailed', r => errors.push('Не загрузилось: ' + r.url().slice(0, 120)));
      await page.goto(pathToFileURL(path.join(dir, s.file)).href, { waitUntil: 'networkidle', timeout: 45000 });
      const info = await page.evaluate(async (W) => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
        const de = document.documentElement;
        const warn = [];
        if (de.scrollWidth > W) warn.push(`Горизонтальный скролл: ширина ${de.scrollWidth}px при холсте ${W}`);
        for (const i of document.images) if (!i.naturalWidth) warn.push('Битая картинка: ' + i.getAttribute('src'));
        const generic = /^(serif|sans-serif|monospace|system-ui|cursive|fantasy|-apple-system|BlinkMacSystemFont)$/i;
        for (const sel of ['h1', 'body', 'button, .btn, a[class*="btn"]']) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const fam = getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
          if (!generic.test(fam) && !document.fonts.check(`16px "${fam}"`)) warn.push(`Шрифт «${fam}» (${sel}) не загрузился`);
        }
        if (document.querySelectorAll('h1').length !== 1) warn.push(`H1 на экране: ${document.querySelectorAll('h1').length} (нужен один)`);
        for (const el of document.querySelectorAll('h1, h2, h3, p, a, button, span, li')) {
          if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible' && el.clientWidth) {
            warn.push('Текст обрезан: ' + (el.textContent || '').trim().slice(0, 50));
          }
        }
        // Где на макете элементы с пояснениями
        const boxes = [...document.querySelectorAll('[data-note]')].map(el => {
          const r = el.getBoundingClientRect();
          return { id: Number(el.dataset.note), x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
        });
        return { height: Math.max(de.scrollHeight, document.body.scrollHeight), warn, boxes };
      }, s.width);
      meta.screens[id].height = info.height;
      await page.screenshot({ path: path.join(dir, id + '.png'), fullPage: true });
      await page.screenshot({ path: path.join(dir, id + '.jpg'), fullPage: true, type: 'jpeg', quality: 86 });
      if (info.height < s.height && id === 'desktop') info.warn.push(`Высота ${info.height}px — меньше ${s.height}`);
      report.warnings.push(...[...info.warn, ...errors].map(w => `${id}: ${w}`));
      report[id] = { height: info.height, jpg: path.join(dir, id + '.jpg') };

      if (id === 'desktop') {
        const byId = Object.fromEntries(info.boxes.map(b => [b.id, b]));
        for (const n of meta.notes) {
          const b = byId[n.id];
          if (b) n.box = { x: b.x, y: b.y, w: b.w, h: b.h };
          else { delete n.box; report.warnings.push(`Пояснение ${n.id} «${n.title}»: на desktop.html нет элемента с data-note="${n.id}"`); }
        }
        for (const b of info.boxes) if (!meta.notes.some(n => n.id === b.id)) report.warnings.push(`data-note="${b.id}" есть на макете, но нет в meta.json`);
      }
      await ctx.close();
    }
    if (meta.notes.length < 3 || meta.notes.length > 5) report.warnings.push(`Пояснений ${meta.notes.length} — нужно 3–5`);

    // Обложка для отклика и превью ссылки: десктоп в окне браузера + телефон
    const cover = path.join(dir, '.cover.html');
    fs.writeFileSync(cover, coverHtml(Boolean(meta.screens.mobile)));
    for (const [file, scale, quality] of [['cover.jpg', 1, 88], ['og.jpg', 0.625, 84]]) {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1008 }, deviceScaleFactor: scale });
      const page = await ctx.newPage();
      await page.goto(pathToFileURL(cover).href, { waitUntil: 'load' });
      await page.screenshot({ path: path.join(dir, file), type: 'jpeg', quality });
      await ctx.close();
    }
    fs.rmSync(cover);
  } finally {
    await browser.close();
  }
}

writeJson(path.join(dir, 'meta.json'), meta);

const url = `${cfg.baseUrl}/${meta.slug}/`;
const html = fs.readFileSync(path.join(SITE_TEMPLATE, 'project.html'), 'utf8')
  .replaceAll('{{TITLE}}', esc(meta.title))
  .replaceAll('{{DESC}}', esc(meta.description || ''))
  .replaceAll('{{URL}}', esc(url))
  .replaceAll('{{OG_IMAGE}}', esc(url + 'og.jpg'))
  .replaceAll('{{VERSION}}', String(Date.now()))
  .replace('{{DATA}}', JSON.stringify(meta).replace(/</g, '\\u003c'));
fs.writeFileSync(path.join(dir, 'index.html'), html);

console.log(JSON.stringify({
  slug: meta.slug, preview: path.join(dir, 'index.html'), url,
  cover: path.join(dir, 'cover.jpg'), desktop: report.desktop, mobile: report.mobile, warnings: report.warnings,
}, null, 2));

// Композиция 1920×1008: окно браузера с первым экраном и телефон с мобильной версией внахлёст
function coverHtml(withPhone) {
  const left = withPhone ? 96 : 260;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: 1920px; height: 1008px; overflow: hidden; background: #0e0e10; }
  .desk { position: absolute; left: ${left}px; top: 104px; width: 1400px; border-radius: 16px; overflow: hidden; background: #17171a;
    border: 1px solid #2a2a2f; box-shadow: 0 40px 100px -30px rgba(0, 0, 0, .8); }
  .chrome { display: flex; gap: 10px; align-items: center; height: 44px; padding: 0 20px; border-bottom: 1px solid #2a2a2f; }
  .chrome i { width: 12px; height: 12px; border-radius: 50%; background: #3a3a40; }
  .desk .shot { height: 788px; overflow: hidden; background: #fff; }
  .desk img { display: block; width: 1400px; }
  .phone { position: absolute; left: 1440px; top: 150px; width: 384px; padding: 12px; border-radius: 52px; background: #1f1f23;
    border: 1px solid #2a2a2f; box-shadow: 0 40px 100px -20px rgba(0, 0, 0, .9); }
  .phone .shot { height: 780px; border-radius: 40px; overflow: hidden; background: #fff; }
  .phone img { display: block; width: 360px; }
</style></head><body>
  <div class="desk"><div class="chrome"><i></i><i></i><i></i></div><div class="shot"><img src="desktop.png"></div></div>
  ${withPhone ? '<div class="phone"><div class="shot"><img src="mobile.png"></div></div>' : ''}
</body></html>`;
}
