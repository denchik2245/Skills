// Общие помощники скриптов first-screen: конфиг, пути, slug, неразрывные пробелы, синхронизация витрины.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE_TEMPLATE = path.join(SKILL_DIR, 'site');

export function loadConfig() {
  const c = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'config.json'), 'utf8'));
  c.siteDir = c.siteDir.replace(/^~(?=\/|$)/, os.homedir());
  c.baseUrl = c.baseUrl.replace(/\/+$/, '');
  return c;
}

export function die(msg) { console.error('✖ ' + msg); process.exit(1); }

export function projectDir(cfg, slug) {
  if (!slug) die('Укажи slug проекта.');
  const dir = path.join(cfg.siteDir, slug);
  if (!fs.existsSync(path.join(dir, 'meta.json'))) die(`Нет проекта ${dir} (нет meta.json). Создай его через new.mjs.`);
  return dir;
}

export const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
export const writeJson = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n');

// Транслит + случайный хвост, чтобы ссылку нельзя было угадать перебором названий
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export function slugify(title) {
  const base = title.toLowerCase().split('').map(ch => TR[ch] ?? ch).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32).replace(/-+$/, '') || 'project';
  const tail = Math.random().toString(36).slice(2, 6);
  return base + '-' + tail;
}

// Неразрывные пробелы — те же правила, что nb() в figma-landing/scripts/prelude.js,
// но для HTML: пробелом считается и перевод строки в исходнике.
const NB_WORDS = 'в|во|на|и|с|со|к|ко|у|о|об|обо|по|за|из|от|до|не|ни|а|но|да|же|ли|бы|для|без|при|под|над|про|что|или|как|из-за|из-под';
const NB_RE = new RegExp('(^|[\\s\\u00a0(«"„—-])(' + NB_WORDS + ')[ \\t\\r\\n]+', 'gi');
export function nb(s) {
  let prev;
  do { prev = s; s = s.replace(NB_RE, (m, a, w) => a + w + ' '); } while (s !== prev);
  s = s.replace(/[ \t\r\n]+—/g, ' —');
  return s.replace(/(\d)[ \t\r\n]+(?=[A-Za-zА-Яа-яЁё%₽€$])/g, '$1 ');
}

// Применяет nb() только к тексту между тегами: script, style, комментарии и атрибуты не трогает
export function typografHtml(html) {
  const parts = html.split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->|<[^>]*>)/i);
  return parts.map((p, i) => (i % 2 ? p : nb(p))).join('');
}

// Кладёт в репозиторий витрины актуальный просмотрщик, заглушку корня и служебные файлы
export function syncSite(cfg) {
  fs.mkdirSync(path.join(cfg.siteDir, 'viewer'), { recursive: true });
  for (const f of fs.readdirSync(path.join(SITE_TEMPLATE, 'viewer'))) {
    fs.copyFileSync(path.join(SITE_TEMPLATE, 'viewer', f), path.join(cfg.siteDir, 'viewer', f));
  }
  for (const f of ['robots.txt', '.nojekyll']) fs.copyFileSync(path.join(SITE_TEMPLATE, f), path.join(cfg.siteDir, f));
  const a = cfg.author || {};
  const root = fs.readFileSync(path.join(SITE_TEMPLATE, 'index.html'), 'utf8')
    .replaceAll('{{AUTHOR}}', esc(a.name || '')).replaceAll('{{ROLE}}', esc(cap(a.role || 'Веб-дизайн')))
    .replaceAll('{{TELEGRAM}}', esc(a.telegram || '#'));
  fs.writeFileSync(path.join(cfg.siteDir, 'index.html'), root);
}

export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
