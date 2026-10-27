// Просмотрщик вариантов первого экрана. Данные проекта лежат в <script id="data"> страницы проекта.
(() => {
  const data = JSON.parse(document.getElementById('data').textContent);
  const variants = data.variants || [];
  const $ = id => document.getElementById(id);
  const MOBILE = window.matchMedia('(max-width: 760px)');
  const W = 1920;

  const view = $('view');
  const stage = document.querySelector('.stage');
  const bar = document.querySelector('.bar');
  const chrome = document.querySelector('.frame__chrome');
  const frames = {};
  let current = null;

  $('url').textContent = data.domain || data.title || '';

  // Вкладки
  const tabs = $('tabs');
  variants.forEach(v => {
    const b = document.createElement('button');
    b.className = 'tab'; b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.id = v.id;
    b.innerHTML = '<span class="tab__key"></span><span class="tab__name"></span>';
    b.querySelector('.tab__key').textContent = v.id;
    b.querySelector('.tab__name').textContent = v.name || 'Вариант ' + v.id.toUpperCase();
    b.addEventListener('click', () => show(v.id, true));
    tabs.appendChild(b);
  });
  if (variants.length < 2) { tabs.classList.add('tabs--single'); $('pager').classList.add('pager--single'); }

  function frameFor(v) {
    if (frames[v.id]) return frames[v.id];
    const f = { iframe: null, img: null };
    f.img = document.createElement('img');
    f.img.alt = (data.title || '') + ' — ' + (v.name || v.id);
    f.img.decoding = 'async';
    f.img.title = 'Открыть в полном размере';
    f.img.addEventListener('click', () => window.open(v.png, '_blank', 'noopener'));
    view.appendChild(f.img);
    frames[v.id] = f;
    return f;
  }

  // Шапка подстраивается под ширину: сначала кнопки становятся иконками, потом вкладки уходят на вторую строку
  function fitBar() {
    bar.classList.remove('bar--compact', 'bar--stacked');
    const over = () => tabs.scrollWidth > tabs.clientWidth + 1 || bar.scrollWidth > bar.clientWidth + 1;
    if (over()) bar.classList.add('bar--compact');
    if (over()) bar.classList.add('bar--stacked');
  }

  // На широком экране — живой HTML в масштабе, на телефоне — готовый PNG
  function render() {
    const v = variants.find(x => x.id === current);
    if (!v) return;
    fitBar();
    const f = frameFor(v);
    const h = v.height || 1080;
    $('size').textContent = W + ' × ' + h;
    for (const [id, g] of Object.entries(frames)) {
      const on = id === current;
      if (g.iframe) g.iframe.hidden = !on || MOBILE.matches;
      g.img.hidden = !on || !MOBILE.matches;
    }
    if (MOBILE.matches) {
      if (!f.img.src) f.img.src = v.png;
      view.style.height = '';
      stage.style.removeProperty('--fit-w');
      return;
    }
    if (!f.iframe) {
      f.iframe = document.createElement('iframe');
      f.iframe.src = v.file;
      f.iframe.title = f.img.alt;
      f.iframe.scrolling = 'no';
      f.iframe.setAttribute('tabindex', '-1');
      view.appendChild(f.iframe);
    }
    // Экран 1920×1080 целиком помещается в окно: масштаб по ширине или по высоте, что меньше
    const st = getComputedStyle(stage);
    const availW = stage.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight) - 2;
    const availH = window.innerHeight - bar.offsetHeight - parseFloat(st.paddingTop) - chrome.offsetHeight - 104;
    const fit = Math.max(0.3, Math.min(availW / W, availH / 1080));
    stage.style.setProperty('--fit-w', Math.floor(W * fit) + 2 + 'px');
    const s = view.clientWidth / W;
    f.iframe.style.height = h + 'px';
    f.iframe.style.transform = 'scale(' + s + ')';
    view.style.height = Math.round(h * s) + 'px';
  }

  function show(id, push) {
    const i = Math.max(0, variants.findIndex(v => v.id === id));
    const v = variants[i];
    if (!v) return;
    current = v.id;
    for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.id === v.id));
    tabs.children[i] && tabs.children[i].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    $('vname').textContent = 'Вариант ' + v.id.toUpperCase() + (v.name ? ' · ' + v.name : '');
    $('vabout').textContent = v.about || '';
    $('count').textContent = (i + 1) + ' / ' + variants.length;
    $('download').href = v.png;
    $('download').setAttribute('download', (data.slug || 'concept') + '-' + v.id + '.png');
    $('full').href = v.file;
    if (push && location.hash !== '#' + v.id) history.replaceState(null, '', '#' + v.id);
    render();
  }

  function step(d) {
    const i = variants.findIndex(v => v.id === current);
    show(variants[(i + d + variants.length) % variants.length].id, true);
  }
  $('prev').addEventListener('click', () => step(-1));
  $('next').addEventListener('click', () => step(1));
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });

  // Ссылка копируется вместе с выбранным вариантом
  const toast = $('toast');
  let toastTimer;
  function say(msg) {
    toast.textContent = msg;
    toast.classList.add('toast--on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('toast--on'), 2200);
  }
  $('copy').addEventListener('click', async () => {
    const url = location.href.split('#')[0] + '#' + current;
    try { await navigator.clipboard.writeText(url); }
    catch {
      const t = document.createElement('textarea');
      t.value = url; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch {}
      t.remove();
    }
    say('Ссылка на вариант ' + current.toUpperCase() + ' скопирована');
  });

  window.addEventListener('resize', render);
  MOBILE.addEventListener('change', render);
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  show(location.hash.slice(1) || (variants[0] && variants[0].id));
})();
