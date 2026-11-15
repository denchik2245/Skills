#!/usr/bin/env python3
"""Готовит картинки к загрузке в Tilda: размер под реальный показ ×2, WebP, бюджет веса, понятные имена.

  python3 optimize_images.py --reports 01-hero.zero.report.json,02-menu.zero.report.json \
      --src raw/ --out web/ --prefix plume [--retina 2] [--max 2560] [--quality 80] [--budget 250]

raw/ — исходники, скачанные по ссылкам download_assets, с именем <key>.<расширение>
(key — поле key из images отчёта to-zero.mjs, двоеточие в ID узла заменено на «-»).
Пишет web/<prefix>-<имя слоя>.webp и web/manifest.json: файл, размер, вес, исходный вес.
Нужен Pillow (python3 -m pip install --user pillow).
"""
import argparse
import json
import re
from pathlib import Path

from PIL import Image

TRANSLIT = dict(zip(
    'абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
    ['a', 'b', 'v', 'g', 'd', 'e', 'e', 'zh', 'z', 'i', 'y', 'k', 'l', 'm', 'n', 'o', 'p', 'r', 's', 't', 'u', 'f',
     'h', 'ts', 'ch', 'sh', 'sch', '', 'y', '', 'e', 'yu', 'ya']))


def slug(text):
    text = re.sub(r'([a-zа-яё])([A-ZА-ЯЁ])', r'\1-\2', text)
    text = ''.join(TRANSLIT.get(c, c) for c in text.lower())
    return re.sub(r'[^a-z0-9]+', '-', text).strip('-')[:48] or 'image'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--reports', required=True)
    ap.add_argument('--src', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--prefix', default='')
    ap.add_argument('--retina', type=float, default=2)
    ap.add_argument('--max', type=int, default=2560)
    ap.add_argument('--quality', type=int, default=80)
    ap.add_argument('--budget', type=int, default=250, help='KB на одну картинку')
    a = ap.parse_args()

    uses = {}
    for path in a.reports.split(','):
        for img in json.loads(Path(path).read_text(encoding='utf8')).get('images', []):
            u = uses.setdefault(img['key'], dict(img))
            u['maxW'] = max(u['maxW'], img['maxW'])
            u['maxH'] = max(u['maxH'], img['maxH'])

    src, out = Path(a.src), Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    names, manifest, problems = set(), [], []
    for key, u in uses.items():
        files = [p for p in src.glob(key.replace(':', '-') + '.*') if p.suffix.lower() != '.svg']
        if not files:
            problems.append({'key': key, 'name': u['name'], 'problem': 'нет исходника в ' + str(src)})
            continue
        file = files[0]
        im = Image.open(file)
        im.load()
        sw, sh = im.size
        need = a.retina * max(u['maxW'], u['maxH'] * sw / sh)
        width = int(min(sw, a.max, max(need, 1)))
        height = round(sh * width / sw)
        if width < sw:
            im = im.resize((width, height), Image.LANCZOS)
        alpha = im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info)
        im = im.convert('RGBA' if alpha else 'RGB')

        base = (a.prefix + '-' if a.prefix else '') + slug(u['name'])
        name, n = base, 2
        while name in names:
            name, n = f'{base}-{n}', n + 1
        names.add(name)
        target = out / (name + '.webp')
        quality = a.quality
        while True:
            im.save(target, 'WEBP', quality=quality, method=6)
            size = target.stat().st_size
            if size <= a.budget * 1024 or quality <= 60:
                break
            quality -= 5
        row = {'key': key, 'name': u['name'], 'file': target.name, 'w': width, 'h': height,
               'kb': round(size / 1024), 'quality': quality, 'sourceKb': round(file.stat().st_size / 1024),
               'sourceSize': [sw, sh], 'shownMax': [u['maxW'], u['maxH']]}
        if need > sw:
            row['note'] = f'исходник меньше нужного ({sw} < {round(need)} px) — на ретине будет мягче'
        if size > a.budget * 1024:
            row['note'] = f'больше бюджета {a.budget} KB даже при качестве 60'
        manifest.append(row)

    (out / 'manifest.json').write_text(json.dumps({'images': manifest, 'problems': problems}, ensure_ascii=False, indent=1), encoding='utf8')
    total_src = sum(r['sourceKb'] for r in manifest)
    total = sum(r['kb'] for r in manifest)
    print(json.dumps({'images': len(manifest), 'problems': len(problems), 'sourceKb': total_src, 'webpKb': total,
                      'overBudget': [r['file'] for r in manifest if r['kb'] > a.budget]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
