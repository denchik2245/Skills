// Просмотрщик концепции: первый экран (десктоп + телефон) и пояснения к решениям.
// Данные проекта лежат в <script id="data"> страницы проекта.
(() => {
  const data = JSON.parse(document.getElementById('data').textContent);
  const desk = data.screens.desktop;
  const mob = data.screens.mobile;
  const notes = (data.notes || []).filter(n => n.box);
  const $ = id => document.getElementById(id);
  const MOBILE = window.matchMedia('(max-width: 760px)');
  const DW = 1920, MW = 375, MH = 812, BEZEL = 10, CHROME = 40, GAP = 32;

  const bar = document.querySelector('.bar');
  const stage = $('stage');
  const deskFrame = $('deskFrame'), deskView = $('deskView');
  const phoneWrap = $('phoneWrap'), phoneFrame = $('phoneFrame'), phoneView = $('phoneView');

  for (const el of document.querySelectorAll('.frame__url')) el.textContent = data.domain || data.title || '';
  $('deskSize').textContent = DW + ' × ' + desk.height;

  // Скачивание и ссылка
  const slug = data.slug || 'concept';
  $('dlDesktop').href = desk.png;
  $('dlDesktop').setAttribute('download', slug + '-desktop.png');
  if (mob) {
    $('dlMobile').href = mob.png;
    $('dlMobile').setAttribute('download', slug + '-mobile.png');
  } else {
    $('dlMobile').hidden = true;
    phoneWrap.hidden = true;
  }

  const toast = $('toast');
  let toastTimer;
  function say(msg) {
    toast.textContent = msg;
    toast.classList.add('toast--on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('toast--on'), 2200);
  }
  $('copy').addEventListener('click', async () => {
    const url = location.href.split('#')[0];
    try { await navigator.clipboard.writeText(url); }
    catch {
      const t = document.createElement('textarea');
      t.value = url; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch {}
      t.remove();
    }
    say('Ссылка скопирована');
  });

  // Если кнопки не помещаются в строку, они становятся иконками
  function fitBar() {
    bar.classList.remove('bar--compact');
    if (bar.scrollWidth > bar.clientWidth + 1) bar.classList.add('bar--compact');
  }

  // Живая вёрстка в iframe создаётся один раз; на телефоне вместо неё — готовые PNG
  let deskIframe, phoneIframe, deskImg, phoneImg;
  function iframe(src, cls) {
    const f = document.createElement('iframe');
    f.src = src; f.title = data.title || ''; f.setAttribute('tabindex', '-1');
    if (cls) f.className = cls;
    return f;
  }
  function img(src) {
    const i = document.createElement('img');
    i.src = src; i.alt = data.title || ''; i.decoding = 'async';
    return i;
  }

  function layoutWide() {
    if (!deskIframe) {
      deskIframe = iframe(desk.file);
      deskIframe.scrolling = 'no';
      deskView.appendChild(deskIframe);
      if (mob) {
        phoneIframe = iframe(mob.file);
        // Прячем полосу прокрутки внутри телефона — как на настоящем экране
        phoneIframe.addEventListener('load', () => {
          try {
            const s = phoneIframe.contentDocument.createElement('style');
            s.textContent = 'html{scrollbar-width:none}html::-webkit-scrollbar{display:none}';
            phoneIframe.contentDocument.head.appendChild(s);
          } catch {}
        });
        phoneView.appendChild(phoneIframe);
      }
    }
    for (const el of [deskImg, phoneImg]) if (el) el.hidden = true;
    deskIframe.hidden = false;
    if (phoneIframe) phoneIframe.hidden = false;

    // Высота экрана десктопа Hs такая, чтобы окно и телефон стояли рядом одной высоты и целиком помещались
    const st = getComputedStyle(stage);
    const availW = stage.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight) - 4;
    const hint = mob ? 32 : 0;
    const availH = window.innerHeight - bar.offsetHeight - parseFloat(st.paddingTop) - parseFloat(st.paddingBottom) - CHROME - hint - 4;
    const dH = desk.height;
    let Hs = mob
      ? (availW - GAP - 2 * BEZEL - MW * (CHROME - 2 * BEZEL) / MH) / (DW / dH + MW / MH)
      : availW * dH / DW;
    Hs = Math.max(200, Math.min(Hs, availH));

    const s = Hs / dH;
    deskFrame.style.width = Math.floor(DW * s) + 2 + 'px';
    deskView.style.height = Math.round(Hs) + 'px';
    deskIframe.style.height = dH + 'px';
    deskIframe.style.transform = 'scale(' + (deskView.clientWidth / DW) + ')';

    if (mob) {
      const sp = (Hs + CHROME - 2 * BEZEL) / MH;
      phoneView.style.width = Math.round(MW * sp) + 'px';
      phoneView.style.height = Math.round(MH * sp) + 'px';
      phoneIframe.style.transform = 'scale(' + (phoneView.clientWidth / MW) + ')';
    }
  }

  function layoutNarrow() {
    if (!deskImg) {
      deskImg = img(desk.png);
      deskView.appendChild(deskImg);
      if (mob) { phoneImg = img(mob.png); phoneView.appendChild(phoneImg); }
    }
    for (const el of [deskIframe, phoneIframe]) if (el) el.hidden = true;
    deskImg.hidden = false;
    if (phoneImg) phoneImg.hidden = false;
    deskFrame.style.width = '';
    deskView.style.height = '';
    if (mob) {
      const w = Math.min(320, stage.clientWidth - 64);
      phoneView.style.width = w + 'px';
      phoneView.style.height = Math.round(w * MH / MW) + 'px';
    }
  }

  function render() {
    fitBar();
    if (MOBILE.matches) layoutNarrow(); else layoutWide();
  }

  // Пояснения: метки на картинке десктопа и список; наведение подсвечивает пару
  const why = $('why');
  if (!notes.length) why.hidden = true;
  else {
    const shot = $('shot');
    $('shotImg').src = desk.png;
    const list = $('notes');
    const pct = (v, total) => (v / total * 100) + '%';
    const items = notes.map((n, i) => {
      const num = i + 1;
      const pin = document.createElement('button');
      pin.type = 'button'; pin.className = 'pin'; pin.textContent = num;
      pin.setAttribute('aria-label', 'Пояснение ' + num + ': ' + n.title);
      // Метка стоит рядом с элементом, а не на нём: слева по умолчанию, side в meta.json меняет сторону
      const side = ['right', 'top', 'bottom'].includes(n.side) ? n.side : 'left';
      const ax = { left: n.box.x, right: n.box.x + n.box.w, top: n.box.x + n.box.w / 2, bottom: n.box.x + n.box.w / 2 }[side];
      const ay = { left: n.box.y + n.box.h / 2, right: n.box.y + n.box.h / 2, top: n.box.y, bottom: n.box.y + n.box.h }[side];
      pin.classList.add('pin--' + side);
      pin.style.left = pct(ax, DW);
      pin.style.top = pct(ay, desk.height);
      const hl = document.createElement('div');
      hl.className = 'hl';
      hl.style.left = pct(n.box.x, DW);
      hl.style.top = pct(n.box.y, desk.height);
      hl.style.width = pct(n.box.w, DW);
      hl.style.height = pct(n.box.h, desk.height);
      shot.append(hl, pin);

      const li = document.createElement('li');
      li.className = 'note'; li.tabIndex = 0;
      li.innerHTML = '<span class="note__n"></span><div><p class="note__title"></p><p class="note__text"></p></div>';
      li.querySelector('.note__n').textContent = num;
      li.querySelector('.note__title').textContent = n.title;
      li.querySelector('.note__text').textContent = n.text;
      list.appendChild(li);
      return { pin, hl, li };
    });
    const set = (on) => items.forEach((it, i) => {
      for (const el of [it.pin, it.hl, it.li]) el.classList.toggle('is-on', i === on);
    });
    items.forEach((it, i) => {
      for (const el of [it.pin, it.li]) {
        el.addEventListener('mouseenter', () => set(i));
        el.addEventListener('focus', () => set(i));
        el.addEventListener('mouseleave', () => set(-1));
        el.addEventListener('blur', () => set(-1));
      }
      it.pin.addEventListener('click', () => {
        set(i);
        it.li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    });
  }

  window.addEventListener('resize', render);
  MOBILE.addEventListener('change', render);
  render();
})();
