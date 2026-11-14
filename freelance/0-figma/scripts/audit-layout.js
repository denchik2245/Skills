// Вставь в use_figma и вызови: return await auditLayout(figma, [screenId, componentBoardId]);
// Только чтение. Кандидаты review требуют проверки человеком/агентом перед исправлением.
async function auditLayout(figma, rootIds) {
  if (!Array.isArray(rootIds) || rootIds.length === 0) {
    throw new Error('Передай непустой список ID проверяемых экранов/компонентов.');
  }
  const issues = [], review = [], coverage = [];
  const counts = { nodes: 0, textRanges: 0, colors: 0, components: 0, instances: 0 };
  const seen = new Set(), variables = new Map(), styles = new Map(), componentNames = new Map();
  const typography = ['fontName', 'fontSize', 'lineHeight', 'letterSpacing', 'textCase', 'textDecoration', 'paragraphSpacing', 'paragraphIndent'];
  const fields = ['textStyleId', 'fills', ...typography];
  function add(list, code, node, details = {}) {
    list.push({ code, nodeId: node.id, name: node.name, ...details });
  }
  function stable(value) {
    if (!value || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  }
  async function cached(map, id, getter) {
    if (!map.has(id)) map.set(id, await getter(id));
    return map.get(id);
  }
  async function color(node, alias, path) {
    counts.colors++;
    if (!alias || alias.type !== 'VARIABLE_ALIAS' || typeof alias.id !== 'string') {
      add(issues, 'UNBOUND_COLOR', node, { path });
      return;
    }
    try {
      const variable = await cached(variables, alias.id, id => figma.variables.getVariableByIdAsync(id));
      if (!variable || variable.resolvedType !== 'COLOR') {
        add(issues, 'INVALID_COLOR_VARIABLE', node, { path, variableId: alias.id });
      }
    } catch (error) {
      add(coverage, 'VARIABLE_READ_FAILED', node, { path, message: String(error) });
    }
  }
  async function paints(node, value, path) {
    if (!Array.isArray(value)) {
      add(coverage, 'PAINTS_UNREADABLE', node, { path });
      return;
    }
    for (let i = 0; i < value.length; i++) {
      const paint = value[i], at = path + '[' + i + ']';
      if (paint.type === 'SOLID') await color(node, paint.boundVariables && paint.boundVariables.color, at);
      else if (paint.type && paint.type.startsWith('GRADIENT_') && Array.isArray(paint.gradientStops)) {
        for (let j = 0; j < paint.gradientStops.length; j++) {
          const stop = paint.gradientStops[j];
          await color(node, stop.boundVariables && stop.boundVariables.color, at + '.gradientStops[' + j + ']');
        }
      } else if (paint.type !== 'IMAGE' && paint.type !== 'VIDEO') {
        add(coverage, 'PAINT_TYPE_NOT_AUDITED', node, { path: at, type: paint.type });
      }
    }
  }
  async function text(node) {
    if ('hasMissingFont' in node && node.hasMissingFont) add(issues, 'MISSING_FONT', node);
    let segments;
    try { segments = node.getStyledTextSegments(fields); }
    catch (error) {
      add(coverage, 'TEXT_RANGES_UNREADABLE', node, { message: String(error) });
      return;
    }
    if (!segments.length) add(review, 'EMPTY_TEXT', node);
    for (const segment of segments) {
      if (segment.end <= segment.start) continue;
      counts.textRanges++;
      const range = [segment.start, segment.end];
      await paints(node, segment.fills, 'text[' + range.join(':') + '].fills');
      if (typeof segment.textStyleId !== 'string' || !segment.textStyleId) {
        add(issues, 'MISSING_TEXT_STYLE', node, { range });
      } else {
        try {
          const style = await cached(styles, segment.textStyleId, id => figma.getStyleByIdAsync(id));
          if (!style || style.type !== 'TEXT') add(issues, 'INVALID_TEXT_STYLE', node, { range, styleId: segment.textStyleId });
          else {
            const different = typography.filter(key => key in segment && key in style && stable(segment[key]) !== stable(style[key]));
            if (different.length) add(review, 'TEXT_STYLE_DIFFERENCE', node, { range, styleId: style.id, fields: different });
          }
        } catch (error) {
          add(coverage, 'TEXT_STYLE_READ_FAILED', node, { range, message: String(error) });
        }
      }
      if (!Number.isInteger(segment.fontSize)) add(review, 'FRACTIONAL_FONT_SIZE', node, { range, value: segment.fontSize });
      if (segment.lineHeight && segment.lineHeight.unit === 'PIXELS' && !Number.isInteger(segment.lineHeight.value)) {
        add(review, 'FRACTIONAL_LINE_HEIGHT', node, { range, value: segment.lineHeight.value });
      }
    }
  }
  function transformed(node) {
    for (let cursor = node; cursor && cursor.type !== 'PAGE'; cursor = cursor.parent) {
      if ('rotation' in cursor && Math.abs(cursor.rotation) > 0.01) return true;
    }
    return false;
  }
  async function visit(node) {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    counts.nodes++;
    if (node.type === 'COMPONENT') {
      counts.components++;
      const previous = componentNames.get(node.name);
      if (previous) add(review, 'SAME_COMPONENT_NAME', node, { otherNodeId: previous });
      else componentNames.set(node.name, node.id);
    }
    if (node.type === 'INSTANCE') counts.instances++;
    if ('visible' in node && node.visible === false) add(review, 'HIDDEN_NODE', node);
    if ('opacity' in node && node.opacity === 0) add(review, 'TRANSPARENT_NODE', node);
    if (/^(?:Frame|Rectangle|Group|Text|Vector|Component|Instance|Ellipse)\s+\d+$/i.test(node.name)) {
      add(review, 'DEFAULT_LAYER_NAME', node);
    }
    if (['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'RECTANGLE', 'ELLIPSE', 'TEXT'].includes(node.type)) {
      const geometry = transformed(node) ? ['width', 'height'] : ['x', 'y', 'width', 'height'];
      const fractional = geometry.filter(key => key in node && typeof node[key] === 'number' && Math.abs(node[key] - Math.round(node[key])) > 0.01);
      if (fractional.length) add(review, 'FRACTIONAL_GEOMETRY', node, { fields: fractional });
    }
    if (node.type === 'TEXT') await text(node);
    else {
      if ('characters' in node) add(coverage, 'SPECIAL_TEXT_NOT_AUDITED', node, { type: node.type });
      if ('fills' in node) await paints(node, node.fills, 'fills');
    }
    if ('strokes' in node) await paints(node, node.strokes, 'strokes');
    if ('effects' in node && Array.isArray(node.effects)) {
      for (let i = 0; i < node.effects.length; i++) {
        const effect = node.effects[i];
        if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
          await color(node, effect.boundVariables && effect.boundVariables.color, 'effects[' + i + '].color');
        } else if (effect.type !== 'LAYER_BLUR' && effect.type !== 'BACKGROUND_BLUR') {
          add(coverage, 'EFFECT_TYPE_NOT_AUDITED', node, { index: i, type: effect.type });
        }
      }
    }
    if ('children' in node) {
      for (const child of node.children) await visit(child);
    }
  }
  if (figma.skipInvisibleInstanceChildren) {
    coverage.push({ code: 'INVISIBLE_INSTANCE_CHILDREN_MAY_BE_SKIPPED' });
  }
  for (const id of rootIds) {
    const root = await figma.getNodeByIdAsync(id);
    if (!root || root.type === 'PAGE' || root.type === 'DOCUMENT') {
      issues.push({ code: 'INVALID_ROOT', nodeId: id, message: 'Нужен конкретный экран или доска компонентов, не вся страница/документ.' });
    } else await visit(root);
  }
  return { rootIds, counts, issues, review, coverage };
}
