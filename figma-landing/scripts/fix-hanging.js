// Убирает висячие предлоги в уже собранном макете: заменяет нужные пробелы на неразрывные
// посимвольно, поэтому двухцветные заголовки и другие смешанные стили сохраняются.
// Задай ROOT_IDS — фреймы страницы, «Спасибо» и доски компонентов (компоненты — чтобы обновились умолчания).
const ROOT_IDS = ['__PAGE_FRAME_ID__', '__THANKS_ID__', '__COMPONENTS_ID__'];
const NB_WORDS = 'в|во|на|и|с|со|к|ко|у|о|об|обо|по|за|из|от|до|не|ни|а|но|да|же|ли|бы|для|без|при|под|над|про|что|или|как|из-за|из-под';
const NB_RE = new RegExp('(^|[\\s(«"„—-])(' + NB_WORDS + ')[ \\t]+', 'gi');
function nb(s) { let prev; do { prev = s; s = s.replace(NB_RE, (m, a, w) => a + w + ' '); } while (s !== prev); s = s.replace(/[ \t]+—/g, ' —'); return s.replace(/(\d)[ \t]+(?=[A-Za-zА-Яа-яЁё%₽€$])/g, '$1 '); }
let changedNodes = 0, changedChars = 0; const errors = [];
for (const id of ROOT_IDS) {
  const root = await figma.getNodeByIdAsync(id); if (!root) continue;
  for (const t of root.findAllWithCriteria({ types: ['TEXT'] })) {
    if (t.hasMissingFont) continue;
    const src = t.characters; const dst = nb(src);
    if (src === dst || src.length !== dst.length) continue;   // nb() не меняет длину, только тип пробела
    try {
      for (const sg of t.getStyledTextSegments(['fontName'])) await figma.loadFontAsync(sg.fontName);
      for (let i = 0; i < src.length; i++) if (src[i] !== dst[i]) { t.insertCharacters(i + 1, dst[i], 'BEFORE'); t.deleteCharacters(i, i + 1); changedChars++; }
      changedNodes++;
    } catch (e) { errors.push({ id: t.id, name: t.name, e: String(e).slice(0, 80) }); }
  }
}
return { changedNodes, changedChars, errors: errors.slice(0, 20) };
