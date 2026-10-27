// Публикует проект на GitHub Pages и ждёт, пока ссылка заработает: node publish.mjs <slug>
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig, projectDir, readJson, die } from './lib.mjs';

const slug = process.argv[2];
const cfg = loadConfig();
const dir = projectDir(cfg, slug);
const meta = readJson(path.join(dir, 'meta.json'));
if (!meta.variants?.length || !meta.variants.every(v => v.height)) die('Сначала собери проект: node build.mjs ' + slug);

const run = (cmd, args) => execFileSync(cmd, args, { cwd: cfg.siteDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryRun = (...a) => { try { return run(...a); } catch { return null; } };
if (!tryRun('git', ['remote', 'get-url', 'origin'])) die('Витрина ещё не на GitHub. Один раз выполни: node setup.mjs');

run('git', ['add', '-A']);
if (tryRun('git', ['diff', '--cached', '--quiet']) === null) run('git', ['commit', '-m', `${slug}: ${meta.title}`]);
run('git', ['push', 'origin', 'HEAD']);
const head = run('git', ['rev-parse', 'HEAD']);

// Ждём сборку Pages для этого коммита, затем проверяем, что страница и превью отдаются
const url = `${cfg.baseUrl}/${slug}/`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const deadline = Date.now() + 5 * 60 * 1000;
let status = 'unknown';
while (Date.now() < deadline) {
  const b = tryRun('gh', ['api', `repos/${cfg.repo}/pages/builds/latest`]);
  if (b) {
    const j = JSON.parse(b);
    status = j.status;
    if (j.commit === head && j.status === 'built') break;
    if (j.commit === head && j.status === 'errored') die('GitHub Pages не собрал сайт: ' + (j.error?.message || 'ошибка'));
  }
  await sleep(5000);
}
let ok = false;
for (let i = 0; i < 12 && !ok; i++) {
  const [page, og] = await Promise.all([url, url + 'og.jpg'].map(u => fetch(u, { cache: 'no-store' }).then(r => r.ok).catch(() => false)));
  ok = page && og;
  if (!ok) await sleep(5000);
}

console.log(JSON.stringify({
  url,
  live: ok,
  pagesBuild: status,
  links: meta.variants.map(v => ({ id: v.id, name: v.name, url: url + '#' + v.id })),
  attach: meta.variants.map(v => path.join(dir, v.jpg)),
}, null, 2));
if (!ok) console.error('⚠ Ссылка пока не отвечает — Pages иногда обновляется дольше. Проверь через минуту.');
