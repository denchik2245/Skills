// Собирает проект витрины: неразрывные пробелы в вариантах, PNG/JPG каждого варианта,
// превью для ссылки (og.jpg) и страница просмотрщика. node build.mjs <slug> [--only b] [--page]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, projectDir, readJson, writeJson, nb, typografHtml, withFit, syncSite, esc, SITE_TEMPLATE, die } from './lib.mjs';

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
syncSite(cfg);

// Варианты — файлы a.html, b.html, … Подписи (name, about) берутся из meta.json
const files = fs.readdirSync(dir).filter(f => /^[a-z]\.html$/.test(f)).sort();
if (!files.length) die(`В ${dir} нет вариантов (a.html, b.html, …).`);
const known = Object.fromEntries((meta.variants || []).map(v => [v.id, v]));
meta.variants = files.map(f => {
  const id = f[0];
  const v = { id, name: '', about: '', ...known[id], file: f, png: id + '.png', jpg: id + '.jpg' };
  return { ...v, name: nb(v.name), about: nb(v.about) };
});
meta.title = nb(meta.title);
meta.description = nb(meta.description || '');

for (const v of meta.variants) {
  const p = path.join(dir, v.file);
  const src = fs.readFileSync(p, 'utf8');
  const out = withFit(pageOnly ? src : typografHtml(src));
  if (out !== src) fs.writeFileSync(p, out);
}

const report = [];
if (!pageOnly) {
  // headless shell ставится не всегда — тогда запускаем полный Chromium в headless-режиме
  const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chromium' }));
  try {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    for (const v of meta.variants) {
      if (only && v.id !== only) { report.push({ id: v.id, skipped: true }); continue; }
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push('JS: ' + e.message));
      page.on('requestfailed', r => errors.push('Не загрузилось: ' + r.url().slice(0, 120)));
      await page.goto(pathToFileURL(path.join(dir, v.file)).href, { waitUntil: 'networkidle', timeout: 45000 });
      const info = await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
        const de = document.documentElement;
        const warn = [];
        if (de.scrollWidth > 1920) warn.push(`Горизонтальный скролл: ширина ${de.scrollWidth}px`);
        for (const i of document.images) if (!i.naturalWidth) warn.push('Битая картинка: ' + i.getAttribute('src'));
        const generic = /^(serif|sans-serif|monospace|system-ui|cursive|fantasy|-apple-system|BlinkMacSystemFont)$/i;
        for (const sel of ['h1', 'body', 'button, .btn, a[class*="btn"]']) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const fam = getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
          if (!generic.test(fam) && !document.fonts.check(`16px "${fam}"`)) warn.push(`Шрифт «${fam}» (${sel}) не загрузился`);
        }
        if (document.querySelectorAll('h1').length !== 1) warn.push(`H1 на экране: ${document.querySelectorAll('h1').length} (нужен один)`);
        // Текст, вылезающий за свой блок по ширине
        for (const el of document.querySelectorAll('h1, h2, h3, p, a, button, span, li')) {
          if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible' && el.clientWidth) {
            warn.push('Текст обрезан: ' + (el.textContent || '').trim().slice(0, 50));
          }
        }
        return { height: Math.max(de.scrollHeight, document.body.scrollHeight), warn };
      });
      v.height = info.height;
      await page.screenshot({ path: path.join(dir, v.png), fullPage: true });
      await page.screenshot({ path: path.join(dir, v.jpg), fullPage: true, type: 'jpeg', quality: 86 });
      if (v.height < 1080) info.warn.push(`Высота ${v.height}px — меньше 1080`);
      report.push({ id: v.id, height: v.height, png: path.join(dir, v.png), warnings: [...info.warn, ...errors] });
      await page.close();
    }
    await ctx.close();

    // Превью ссылки в мессенджерах: верх первого варианта, 1200×630
    const og = await browser.newContext({ viewport: { width: 1920, height: 1008 }, deviceScaleFactor: 0.625 });
    const page = await og.newPage();
    await page.goto(pathToFileURL(path.join(dir, meta.variants[0].file)).href, { waitUntil: 'networkidle', timeout: 45000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(dir, 'og.jpg'), type: 'jpeg', quality: 84 });
    await og.close();
  } finally {
    await browser.close();
  }
}

writeJson(path.join(dir, 'meta.json'), meta);

const url = `${cfg.baseUrl}/${meta.slug}/`;
const data = meta;
const html = fs.readFileSync(path.join(SITE_TEMPLATE, 'project.html'), 'utf8')
  .replaceAll('{{TITLE}}', esc(meta.title))
  .replaceAll('{{DESC}}', esc(meta.description || ''))
  .replaceAll('{{URL}}', esc(url))
  .replaceAll('{{OG_IMAGE}}', esc(url + 'og.jpg'))
  .replaceAll('{{VERSION}}', String(Date.now()))
  .replace('{{DATA}}', JSON.stringify(data).replace(/</g, '\\u003c'));
fs.writeFileSync(path.join(dir, 'index.html'), html);

console.log(JSON.stringify({ slug: meta.slug, preview: path.join(dir, 'index.html'), url, variants: report }, null, 2));
