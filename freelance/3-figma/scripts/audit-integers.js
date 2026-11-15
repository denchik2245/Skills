// Финальная проверка: дробные координаты округляются, дробные размеры возвращаются списком.
// Задай ROOT_IDS — фреймы страницы, «Спасибо» и доски компонентов.
const ROOT_IDS = ['__PAGE_FRAME_ID__', '__THANKS_ID__', '__COMPONENTS_ID__'];
const roots = []; for (const id of ROOT_IDS) { const n = await figma.getNodeByIdAsync(id); if (n) roots.push(n); }
const bad = []; let fixed = 0;
for (const r of roots) for (const n of r.findAll(() => true)) {
  if (n.rotation && Math.abs(n.rotation) > 0.01) continue;             // наклонённые фото и декор пропускаем
  if (n.parent && n.parent.type === 'INSTANCE') continue;              // дети инстансов не двигаются
  if (n.type === 'VECTOR' || (n.parent && n.parent.name && n.parent.name.startsWith('icon/'))) continue;
  const fx = Math.round(n.x), fy = Math.round(n.y);
  if (Math.abs(n.x - fx) > 0.01 || Math.abs(n.y - fy) > 0.01) { try { n.x = fx; n.y = fy; fixed++; } catch (e) {} }
  if ('resize' in n && (Math.abs(n.width - Math.round(n.width)) > 0.01 || Math.abs(n.height - Math.round(n.height)) > 0.01)) bad.push({ id: n.id, name: n.name, w: n.width, h: n.height });
  if (n.type === 'TEXT' && typeof n.fontSize === 'number' && n.fontSize % 1) bad.push({ id: n.id, name: n.name, fontSize: n.fontSize });
}
return { fixed, badCount: bad.length, bad: bad.slice(0, 40) };
