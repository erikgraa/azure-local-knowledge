/**
 * Tiny, defensive Markdown scanner: headings, fenced code, plain text, tables.
 * Not a full parser - just enough structure for the Azure Local docs.
 */

const FENCE_OPEN = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;

export function scanMarkdown(md) {
  const src = String(md ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const nodes = [];
  let fence = null;
  let buf = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      const close = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === fence.marker && close[1].length >= fence.len) {
        nodes.push({ type: 'fence', lang: fence.lang, text: buf.join('\n').trim(), line: fence.line });
        fence = null;
        buf = [];
      } else {
        buf.push(line.replace(/^ {0,3}/, ''));
      }
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (open) {
      fence = { marker: open[1][0], len: open[1].length, lang: (open[2] || '').toLowerCase(), line: i };
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      nodes.push({ type: 'heading', level: h[1].length, text: h[2].trim(), line: i });
      continue;
    }
    nodes.push({ type: 'text', text: line, line: i });
  }
  // An unterminated fence still holds content worth keeping.
  if (fence && buf.length) nodes.push({ type: 'fence', lang: fence.lang, text: buf.join('\n').trim(), line: fence.line });
  return nodes;
}

/** Group nodes into sections that each start at a heading (index 0 = preamble with level 0). */
export function toSections(nodes) {
  const sections = [{ level: 0, title: '', nodes: [] }];
  for (const n of nodes) {
    if (n.type === 'heading') sections.push({ level: n.level, title: n.text, nodes: [] });
    else sections[sections.length - 1].nodes.push(n);
  }
  return sections;
}

/** A section plus all following deeper-level sections. */
export function sectionWithChildren(sections, index) {
  const base = sections[index];
  const out = [base];
  for (let i = index + 1; i < sections.length && sections[i].level > base.level; i++) out.push(sections[i]);
  return out;
}

export function nodesProse(nodes) {
  return nodes
    .filter((n) => n.type === 'text')
    .map((n) => n.text)
    .join('\n');
}

/** Split a Markdown table row, honouring `code | spans` and \| escapes. */
export function splitRow(line) {
  const cells = [];
  let cur = '';
  let inCode = false;
  const s = line.trim();
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '`') inCode = !inCode;
    if (c === '|' && !inCode && s[i - 1] !== '\\') {
      cells.push(cur);
      cur = '';
      continue;
    }
    cur += c === '\\' && s[i + 1] === '|' ? '' : c;
  }
  cells.push(cur);
  if (s.startsWith('|')) cells.shift();
  if (s.endsWith('|') && s[s.length - 2] !== '\\') cells.pop();
  return cells.map((c) => c.trim());
}

const SEPARATOR_ROW = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** Find pipe tables in an array of lines. */
export function parseTables(lines) {
  const tables = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].trim().startsWith('|') || !SEPARATOR_ROW.test(lines[i + 1])) continue;
    const header = splitRow(lines[i]);
    const rows = [];
    let j = i + 2;
    for (; j < lines.length && lines[j].trim().startsWith('|'); j++) rows.push(splitRow(lines[j]));
    tables.push({ header, rows, line: i });
    i = j - 1;
  }
  return tables;
}
