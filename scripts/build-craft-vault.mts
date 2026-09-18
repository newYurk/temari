/**
 * Карта ремесла как хранилище Obsidian — собрана из данных самой игры.
 *
 * Узлы: узоры, разметки, стежки, нити, размеры шара и три этапа работы.
 * Рёбра: то, что уже записано в `src/components/temari/library.ts` — какой узор
 * на какой разметке живёт, каким стежком шьётся, какая нить на каком этапе.
 * Руками здесь не пишется ничего: добавили строку в каталог — узел появился сам,
 * и разойтись с игрой он не может, потому что игра читает тот же файл.
 *
 * Сборка:  npx tsx scripts/build-craft-vault.mts --write
 * Проверка: npx tsx scripts/build-craft-vault.mts --check   (для CI)
 */
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import {
  DIVISION_CATALOG, MARI_CATALOG, MOTIF_CATALOG, STITCH_CATALOG, YARN_CATALOG,
  type CatalogName, type CatalogStatus,
} from '../src/components/temari/library.ts';
import { motifSupport, type MotifId } from '../src/components/temari/patterns.ts';
import { CRAFT_ACTIONS } from '../src/components/temari/actions.ts';

/**
 * Достижимость: что из каталога на самом деле выбирается в мастерской.
 * `appears` говорит, где узел показан, `motifSupport` — есть ли под ним рецепт,
 * а список действий — существует ли кнопка. Расхождение между «показано» и
 * «шьётся» здесь видно сразу: именно оно однажды увело владельца на C8.
 */
const ACTION_IDS = new Set(CRAFT_ACTIONS.map((a) => a.id));
const UI_DIVISION: Record<string, string> = { s8: 'jiwari-simple', c8: 'jiwari-c8', c10: 'jiwari-c10' };
const UI_MOTIF: Record<string, string> = { kiku: 'motif-kiku', hoshi: 'motif-hoshi', hishi: 'motif-hishi', obi: 'motif-obi' };
/** Компилятор знает только эти семьи; остальные каталогу известны, игре — нет. */
const KNOWN_MOTIFS = new Set(['kiku', 'hoshi', 'hishi', 'obi']);
const supportOf = (division: string, family: string) => {
  if (!KNOWN_MOTIFS.has(family)) return { supported: false as const, reason: 'семья вне компилятора узоров' };
  const d = (division === 'simple' || division === 'any' ? 'simple' : division) as 'simple' | 'c8' | 'c10';
  const got = motifSupport(d, family as MotifId);
  return got.supported ? { supported: true as const, reason: '' } : { supported: false as const, reason: got.reason };
};
/** Стежки, которые рецепт умеет назвать: тип RecipeStitch в kagari.ts. */
const ENGINE_STITCHES = new Set(['uwagake-chidori', 'chidori', 'sakasa']);
const shown = (appears: string) =>
  appears === 'dock' ? 'кнопка в мастерской' : appears === 'variant-chip' ? 'чип варианта' : 'только данные, кнопки нет';

const VAULT = 'Temari-Obsidian';

/**
 * What this builder owns — and nothing else. The vault is also where the owner
 * draws (Excalidraw) and where Obsidian keeps its settings and plugins: a file
 * outside these paths is never written, never checked and never removed. Before
 * this list the builder treated everything it had not made as stale and deleted
 * it on --write, which would have taken her drawings with it.
 */
const OWNED_FILES = ['00 Карта ремесла.md'];
const OWNED_DIRS = ['01 Этапы', '02 Узоры', '03 Разметки', '04 Стежки', '05 Нити', '06 Шары'];
const owned = (path: string) =>
  OWNED_FILES.includes(path) || OWNED_DIRS.some((d) => path.startsWith(d + '/'));

/**
 * Obsidian's own settings: written once so a fresh clone opens with the craft
 * colours, then left to Obsidian. It rewrites them (drops the final newline,
 * lists its core plugins), and a builder that put them back would fight it.
 */
const seeds = new Map<string, string>();
const seed = (path: string, body: string) => seeds.set(path, body);
const write = process.argv.includes('--write');
const check = process.argv.includes('--check');

const STATUS: Record<CatalogStatus, string> = {
  now: 'в игре сейчас',
  v1: 'к первой версии',
  later: 'позже',
};

const STAGES = {
  wrap: { file: '01 Этапы/Этап · намотка.md', title: 'Этап · намотка',
    what: 'Шар обматывается нитью до ровной сферы. Пряжа, затем тоньше, затем швейная — верхний слой и есть то, что видно.' },
  mark: { file: '01 Этапы/Этап · разметка.md', title: 'Этап · разметка',
    what: 'Дзивари: нити делят поверхность и задают, где будут стежки. Ставятся булавки-метки.' },
  kagari: { file: '01 Этапы/Этап · вышивка.md', title: 'Этап · вышивка',
    what: 'Кагари: узор кладётся по меткам, каждый ряд поверх ранее уложенных.' },
} as const;

const slug = (s: string) => s.replace(/[\\/:*?"<>|#^[\]]/g, '·').trim();
const title = (names: CatalogName) => slug(names.ru);
const head = (names: CatalogName) => `${names.ja}（${names.reading}） · ${names.en}`;
const link = (t: string) => `[[${slug(t)}]]`;

const files = new Map<string, string>();
const put = (path: string, body: string) => files.set(path, body.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n');
const footer = '\n\n---\n\n*Собрано `scripts/build-craft-vault.mts` из `src/components/temari/library.ts`. Править — там: эти файлы перезаписываются.*';

// ── этапы работы: их связывают с нитями роли в каталоге ───────────────────────
const yarnsOf = (role: 'wrap' | 'mark' | 'kagari') => YARN_CATALOG.filter((y) => y.role === role);
for (const [role, stage] of Object.entries(STAGES) as [keyof typeof STAGES, typeof STAGES[keyof typeof STAGES]][]) {
  const yarns = yarnsOf(role);
  const lines = [`# ${stage.title}`, '', stage.what, '', '## Нити этого этапа', ''];
  for (const y of yarns) lines.push(`- ${link(y.names.ru)} — ${y.mm} мм, ${STATUS[y.status]}`);
  if (role === 'mark') {
    lines.push('', '## Разметки', '');
    for (const d of DIVISION_CATALOG) lines.push(`- ${link(d.names.ru)} — ${STATUS[d.status]}`);
  }
  if (role === 'kagari') {
    lines.push('', '## Узоры', '');
    for (const m of MOTIF_CATALOG) lines.push(`- ${link(m.names.ru)} — ${STATUS[m.status]}`);
  }
  if (role === 'wrap') {
    lines.push('', '## Размеры шара', '');
    for (const s of MARI_CATALOG) lines.push(`- ${link(s.label)} — окружность ${s.C} см, ${STATUS[s.status]}`);
  }
  put(stage.file, lines.join('\n') + footer);
}

// ── узоры ────────────────────────────────────────────────────────────────────
for (const m of MOTIF_CATALOG) {
  const division = DIVISION_CATALOG.find((d) => d.id === m.requires.replace('simple', 's8'));
  const stitch = STITCH_CATALOG.find((s) => s.id === m.stitch);
  const lines = [
    `# ${title(m.names)}`, '', `*${head(m.names)}*`, '', m.note, '',
    '## Чем и на чём', '',
    `- Разметка: ${division ? link(division.names.ru) : `любая (${m.requires})`}`,
    `- Стежок: ${stitch ? link(stitch.names.ru) : m.stitch}`,
    `- Этап: ${link(STAGES.kagari.title)}`,
    `- Состояние: **${STATUS[m.status]}**`,
  ];
  if (m.centers) lines.push(`- Центры: ${m.centers === 'facing-pole' ? 'полюс, обращённый к мастеру' : 'оба полюса'}`);
  if (m.direction) lines.push(`- Ход: ${m.direction === 'outward' ? 'от полюса' : 'к полюсу'}`);
  if (m.crossing) lines.push(`- Перехлёст: ${m.crossing}`);
  if (m.skip) lines.push(`- Через сколько лучей: ${m.skip}`);
  const uiMotif = UI_MOTIF[m.family];
  const support = supportOf(m.requires, m.family);
  lines.push('', '## Достижимость в игре', '',
    `- В интерфейсе: ${shown(m.appears)}${uiMotif && ACTION_IDS.has(uiMotif) ? ` (действие \`${uiMotif}\`)` : ''}`,
    `- Рецепт на своей разметке: ${support.supported ? '**есть**' : `**нет** — ${support.reason}`}`);
  if (m.appears !== 'data-only' && !support.supported) {
    lines.push('- ⚠️ кнопка есть, а шить нечем — это видно игроку.');
  }
  if (m.recipe) {
    const yarn = YARN_CATALOG.find((y) => y.kind === m.recipe!.thread);
    lines.push('', '## Чем шьётся', '',
      `- Нить: ${yarn ? link(yarn.names.ru) : m.recipe.thread} — от её толщины считается шаг ряда`,
      `- Рабочих групп: ${m.recipe.sets}${m.recipe.sets === 2 ? ' — две нити попеременно, A и B' : ''}`);
    lines.push('', '## Числа рецепта', '',
      `- внутренние метки: ${m.recipe.innerMm} мм от полюса`,
      `- нижние точки: ${Math.round(m.recipe.outerFromEquator * 100)}% пути от экватора к полюсу`,
      `- растяжка острия: ${m.recipe.stretchMm} мм`,
      `- подхват поперёк метки: ${m.recipe.cornerMm} мм`,
      '', 'Что из этих чисел от источника, а что наш выбор — `docs/assumptions.md`.');
  }
  const family = MOTIF_CATALOG.filter((x) => x.family === m.family && x.id !== m.id);
  if (family.length) {
    const base = MOTIF_CATALOG.find((x) => x.family === m.family && x.appears === 'dock');
    lines.push('', '## Та же семья', '',
      ...(base && base.id !== m.id ? [`- Основной: ${link(base.names.ru)}`] : []),
      ...family.filter((x) => !base || x.id !== base.id).map((x) => `- ${link(x.names.ru)} — ${STATUS[x.status]}`));
  }
  put(`02 Узоры/${title(m.names)}.md`, lines.join('\n') + footer);
}

// ── разметки ─────────────────────────────────────────────────────────────────
for (const d of DIVISION_CATALOG) {
  const sewn = MOTIF_CATALOG.filter((m) => m.requires.replace('simple', 's8') === d.id);
  const lines = [
    `# ${title(d.names)}`, '', `*${head(d.names)}*`, '', d.note, '',
    '## О ней', '',
    `- Вид: ${d.kind === 'simple' ? 'простое деление' : d.kind === 'combination' ? 'комбинированное' : 'дополнительное'}`,
    ...(d.poles ? [`- Центров: ${d.poles}`] : []),
    ...(d.rays ? [`- Лучей: ${d.rays}`] : []),
    ...(d.builtOn ? [(() => {
      const base = DIVISION_CATALOG.find((x) => x.id === d.builtOn);
      return `- Построена на: ${base ? link(base.names.ru) : d.builtOn}`;
    })()] : []),
    `- Этап: ${link(STAGES.mark.title)}`,
    `- Состояние: **${STATUS[d.status]}**`,
    '', '## Что на ней шьётся', '',
    ...(sewn.length ? sewn.map((m) => `- ${link(m.names.ru)} — ${STATUS[m.status]}`) : ['- пока ничего']),
  ];
  const uiDivision = UI_DIVISION[d.id];
  const sewable = sewn.filter((m) => supportOf(d.id === 's8' ? 'simple' : d.id, m.family).supported);
  lines.push('', '## Достижимость в игре', '',
    `- В интерфейсе: ${shown(d.appears)}${uiDivision && ACTION_IDS.has(uiDivision) ? ` (действие \`${uiDivision}\`)` : ''}`,
    `- Узоров с рецептом: ${sewable.length} из ${sewn.length}`);
  if (d.appears === 'dock' && sewable.length === 0) {
    lines.push('- ⚠️ разметку выбрать можно, а узора под неё пока нет.');
  }
  put(`03 Разметки/${title(d.names)}.md`, lines.join('\n') + footer);
}

// ── стежки ───────────────────────────────────────────────────────────────────
for (const s of STITCH_CATALOG) {
  const used = MOTIF_CATALOG.filter((m) => m.stitch === s.id);
  const lines = [
    `# ${title(s.names)}`, '', `*${head(s.names)}*`, '', s.what, '',
    `- Семья: ${s.family}`,
    `- Этап: ${link(STAGES.kagari.title)}`,
    `- Состояние: **${STATUS[s.status]}**`,
    '', '## Каким узорам нужен', '',
    ...(used.length ? used.map((m) => `- ${link(m.names.ru)}`) : ['- пока ни одному']),
  ];
  const sewable = used.filter((m) => supportOf(m.requires, m.family).supported);
  lines.push('', '## Достижимость в игре', '',
    `- В интерфейсе: ${shown(s.appears)}`,
    `- Движок называет этот стежок: ${ENGINE_STITCHES.has(s.id) ? '**да**' : '**нет** — рецепт его не знает'}`,
    `- Узоров, которые им действительно шьются: ${sewable.length} из ${used.length}`);
  put(`04 Стежки/${title(s.names)}.md`, lines.join('\n') + footer);
}

// ── нити ─────────────────────────────────────────────────────────────────────
for (const y of YARN_CATALOG) {
  const stage = STAGES[y.role];
  const lines = [
    `# ${title(y.names)}`, '', `*${head(y.names)}*`, '', y.note, '',
    `- Толщина: **${y.mm} мм**`,
    `- Роль: ${y.role === 'wrap' ? 'намотка' : y.role === 'mark' ? 'разметка' : 'вышивка'} — ${link(stage.title)}`,
    `- Состояние: **${STATUS[y.status]}**`,
    ...(y.kind ? [`- В кадре рисуется как \`${y.kind}\` (свои блеск и шероховатость)`] : ['- Рендер эту нить пока не рисует отдельно']),
    ...(MOTIF_CATALOG.filter((m) => m.recipe?.thread === y.kind).map((m) => `- Ею шьётся: ${link(m.names.ru)}`)),
    '', '## Достижимость в игре', '',
    y.role === 'kagari'
      ? '- В мастерской выбирается **цвет** нити, а не сама нить: вид и толщина пока заданы рецептом.'
      : y.role === 'wrap'
        ? '- Выбирается на титульном экране цветом намотки; толщина — ползунком нити.'
        : '- Ставится разметкой, отдельного выбора нет.',
  ];
  put(`05 Нити/${title(y.names)}.md`, lines.join('\n') + footer);
}

// ── размеры шара ─────────────────────────────────────────────────────────────
for (const s of MARI_CATALOG) {
  const lines = [
    `# ${slug(s.label)}`, '', s.note, '',
    `- Окружность: **${s.C} см** (радиус ${(s.C / (2 * Math.PI)).toFixed(2)} см)`,
    `- Этап: ${link(STAGES.wrap.title)}`,
    `- Состояние: **${STATUS[s.status]}**`,
    ...(s.C === 24 ? [] : ['', '> Геометрия узора сегодня считается для эталона 24 см: перенос рецепта на этот размер ещё не проверен.']),
  ];
  put(`06 Шары/${slug(s.label)}.md`, lines.join('\n') + footer);
}

// ── карта ────────────────────────────────────────────────────────────────────
const now = (xs: { status: CatalogStatus }[]) => xs.filter((x) => x.status === 'now').length;
put('00 Карта ремесла.md', [
  '# Карта ремесла',
  '',
  'Что из чего собирается: шар → намотка → разметка → стежок → узор, и какие нити на каком этапе.',
  'Собрано из каталога игры, поэтому показывает ровно то, что игра умеет сегодня.',
  '',
  '## Этапы',
  '',
  ...Object.values(STAGES).map((s) => `- ${link(s.title)}`),
  '',
  '## Сколько чего',
  '',
  `- Узоры: ${MOTIF_CATALOG.length}, из них в игре сейчас ${now(MOTIF_CATALOG)}`,
  `- Разметки: ${DIVISION_CATALOG.length}, сейчас ${now(DIVISION_CATALOG)}`,
  `- Стежки: ${STITCH_CATALOG.length}, сейчас ${now(STITCH_CATALOG)}`,
  `- Нити: ${YARN_CATALOG.length}, сейчас ${now(YARN_CATALOG)}`,
  `- Размеры шара: ${MARI_CATALOG.length}, сейчас ${now(MARI_CATALOG)}`,
  '',
  '## В игре сейчас',
  '',
  ...MOTIF_CATALOG.filter((m) => m.status === 'now').map((m) => {
    const d = DIVISION_CATALOG.find((x) => x.id === m.requires.replace('simple', 's8'));
    const s = STITCH_CATALOG.find((x) => x.id === m.stitch);
    return `- ${link(m.names.ru)} — на ${d ? link(d.names.ru) : m.requires}, стежком ${s ? link(s.names.ru) : m.stitch}`;
  }),
  '',
  '## Достижимо из мастерской',
  '',
  ...(() => {
    const dock = MOTIF_CATALOG.filter((m) => m.appears === 'dock');
    const withRecipe = dock.filter((m) => supportOf(m.requires, m.family).supported);
    const divisionsShown = DIVISION_CATALOG.filter((d) => d.appears === 'dock');
    const divisionsSewable = divisionsShown.filter((d) => MOTIF_CATALOG.some((m) =>
      m.requires.replace('simple', 's8') === d.id && supportOf(d.id === 's8' ? 'simple' : d.id, m.family).supported));
    return [
      `- Узоры: кнопок ${dock.length}, из них с рецептом ${withRecipe.length}.`,
      `- Разметки: кнопок ${divisionsShown.length}, из них с узором ${divisionsSewable.length}.`,
      '- Нити: выбирается только цвет; вид нити и толщина задаются рецептом.',
      '',
      'Разрыв между «показано» и «шьётся» — это не ошибка карты, а состояние игры.',
    ];
  })(),
  '',
  '## Чего здесь нет',
  '',
  '- Источников и того, на чём держатся числа — это `docs/assumptions.md` и `spec/craft-sources.md`.',
  '- Состояния работы и задач — это доска и `STATE.md`.',
  '- Пересказа спецификаций: их здесь нет намеренно, чтобы не разошлись.',
].join('\n') + footer);

seed('.obsidian/app.json', JSON.stringify({ promptDelete: false, useMarkdownLinks: false, newLinkFormat: 'shortest', attachmentFolderPath: 'Рисунки' }, null, 2) + '\n');
seed('.obsidian/appearance.json', JSON.stringify({ theme: 'system' }, null, 2) + '\n');
seed('.obsidian/core-plugins.json', JSON.stringify({
  'file-explorer': true, 'global-search': true, switcher: true, graph: true, backlink: true,
  'outgoing-link': true, 'page-preview': true, 'command-palette': true, outline: true, bookmarks: true,
  canvas: false, 'daily-notes': false, templates: false, 'note-composer': false, 'tag-pane': false,
  properties: false, 'slash-command': false, 'random-note': false, 'file-recovery': true,
}, null, 2) + '\n');
seed('.obsidian/graph.json', JSON.stringify({
  'collapse-filter': false, search: '', showTags: false, showAttachments: false,
  hideUnresolved: true, showOrphans: false, 'collapse-color-groups': false,
  colorGroups: [
    { query: 'path:"02 Узоры"', color: { a: 1, rgb: 9387314 } },
    { query: 'path:"03 Разметки"', color: { a: 1, rgb: 4022150 } },
    { query: 'path:"04 Стежки"', color: { a: 1, rgb: 2761760 } },
    { query: 'path:"05 Нити"', color: { a: 1, rgb: 12887412 } },
    { query: 'path:"06 Шары"', color: { a: 1, rgb: 7035466 } },
  ],
  'collapse-display': false, showArrow: true, textFadeMultiplier: -0.2,
  nodeSizeMultiplier: 1.3, lineSizeMultiplier: 1, 'collapse-forces': false,
  centerStrength: 0.5, repelStrength: 10, linkStrength: 1, linkDistance: 190, scale: 1, close: false,
}, null, 2) + '\n');

// ── запись или проверка ──────────────────────────────────────────────────────
async function onDisk() {
  const out = new Map<string, string>();
  const walk = async (dir: string, prefix = '') => {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'workspace.json' || e.name === 'workspace-mobile.json') continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full, prefix + e.name + '/');
      else out.set(prefix + e.name, await readFile(full, 'utf8'));
    }
  };
  for (const f of OWNED_FILES) {
    try { out.set(f, await readFile(join(VAULT, f), 'utf8')); } catch { /* not built yet */ }
  }
  for (const d of OWNED_DIRS) await walk(join(VAULT, d), d + '/');
  return out;
}

/** Та же карта картинкой, чтобы посмотреть без Obsidian (папка игнорируется). */
async function picture() {
  const nodes = [...files.keys()].filter((f) => f.endsWith('.md') && owned(f));
  const id = (f: string) => 'n' + f.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_');
  const nameOf = (f: string) => f.split('/').pop()!.replace(/\.md$/, '');
  const byName = new Map(nodes.map((f) => [nameOf(f), f]));
  const groups = new Map<string, string[]>();
  for (const f of nodes) {
    const dir = f.includes('/') ? f.split('/')[0]! : 'Карта';
    groups.set(dir, [...(groups.get(dir) ?? []), f]);
  }
  const edges = new Set<string>();
  for (const f of nodes) {
    for (const [, target] of (files.get(f) ?? '').matchAll(/\[\[([^\]]+)\]\]/g)) {
      const to = byName.get(target);
      if (to && to !== f) edges.add(`  ${id(f)} --> ${id(to)}`);
    }
  }
  const mermaid = ['graph LR',
    ...[...groups.entries()].map(([dir, fs]) => [
      `  subgraph ${id(dir)}["${dir}"]`,
      ...fs.map((f) => `    ${id(f)}["${nameOf(f)}"]`),
      '  end'].join('\n')),
    ...edges].join('\n');
  const out = 'screenshots/craft-graph';
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'craft-graph.html'), `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Карта ремесла</title><style>body{margin:0;background:#efece6;color:#2a2420;font:15px/1.5 system-ui,sans-serif}
h1{font:500 22px/1.2 Georgia,serif;margin:16px 20px 2px}p{margin:2px 20px 10px;color:#5a5149}.mermaid{padding:8px}</style></head><body>
<h1>Карта ремесла</h1><p>${nodes.length} узлов, ${edges.size} связей. Собрано из каталога игры.</p>
<pre class="mermaid">${mermaid.replace(/</g, '&lt;')}</pre>
<script type="module">import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
mermaid.initialize({startOnLoad:true,theme:'base',themeVariables:{primaryColor:'#e4e0d8',primaryTextColor:'#2a2420',lineColor:'#8a8178',fontSize:'13px'}});</script></body></html>`);
  console.log(JSON.stringify({ picture: join(out, 'craft-graph.html'), nodes: nodes.length, edges: edges.size }, null, 1));
}

const current = await onDisk();
const differing = [...files.keys()].filter((f) => current.get(f) !== files.get(f));
// Inside its own folders a file it did not make is a note the catalogue lost.
const extra = [...current.keys()].filter((f) => owned(f) && !files.has(f));
const strays = [...files.keys()].filter((f) => !owned(f));
if (strays.length) throw new Error(`builder wrote outside what it owns: ${strays.join(', ')}`);

if (check) {
  if (differing.length || extra.length) {
    console.error('Хранилище разошлось с каталогом игры.');
    for (const f of differing) console.error('  изменилось:', f);
    for (const f of extra) console.error('  лишнее:', f);
    console.error('Соберите заново: npx tsx scripts/build-craft-vault.mts --write');
    process.exit(1);
  }
  console.log(JSON.stringify({ vault: VAULT, notes: files.size, state: 'совпадает' }, null, 1));
} else if (write) {
  for (const f of extra) await rm(join(VAULT, f));
  for (const [f, body] of files) {
    await mkdir(dirname(join(VAULT, f)), { recursive: true });
    await writeFile(join(VAULT, f), body);
  }
  let seeded = 0;
  for (const [f, body] of seeds) {
    try { await readFile(join(VAULT, f)); continue; } catch { /* absent: seed it */ }
    await mkdir(dirname(join(VAULT, f)), { recursive: true });
    await writeFile(join(VAULT, f), body);
    seeded++;
  }
  if (seeded) console.log(`настроек Obsidian заведено: ${seeded}`);
  console.log(JSON.stringify({ vault: VAULT, notes: files.size, written: differing.length, removed: extra.length }, null, 1));
} else if (process.argv.includes('--picture')) {
  await picture();
} else {
  console.log('Укажите --write, --check или --picture');
  process.exit(2);
}
