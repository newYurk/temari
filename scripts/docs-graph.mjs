/**
 * The graph the project already has, drawn from the documents themselves.
 *
 * Nothing here is written by hand: nodes are the markdown files, edges are the
 * links they already carry, and the issue numbers are the ones they mention. A
 * drawing that is derived cannot drift from what it draws — the moment a
 * document loses a link, the picture loses the edge.
 *
 * Usage: node scripts/docs-graph.mjs [outDir]   (default screenshots/docs-graph)
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join, relative, dirname, resolve } from 'node:path';

const root = process.cwd();
const out = process.argv[2] ?? 'screenshots/docs-graph';
const SKIP = new Set(['node_modules', '.git', 'dist', 'screenshots', '.claude', 'public']);
const GROUPS = [
  { dir: 'spec', name: 'Спецификации', color: '#8f3d32' },
  { dir: 'docs', name: 'Документы', color: '#3d5f86' },
  { dir: 'reviews', name: 'Ревью', color: '#6b5b4a' },
  { dir: 'src', name: 'Правила в коде', color: '#2a2420' },
];

async function markdownFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await markdownFiles(full));
    else if (entry.name.endsWith('.md')) found.push(full);
  }
  return found;
}

const groupOf = (path) => GROUPS.find((g) => path.startsWith(g.dir + '/'))?.name ?? 'Корень';
const idOf = (path) => 'n' + path.replace(/[^a-zA-Z0-9]/g, '_');

const files = (await markdownFiles(root)).map((f) => relative(root, f)).sort();
const nodes = new Map();
const edges = [];
const issues = new Map();

for (const file of files) {
  const text = await readFile(join(root, file), 'utf8');
  const lines = text.split('\n').length;
  nodes.set(file, { file, lines, group: groupOf(file) });
  // links to other documents of this repository, exactly as they are written
  for (const [, target] of text.matchAll(/\]\(([^)\s]+\.md)(?:#[^)\s]*)?\)/g)) {
    if (target.startsWith('http')) continue;
    const to = relative(root, resolve(dirname(join(root, file)), target));
    if (to.startsWith('..')) continue;
    edges.push({ from: file, to });
  }
  // issues the document points at
  for (const [, n] of text.matchAll(/(?:issues\/|#)(\d{1,3})\b/g)) {
    const key = `#${n}`;
    issues.set(key, (issues.get(key) ?? new Set()).add(file));
  }
}

const known = new Set(nodes.keys());
const real = edges.filter((e) => known.has(e.to) && e.from !== e.to);
const dangling = edges.filter((e) => !known.has(e.to));
const degree = new Map();
for (const e of real) {
  degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
}

const mermaid = [
  'graph LR',
  ...GROUPS.concat([{ dir: '', name: 'Корень', color: '#6b5b4a' }]).map((g) => {
    const inGroup = [...nodes.values()].filter((n) => n.group === g.name);
    if (inGroup.length === 0) return '';
    return [
      `  subgraph ${idOf(g.name)}["${g.name}"]`,
      ...inGroup.map((n) => `    ${idOf(n.file)}["${n.file.split('/').pop()}<br/>${n.lines} строк"]`),
      '  end',
    ].join('\n');
  }).filter(Boolean),
  ...[...new Set(real.map((e) => `  ${idOf(e.from)} --> ${idOf(e.to)}`))],
].join('\n');

await mkdir(out, { recursive: true });
await writeFile(join(out, 'docs-graph.mmd'), mermaid + '\n');

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Темари — что на что ссылается</title>
<style>
 body { margin: 0; background: #efece6; color: #2a2420; font: 15px/1.5 "IBM Plex Sans", system-ui, sans-serif; }
 header { padding: 18px 20px 6px; } h1 { font: 500 22px/1.2 "Cormorant Garamond", Georgia, serif; margin: 0 0 4px; }
 p { margin: 4px 0; color: #5a5149; } .mermaid { padding: 8px 12px 24px; }
 table { border-collapse: collapse; margin: 0 20px 28px; font-size: 13px; }
 td, th { border-bottom: 1px solid #ddd6cc; padding: 4px 10px; text-align: left; vertical-align: top; }
 code { background: #e4e0d8; padding: 1px 4px; border-radius: 3px; }
</style></head><body>
<header><h1>Что на что ссылается</h1>
<p>${nodes.size} документов, ${new Set(real.map((e) => e.from + '→' + e.to)).size} ссылок между ними, ${issues.size} упомянутых задач. Собрано из самих файлов: ничего не написано руками.</p></header>
<pre class="mermaid">${mermaid.replace(/</g, '&lt;')}</pre>
<h2 style="margin:0 20px 6px;font:500 17px/1.2 Georgia,serif">Куда ссылаются чаще всего</h2>
<table><tr><th>Документ</th><th>Связей</th><th>Строк</th></tr>
${[...degree.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  .map(([f, d]) => `<tr><td><code>${f}</code></td><td>${d}</td><td>${nodes.get(f)?.lines ?? ''}</td></tr>`).join('\n')}
</table>
<h2 style="margin:0 20px 6px;font:500 17px/1.2 Georgia,serif">Задачи, на которые ссылаются документы</h2>
<table><tr><th>Задача</th><th>Где упомянута</th></tr>
${[...issues.entries()].sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1)))
  .map(([n, where]) => `<tr><td>${n}</td><td>${[...where].map((w) => `<code>${w}</code>`).join(' ')}</td></tr>`).join('\n')}
</table>
${dangling.length ? `<h2 style="margin:0 20px 6px;font:500 17px/1.2 Georgia,serif">Ссылки в никуда</h2><table>${
  dangling.map((e) => `<tr><td><code>${e.from}</code></td><td>→ <code>${e.to}</code></td></tr>`).join('')}</table>` : ''}
<script type="module">
 import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
 mermaid.initialize({ startOnLoad: true, theme: 'base', themeVariables: {
   primaryColor: '#e4e0d8', primaryTextColor: '#2a2420', lineColor: '#8a8178', fontSize: '13px' } });
</script></body></html>`;
await writeFile(join(out, 'docs-graph.html'), html);

console.log(JSON.stringify({
  documents: nodes.size,
  links: new Set(real.map((e) => e.from + '→' + e.to)).size,
  issues: issues.size,
  dangling: dangling.length,
  out: join(out, 'docs-graph.html'),
}, null, 1));
