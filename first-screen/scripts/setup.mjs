// Один раз: превращает папку витрины в публичный репозиторий GitHub и включает GitHub Pages.
// node setup.mjs — берёт siteDir и repo из config.json, нужен залогиненный gh.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig, syncSite } from './lib.mjs';

const cfg = loadConfig();
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: cfg.siteDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
const tryRun = (...a) => { try { return run(...a); } catch (e) { return null; } };

fs.mkdirSync(cfg.siteDir, { recursive: true });
syncSite(cfg);

if (!fs.existsSync(path.join(cfg.siteDir, '.git'))) run('git', ['init', '-b', 'main']);
run('git', ['add', '-A']);
if (tryRun('git', ['diff', '--cached', '--quiet']) === null) run('git', ['commit', '-m', 'Витрина концепций: просмотрщик']);

if (!tryRun('git', ['remote', 'get-url', 'origin'])) {
  run('gh', ['repo', 'create', cfg.repo, '--public', '--source', '.', '--remote', 'origin', '--push',
    '--description', 'Концепции первых экранов для заказчиков']);
} else {
  run('git', ['push', '-u', 'origin', 'main']);
}

const pages = tryRun('gh', ['api', `repos/${cfg.repo}/pages`]);
if (!pages) run('gh', ['api', '-X', 'POST', `repos/${cfg.repo}/pages`, '-f', 'source[branch]=main', '-f', 'source[path]=/']);

console.log(JSON.stringify({ repo: `https://github.com/${cfg.repo}`, site: cfg.baseUrl + '/' }, null, 2));
