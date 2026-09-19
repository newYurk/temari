/**
 * Карта ремесла как хранилище Obsidian — собрана из данных самой игры.
 *
 * Узлы: узоры, разметки, стежки, нити, размеры шара и три этапа работы.
 * Рёбра: то, что уже записано в `src/components/temari/library.ts` — какой узор
 * на какой разметке живёт, каким стежком шьётся, какая нить на каком этапе.
 * Руками здесь не пишется ничего: добавили строку в каталог — узел появился сам,
 * и разойтись с игрой он не может, потому что игра читает тот же файл.
 *
 * Правило рёбер (от него зависит, читается ли граф):
 *   — Зависимость живёт в свойстве frontmatter той заметки, которая зависит:
 *     у узора «разметка», «стежок», «нить», у разметки «основа». Всего их 27,
 *     ровно столько, сколько настоящих зависимостей в каталоге.
 *   — Обратное перечисление ссылкой не пишется никогда. Его показывает панель
 *     Backlinks, а встречная пара A↔B рисует в графе два ребра друг поверх
 *     друга, и направление становится нечитаемым. Списки «Что на ней шьётся»,
 *     «Каким узорам нужен», «Ею шьётся» остаются текстом.
 *   — Принадлежность к разделу («- Этап: …», «Та же семья») — тоже текст:
 *     это оглавление, а не зависимость.
 *   — Ссылками остаются только вход в хранилище («00 Карта ремесла») и списки
 *     самих этапов: по ним нажимают. В графе владелицы они отключены фильтром
 *     `.obsidian/graph.json`, так что на картинке видны ровно те 27 рёбер.
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

/**
 * Одно имя — не всегда одна заметка. «Судзидагику» и «сикаку» есть в каталоге
 * и узором, и стежком: короткая ссылка `[[сикаку]]` тогда неоднозначна, и
 * Obsidian выбирает файл за нас (сейчас — стежок, хотя в заметке нити речь про
 * узор). Поэтому имена сперва пересчитываются, и там, где имя занято дважды,
 * ссылка пишется с путём и подписью: `[[04 Стежки/сикаку|сикаку]]`.
 */
const HOMONYMS = (() => {
  const seen = new Map<string, number>();
  const bump = (name: string) => seen.set(slug(name), (seen.get(slug(name)) ?? 0) + 1);
  for (const s of Object.values(STAGES)) bump(s.title);
  for (const m of MOTIF_CATALOG) bump(m.names.ru);
  for (const d of DIVISION_CATALOG) bump(d.names.ru);
  for (const s of STITCH_CATALOG) bump(s.names.ru);
  for (const y of YARN_CATALOG) bump(y.names.ru);
  for (const s of MARI_CATALOG) bump(s.label);
  return new Set([...seen].filter(([, n]) => n > 1).map(([name]) => name));
})();
const FOLDER = {
  stage: '01 Этапы', motif: '02 Узоры', division: '03 Разметки',
  stitch: '04 Стежки', yarn: '05 Нити', mari: '06 Шары',
} as const;
/** Ссылка на заметку папки `folder`; однозначная даже при совпадении имён. */
const link = (folder: string, t: string) => {
  const name = slug(t);
  return HOMONYMS.has(name) ? `[[${folder}/${name}|${name}]]` : `[[${name}]]`;
};

/**
 * Свойства-зависимости в шапке заметки.
 *
 * Ребро пишется ОДИН раз — в той заметке, которая зависит. Обратное
 * перечисление не пишется никогда: его показывает панель Backlinks, а две
 * встречные ссылки дают в графе два ребра друг поверх друга, и направление
 * прочитать уже нельзя. Имена полей русские: их читает владелица в панели
 * «Свойства», и то же имя Breadcrumbs берёт как имя ребра. Ссылка в значении
 * обязана быть в кавычках — иначе YAML видит вложенный список.
 */
const frontmatter = (props: [string, string][]) =>
  props.length ? ['---', ...props.map(([k, v]) => `${k}: "${v}"`), '---', ''] : [];

const files = new Map<string, string>();
const put = (path: string, body: string) => files.set(path, body.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n');
const footer = '\n\n---\n\n*Собрано `scripts/build-craft-vault.mts` из `src/components/temari/library.ts`. Править — там: эти файлы перезаписываются.*';

// ── этапы работы: их связывают с нитями роли в каталоге ───────────────────────
const yarnsOf = (role: 'wrap' | 'mark' | 'kagari') => YARN_CATALOG.filter((y) => y.role === role);
for (const [role, stage] of Object.entries(STAGES) as [keyof typeof STAGES, typeof STAGES[keyof typeof STAGES]][]) {
  const yarns = yarnsOf(role);
  const lines = [`# ${stage.title}`, '', stage.what, '', '## Нити этого этапа', ''];
  for (const y of yarns) lines.push(`- ${link(FOLDER.yarn, y.names.ru)} — ${y.mm} мм, ${STATUS[y.status]}`);
  if (role === 'mark') {
    lines.push('', '## Разметки', '');
    for (const d of DIVISION_CATALOG) lines.push(`- ${link(FOLDER.division, d.names.ru)} — ${STATUS[d.status]}`);
  }
  if (role === 'kagari') {
    lines.push('', '## Узоры', '');
    for (const m of MOTIF_CATALOG) lines.push(`- ${link(FOLDER.motif, m.names.ru)} — ${STATUS[m.status]}`);
  }
  if (role === 'wrap') {
    lines.push('', '## Размеры шара', '');
    for (const s of MARI_CATALOG) lines.push(`- ${link(FOLDER.mari, s.label)} — окружность ${s.C} см, ${STATUS[s.status]}`);
  }
  put(stage.file, lines.join('\n') + footer);
}

// ── узоры ────────────────────────────────────────────────────────────────────
for (const m of MOTIF_CATALOG) {
  const division = DIVISION_CATALOG.find((d) => d.id === m.requires.replace('simple', 's8'));
  const stitch = STITCH_CATALOG.find((s) => s.id === m.stitch);
  /**
   * Нить узора — только из рецепта. Раньше связь считалась с другого конца, в
   * заметке нити, сравнением `m.recipe?.thread === y.kind`: у нити без `kind`
   * и у узора без рецепта обе стороны равны `undefined`, и каждая такая нить
   * «шила» все одиннадцать узоров без рецепта. Настоящее ребро здесь одно.
   */
  const yarn = m.recipe ? YARN_CATALOG.find((y) => y.kind && y.kind === m.recipe!.thread) : undefined;
  const lines = [
    ...frontmatter([
      ...(division ? [['разметка', link(FOLDER.division, division.names.ru)] as [string, string]] : []),
      ...(stitch ? [['стежок', link(FOLDER.stitch, stitch.names.ru)] as [string, string]] : []),
      ...(yarn ? [['нить', link(FOLDER.yarn, yarn.names.ru)] as [string, string]] : []),
    ]),
    `# ${title(m.names)}`, '', `*${head(m.names)}*`, '', m.note, '',
    '## Чем и на чём', '',
    `- Разметка: ${division ? link(FOLDER.division, division.names.ru) : `любая (${m.requires})`}`,
    `- Стежок: ${stitch ? link(FOLDER.stitch, stitch.names.ru) : m.stitch}`,
    `- Этап: ${STAGES.kagari.title}`,
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
    lines.push('', '## Чем шьётся', '',
      `- Нить: ${yarn ? link(FOLDER.yarn, yarn.names.ru) : m.recipe.thread} — от её толщины считается шаг ряда`,
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
    // Соседи по семье — не зависимость: кику 16 не нужна кику, чтобы шиться.
    // Шесть заметок кику давали друг на друга клику в 30 рёбер. Имена остаются,
    // ссылками они больше не будут.
    const base = MOTIF_CATALOG.find((x) => x.family === m.family && x.appears === 'dock');
    lines.push('', '## Та же семья', '',
      ...(base && base.id !== m.id ? [`- Основной: ${title(base.names)}`] : []),
      ...family.filter((x) => !base || x.id !== base.id).map((x) => `- ${title(x.names)} — ${STATUS[x.status]}`));
  }
  put(`02 Узоры/${title(m.names)}.md`, lines.join('\n') + footer);
}

// ── разметки ─────────────────────────────────────────────────────────────────
for (const d of DIVISION_CATALOG) {
  const sewn = MOTIF_CATALOG.filter((m) => m.requires.replace('simple', 's8') === d.id);
  const base = d.builtOn ? DIVISION_CATALOG.find((x) => x.id === d.builtOn) : undefined;
  const lines = [
    ...frontmatter(base ? [['основа', link(FOLDER.division, base.names.ru)]] : []),
    `# ${title(d.names)}`, '', `*${head(d.names)}*`, '', d.note, '',
    '## О ней', '',
    `- Вид: ${d.kind === 'simple' ? 'простое деление' : d.kind === 'combination' ? 'комбинированное' : 'дополнительное'}`,
    ...(d.poles ? [`- Центров: ${d.poles}`] : []),
    ...(d.rays ? [`- Лучей: ${d.rays}`] : []),
    ...(d.builtOn ? [`- Построена на: ${base ? link(FOLDER.division, base.names.ru) : d.builtOn}`] : []),
    `- Этап: ${STAGES.mark.title}`,
    `- Состояние: **${STATUS[d.status]}**`,
    // Обратное перечисление: то же самое слово в слово показывает панель
    // Backlinks, теперь наполняемая свойством «разметка» у самих узоров.
    '', '## Что на ней шьётся', '',
    ...(sewn.length ? sewn.map((m) => `- ${title(m.names)} — ${STATUS[m.status]}`) : ['- пока ничего']),
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
    `- Этап: ${STAGES.kagari.title}`,
    `- Состояние: **${STATUS[s.status]}**`,
    // Тоже обратное перечисление: его даёт Backlinks из свойства «стежок».
    '', '## Каким узорам нужен', '',
    ...(used.length ? used.map((m) => `- ${title(m.names)}`) : ['- пока ни одному']),
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
    `- Роль: ${y.role === 'wrap' ? 'намотка' : y.role === 'mark' ? 'разметка' : 'вышивка'} — ${stage.title}`,
    `- Состояние: **${STATUS[y.status]}**`,
    ...(y.kind ? [`- В кадре рисуется как \`${y.kind}\` (свои блеск и шероховатость)`] : ['- Рендер эту нить пока не рисует отдельно']),
    // `y.kind &&` — не косметика. Без него нить без `kind` сравнивалась с узором
    // без рецепта как `undefined === undefined`, и бунка «шила» асаноху: четыре
    // нити × одиннадцать узоров = 44 выдуманных ребра. Настоящее — одно.
    // Направление у него обратное (зависит узор от нити), поэтому текст есть,
    // а ссылки нет: ребро уже записано свойством «нить» в заметке узора.
    ...(MOTIF_CATALOG.filter((m) => y.kind && m.recipe?.thread === y.kind).map((m) => `- Ею шьётся: ${title(m.names)}`)),
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
    `- Этап: ${STAGES.wrap.title}`,
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
  ...Object.values(STAGES).map((s) => `- ${link(FOLDER.stage, s.title)}`),
  '',
  '## Сколько чего',
  '',
  `- Узоры: ${MOTIF_CATALOG.length}, из них в игре сейчас ${now(MOTIF_CATALOG)}`,
  `- Разметки: ${DIVISION_CATALOG.length}, сейчас ${now(DIVISION_CATALOG)}`,
  `- Стежки: ${STITCH_CATALOG.length}, сейчас ${now(STITCH_CATALOG)}`,
  `- Нити: ${YARN_CATALOG.length}, сейчас ${now(YARN_CATALOG)}`,
  `- Размеры шара: ${MARI_CATALOG.length}, сейчас ${now(MARI_CATALOG)}`,
  '',
  // Единственные ссылки, которые здесь остаются: карта — вход в хранилище,
  // и по ней нажимают. Всё прочее «см. также» в заметках снято до текста.
  '## В игре сейчас',
  '',
  ...MOTIF_CATALOG.filter((m) => m.status === 'now').map((m) => {
    const d = DIVISION_CATALOG.find((x) => x.id === m.requires.replace('simple', 's8'));
    const s = STITCH_CATALOG.find((x) => x.id === m.stitch);
    return `- ${link(FOLDER.motif, m.names.ru)} — на ${d ? link(FOLDER.division, d.names.ru) : m.requires}, `
      + `стежком ${s ? link(FOLDER.stitch, s.names.ru) : m.stitch}`;
  }),
  '',
  /**
   * «На каких-то разметках можно всё сделать?» — таблица отвечает прямо.
   * Считается не по `requires` (это документация каталога, намерение), а по
   * `supportOf` → `motifSupport`: та же функция решает в мастерской, дадут ли
   * шить. Галочка — рецепт есть, прочерк — разметка есть, рецепта нет.
   */
  ...(() => {
    /** Колонка — семья, названная первым своим узором: это имя и в мастерской. */
    const families = MOTIF_CATALOG.filter((m, i) =>
      MOTIF_CATALOG.findIndex((x) => x.family === m.family) === i);
    const arg = (d: typeof DIVISION_CATALOG[number]) => (d.id === 's8' ? 'simple' : d.id);
    const can = (d: typeof DIVISION_CATALOG[number], family: string) =>
      supportOf(arg(d), family).supported;
    const rows = DIVISION_CATALOG.map((d) =>
      `| ${title(d.names)} | ${families.map((m) => (can(d, m.family) ? '✓' : '—')).join(' | ')} |`);
    const full = DIVISION_CATALOG.filter((d) => families.every((m) => can(d, m.family)));
    const some = DIVISION_CATALOG.filter((d) => families.some((m) => can(d, m.family)));
    const ticks = DIVISION_CATALOG.reduce(
      (sum, d) => sum + families.filter((m) => can(d, m.family)).length, 0);
    return ['## Что на чём шьётся', '',
      `| разметка | ${families.map((m) => title(m.names)).join(' | ')} |`,
      `| --- | ${families.map(() => ':---:').join(' | ')} |`,
      ...rows, '',
      `Галочек ${ticks} на ${DIVISION_CATALOG.length} × ${families.length} клеток. `
      + (full.length
        ? `Всё шьётся на: ${full.map((d) => title(d.names)).join(', ')}. `
        : 'Разметки, на которой можно всё, нет ни одной. ')
      + (some.length
        ? `Хоть что-то — только на: ${some.map((d) => title(d.names)).join(', ')}.`
        : 'Шить нечего нигде.')];
  })(),
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
seed('.obsidian/core-plugins.json', JSON.stringify({"file-explorer": true, "global-search": true, "switcher": true, "graph": true, "backlink": true, "outgoing-link": true, "page-preview": true, "command-palette": true, "outline": true, "bookmarks": true, "canvas": false, "daily-notes": false, "templates": false, "note-composer": false, "tag-pane": true, "properties": true, "slash-command": false, "random-note": false, "file-recovery": true, "footnotes": false, "editor-status": true, "markdown-importer": false, "zk-prefixer": false, "word-count": true, "slides": false, "audio-recorder": false, "workspaces": false, "publish": false, "sync": true, "bases": true, "webviewer": false}, null, 2) + '\n');
// Настройки графа и закладки — СЕМЕНЕМ, А НЕ ИЗ GIT (18.09). Obsidian переписывает graph.json
// от каждого движения колёсика: держать его в git значит гонять по истории чужой зум, и раскраску
// это уже дважды сносило в Roti. Здесь лежит исходное состояние, оно ставится ТОЛЬКО если файла нет —
// то, что владелица подкрутила у себя, генератор не трогает.
seed('.obsidian/graph.json', JSON.stringify({"collapse-filter": false, "search": "-file:\"Этап · \" -file:\"00 Карта ремесла\"", "showTags": false, "showAttachments": false, "hideUnresolved": true, "showOrphans": true, "collapse-color-groups": false, "colorGroups": [{"query": "path:\"02 Узоры\"", "color": {"a": 1, "rgb": 9387314}}, {"query": "path:\"03 Разметки\"", "color": {"a": 1, "rgb": 4022150}}, {"query": "path:\"04 Стежки\"", "color": {"a": 1, "rgb": 2761760}}, {"query": "path:\"05 Нити\"", "color": {"a": 1, "rgb": 12887412}}, {"query": "path:\"06 Шары\"", "color": {"a": 1, "rgb": 7035466}}], "collapse-display": false, "showArrow": true, "textFadeMultiplier": -3, "nodeSizeMultiplier": 1.2, "lineSizeMultiplier": 0.7, "collapse-forces": false, "centerStrength": 0.15, "repelStrength": 15, "linkStrength": 0.4, "linkDistance": 420, "scale": 0.9409928231902496, "close": false}, null, 2) + '\n');
seed('.obsidian/bookmarks.json', JSON.stringify({"items": [{"type": "group", "ctime": 1789774569527, "title": "Виды графа", "items": [{"type": "graph", "ctime": 1789774569527, "title": "Зависимости ремесла", "options": {"collapse-filter": false, "search": "-file:\"Этап · \" -file:\"00 Карта ремесла\"", "showTags": false, "showAttachments": false, "hideUnresolved": true, "showOrphans": true, "collapse-color-groups": false, "colorGroups": [{"query": "path:\"02 Узоры\"", "color": {"a": 1, "rgb": 9387314}}, {"query": "path:\"03 Разметки\"", "color": {"a": 1, "rgb": 4022150}}, {"query": "path:\"04 Стежки\"", "color": {"a": 1, "rgb": 2761760}}, {"query": "path:\"05 Нити\"", "color": {"a": 1, "rgb": 12887412}}, {"query": "path:\"06 Шары\"", "color": {"a": 1, "rgb": 7035466}}], "collapse-display": false, "showArrow": true, "textFadeMultiplier": -3, "nodeSizeMultiplier": 1.2, "lineSizeMultiplier": 0.7, "collapse-forces": false, "centerStrength": 0.15, "repelStrength": 15, "linkStrength": 0.4, "linkDistance": 420, "scale": 0.9409928231902496, "close": false}}, {"type": "graph", "ctime": 1789774569528, "title": "Узор и на чём он стоит", "options": {"collapse-filter": false, "search": "path:\"02 Узоры\" OR path:\"03 Разметки\" OR path:\"04 Стежки\"", "showTags": false, "showAttachments": false, "hideUnresolved": true, "showOrphans": true, "collapse-color-groups": false, "colorGroups": [{"query": "path:\"02 Узоры\"", "color": {"a": 1, "rgb": 9387314}}, {"query": "path:\"03 Разметки\"", "color": {"a": 1, "rgb": 4022150}}, {"query": "path:\"04 Стежки\"", "color": {"a": 1, "rgb": 2761760}}, {"query": "path:\"05 Нити\"", "color": {"a": 1, "rgb": 12887412}}, {"query": "path:\"06 Шары\"", "color": {"a": 1, "rgb": 7035466}}], "collapse-display": false, "showArrow": true, "textFadeMultiplier": -3, "nodeSizeMultiplier": 1.2, "lineSizeMultiplier": 0.7, "collapse-forces": false, "centerStrength": 0.15, "repelStrength": 15, "linkStrength": 0.4, "linkDistance": 420, "scale": 0.9409928231902496, "close": false}}, {"type": "graph", "ctime": 1789774569529, "title": "Всё как было", "options": {"collapse-filter": false, "search": "", "showTags": false, "showAttachments": false, "hideUnresolved": true, "showOrphans": true, "collapse-color-groups": false, "colorGroups": [{"query": "path:\"02 Узоры\"", "color": {"a": 1, "rgb": 9387314}}, {"query": "path:\"03 Разметки\"", "color": {"a": 1, "rgb": 4022150}}, {"query": "path:\"04 Стежки\"", "color": {"a": 1, "rgb": 2761760}}, {"query": "path:\"05 Нити\"", "color": {"a": 1, "rgb": 12887412}}, {"query": "path:\"06 Шары\"", "color": {"a": 1, "rgb": 7035466}}], "collapse-display": false, "showArrow": true, "textFadeMultiplier": -3, "nodeSizeMultiplier": 1.2, "lineSizeMultiplier": 0.7, "collapse-forces": false, "centerStrength": 0.15, "repelStrength": 15, "linkStrength": 0.4, "linkDistance": 420, "scale": 0.9409928231902496, "close": false}}]}]}, null, 2) + '\n');

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
  /**
   * ⚑ КАРТИНКА РИСУЕТ ЗАВИСИМОСТИ, А НЕ ВСЕ ССЫЛКИ (19.09).
   * Этапы и карта — навигация, а не зависимость: принадлежность к разделу ничего не держит.
   * Первая версия рисовала их наравне со всем, и три заметки этапов давали 34 ребра из 65 —
   * больше половины графа уходило в хаб, а настоящая цепочка тонула. В графе Obsidian они
   * уже спрятаны фильтром (`.obsidian/graph.json`, поле search); здесь то же исключение,
   * чтобы картинка и граф показывали одно и то же.
   * Подписи папок убраны намеренно: subgraph по папке тянет узлы в свою колонку и ломает
   * укладку по цепочке — вместо неё цвет узла. Проверено: с подгруппами выходит лента 1:3.
   */
  const SKIP = (f: string) => f.startsWith('01 Этапы/') || f === '00 Карта ремесла.md';
  const nodes = [...files.keys()].filter((f) => f.endsWith('.md') && owned(f) && !SKIP(f));
  const id = (f: string) => 'n' + f.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_');
  const nameOf = (f: string) => f.split('/').pop()!.replace(/\.md$/, '');
  const byName = new Map(nodes.map((f) => [nameOf(f), f]));
  const edges = new Set<string>();
  const hasIncoming = new Set<string>();
  for (const f of nodes) {
    for (const [, target] of (files.get(f) ?? '').matchAll(/\[\[([^\]]+)\]\]/g)) {
      const name = target.split('|')[0]!.split('#')[0]!.split('/').pop()!.trim();
      const to = byName.get(name);
      if (to && to !== f) { edges.add(`  ${id(f)} --> ${id(to)}`); hasIncoming.add(to); }
    }
  }
  /** Узел, от которого ничего не зависит и который сам ни на чём не стоит, — тупик каталога. */
  const lonely = (f: string) => !hasIncoming.has(f) &&
    ![...edges].some((e) => e.startsWith(`  ${id(f)} -->`));
  const CLASS: Record<string, string> = {
    '02 Узоры': 'узор', '03 Разметки': 'разметка', '04 Стежки': 'стежок',
    '05 Нити': 'нить', '06 Шары': 'шар',
  };
  const mermaid = ['graph LR',
    '  classDef узор fill:#fca5a5,stroke:#991b1b,color:#1c1917',
    '  classDef разметка fill:#93c5fd,stroke:#1e40af,color:#1c1917',
    '  classDef стежок fill:#d6d3d1,stroke:#44403c,color:#1c1917',
    '  classDef нить fill:#fde68a,stroke:#b45309,color:#1c1917',
    '  classDef шар fill:#bbf7d0,stroke:#166534,color:#1c1917',
    '  classDef тупик fill:#f5f5f4,stroke:#d6d3d1,color:#a8a29e,stroke-dasharray:4 3',
    ...nodes.filter((f) => !lonely(f)).map((f) =>
      `  ${id(f)}["${nameOf(f)}"]:::${CLASS[f.split('/')[0]!] ?? 'стежок'}`),
    ...edges].join('\n');
  const out = 'screenshots/craft-graph';
  await mkdir(out, { recursive: true });
  /**
   * Тупики на схему НЕ ставятся: девятнадцать несвязанных коробочек встают в LR-укладке
   * одной колонкой и растягивают картинку до 751×3220 — ленту, которую не прочесть.
   * Список под схемой говорит то же самое и занимает пять строк.
   */
  const deadList = nodes.filter(lonely);
  const dead = deadList.length;
  const byDir = new Map<string, string[]>();
  for (const f of deadList) {
    const d = f.split('/')[0]!;
    byDir.set(d, [...(byDir.get(d) ?? []), nameOf(f)]);
  }
  const deadHtml = [...byDir.entries()]
    .map(([d, ns]) => `<li><b>${d.replace(/^\d+ /, '')}</b> — ${ns.join(', ')}</li>`).join('');
  await writeFile(join(out, 'craft-graph.html'), `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Карта ремесла</title><style>body{margin:0;background:#efece6;color:#2a2420;font:15px/1.5 system-ui,sans-serif}
h1{font:500 22px/1.2 Georgia,serif;margin:16px 20px 2px}p{margin:2px 20px 10px;color:#5a5149}.mermaid{padding:8px}
b{font-weight:600}</style></head><body>
<h1>Карта ремесла</h1><p>${nodes.length} узлов, ${edges.size} зависимостей. Стрелка ведёт от того, что шьют,
к тому, на чём это стоит. <b>Красное</b> — узоры, <b>синее</b> — разметки, <b>серое</b> — стежки,
<b>жёлтое</b> — нити, <b>зелёное</b> — шары.
Этапы и карта не показаны: принадлежность к разделу — не зависимость.</p>
<pre class="mermaid">${mermaid.replace(/</g, '&lt;')}</pre>
<p><b>Ни с чем не связаны — ${dead} из ${nodes.length}.</b> Они есть в каталоге, но ни один узор их не требует
и они не требуют ничего: пока это не ремесло, а список.</p><ul>${deadHtml}</ul>
<script type="module">import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
mermaid.initialize({startOnLoad:true,theme:'base',themeVariables:{primaryColor:'#e4e0d8',primaryTextColor:'#2a2420',lineColor:'#8a8178',fontSize:'13px'}});</script></body></html>`);
  console.log(JSON.stringify({ picture: join(out, 'craft-graph.html'), nodes: nodes.length, edges: edges.size, тупиков: dead }, null, 1));
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
