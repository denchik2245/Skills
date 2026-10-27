// Создаёт папку проекта на витрине: node new.mjs "Кофейня «Зерно»" [--domain zerno.by]
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, slugify, writeJson, syncSite, die } from './lib.mjs';

const args = process.argv.slice(2);
const di = args.indexOf('--domain');
const domain = di >= 0 ? args.splice(di, 2)[1] : '';
const title = args.join(' ').trim();
if (!title) die('Использование: node new.mjs "Название проекта" [--domain site.ru]');

const cfg = loadConfig();
fs.mkdirSync(cfg.siteDir, { recursive: true });
syncSite(cfg);

const slug = slugify(title);
const dir = path.join(cfg.siteDir, slug);
fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
writeJson(path.join(dir, 'meta.json'), {
  slug,
  title,
  domain,
  description: 'Варианты первого экрана для обсуждения',
  created: new Date().toISOString().slice(0, 10),
  variants: [],
});

console.log(JSON.stringify({ slug, dir, url: `${cfg.baseUrl}/${slug}/` }, null, 2));
