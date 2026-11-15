// Вставляй в use_figma перед созданием русского текста. Не применяй к URL, коду и артикулам.
// Для существующего rich text сначала вычисли отличия, затем замени пробелы по диапазонам.
function nb(value) {
  if (typeof value !== 'string') return value;
  const words = 'в|во|на|и|с|со|к|ко|у|о|об|обо|по|за|из|от|до|не|ни|а|но|да|же|ли|бы|для|без|при|под|над|про|что|или|как|из-за|из-под';
  const pattern = new RegExp('(^|[\\s(«"„—-])(' + words + ')[ \\t]+', 'gi');
  let previous;
  do {
    previous = value;
    value = value.replace(pattern, (match, prefix, word) => prefix + word + '\u00a0');
  } while (value !== previous);
  return value.replace(/[ \t]+—/g, '\u00a0—')
    .replace(/(\d)[ \t]+(?=[A-Za-zА-Яа-яЁё%₽€$])/g, '$1\u00a0');
}
