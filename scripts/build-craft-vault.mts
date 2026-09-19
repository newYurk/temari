/**
 * Карта ремесла как хранилище Obsidian — собрана из данных самой игры.
 *
 * ДВА ЭТАЖА (решение владелицы 19.09: «сверху механики, внутри каталог»).
 *
 *   Верх — «00 Карта ремесла»: приборная панель. Стадия числами, ОДНА схема
 *   механик прямо в теле заметки, строка на механику, открытые вопросы.
 *   Узлов на схеме семь, а не сорок шесть: узел — механика, не строка каталога.
 *
 *   Низ — «01 Механики»: у каждой механики своя заметка, и каталог живёт ТАМ.
 *   Прежние «01 Этапы» сняты: три заметки-этапа пересказывали каталог и были
 *   хабом на 29 входящих, а схема лежала отдельным html в `screenshots/`,
 *   который git игнорирует. «Всё то, что должно быть в одном месте, — в разных
 *   местах» (владелица, 19.09). Теперь схема внутри заметки, и картинки нет.
 *
 * ОТКУДА ВЗЯЛСЯ СПИСОК МЕХАНИК. Не из прозы «шар → намотка → разметка →
 * стежок → узор»: разбор 18.09 показал, что проза расходится с кодом. Список
 * выведен из трёх мест, и все три проверяемы:
 *   1. Цепочка запретов в `actions.ts` — `needWrap` → `needMarks` /
 *      `needFinishedMarking` → `needRecipe` → `kikuMarksReady`. Это игра сама
 *      называет свои предусловия, то есть свой настоящий граф зависимостей.
 *      Там же видно, что намотка в зависимостях ЕСТЬ: 17 из 22 действий
 *      проходят через `needWrap`. В прежнем графе хранилища её не было потому,
 *      что нить намотки и шар не участвуют в рёбрах КАТАЛОГА, — это разное.
 *   2. Замыкание импортов от входов `src/pages.tsx` (игра) и `src/lab.ts`
 *      (лаборатория). Оно, а не наше мнение, отвечает «работает» это или
 *      «собрано, но не в игре»; считается ниже функцией `closure()`.
 *   3. Каталоги `library.ts` + `motifSupport` — какие строки чьи.
 *
 * Правило рёбер (от него зависит, читается ли граф Obsidian):
 *   — Зависимость живёт в свойстве frontmatter той заметки, которая зависит:
 *     у узора «разметка», «стежок», «нить», у разметки «основа», у механики
 *     «нужна». Обратное перечисление ссылкой не пишется никогда: его показывает
 *     панель Backlinks, а встречная пара A↔B рисует два ребра друг поверх друга.
 *   — Каталог внутри заметки механики — ТЕКСТ, а не ссылки. Ссылками он вернул
 *     бы ровно ту патологию, которую сняли 18.09: семь хабов на сорок шесть
 *     входящих. Имя строки плюс её состояние — это и есть работа панели, а до
 *     самой заметки один Ctrl+O.
 *   Матрица «00 Совместимость узоров» также текстовая: подтверждённые рёбра,
 *   кандидаты и отсутствие сведений не смешиваются. Рецепт сверяется с игрой
 *   по точному divisionId, а не по подстановке simple → s8.
 *   — Мермейд-схема ссылок в индекс Obsidian не добавляет (это подмена DOM
 *     после отрисовки), поэтому кликабельность схемы графу ничего не стоит.
 *
 * ВНИМАНИЕ ПРО ГРАФ. Фильтр в `.obsidian/graph.json` прячет `-file:"Этап · "`.
 * Заметок с таким именем больше нет, а новые семь («Механика · …») под фильтр
 * не попадают и в графе видны — отдельной цепочкой из семи узлов рядом с
 * облаком каталога. Это намеренно: цепочку механик владелица и просила увидеть.
 * Сам `.obsidian/` не трогаем — он настроен ведущим.
 *
 * Сборка:  npx tsx scripts/build-craft-vault.mts --write
 * Проверка: npx tsx scripts/build-craft-vault.mts --check   (для CI)
 */
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { join, dirname, resolve, relative } from 'node:path';
import {
  DIVISION_CATALOG, MARI_CATALOG, MOTIF_CATALOG, STITCH_CATALOG, YARN_CATALOG,
  type CatalogName, type CatalogStatus, type MotifEntry,
} from '../src/components/temari/library.ts';
import { kikuWorkingPins } from '../src/components/temari/patterns.ts';
import {
  declaredDivisions, confirmedDivisions, motifsForDivision,
  catalogImplementation, validateCatalogCompatibility,
} from '../src/components/temari/catalog-compatibility.ts';
import { runtimeDivisionFor, type DivisionId } from '../src/components/temari/division-config.ts';
import { CRAFT_ACTIONS } from '../src/components/temari/actions.ts';
import { PUZZLES } from '../src/components/temari/puzzles.ts';
import { SIMPLE_THREADS, C8_EXTRA } from '../src/components/temari/jiwari.ts';
import { MARI_C_CM, STITCH_THREAD_MM, WRAP_THREAD_MM } from '../src/components/temari/measure.ts';
import { THREAD_KINDS } from '../src/components/temari/thread.ts';

validateCatalogCompatibility();

/**
 * Достижимость: что из каталога на самом деле выбирается в мастерской.
 * `appears` говорит, где узел запланирован, точный рецепт — что исполняется,
 * а список действий — существует ли кнопка семейства. Расхождение между «показано» и
 * «шьётся» здесь видно сразу: именно оно однажды увело владельца на C8.
 */
const ACTION_IDS = new Set(CRAFT_ACTIONS.map((a) => a.id));
const UI_DIVISION: Record<string, string> = { s8: 'jiwari-simple', c8: 'jiwari-c8', c10: 'jiwari-c10' };
const UI_MOTIF: Record<string, string> = { kiku: 'motif-kiku', hoshi: 'motif-hoshi', hishi: 'motif-hishi', obi: 'motif-obi' };
const implementationOf = (m: MotifEntry) => m.recipe
  ? catalogImplementation(m, m.recipe.divisionId)
  : { implemented: false, reason: 'у этой строки нет своего рецепта' };
const compatibilityState = (m: MotifEntry) => ({
  documented: 'подтверждено источником',
  unverified: 'заявлено в каталоге, не проверено',
  unknown: 'точная разметка не установлена',
})[m.compatibility.state];
const divisionName = (id: DivisionId) => DIVISION_CATALOG.find((d) => d.id === id)!.names.ru;
const implementsOn = (m: MotifEntry, id: DivisionId) => catalogImplementation(m, id).implemented;
/** Стежки, которые рецепт умеет назвать: тип RecipeStitch в kagari.ts. */
const ENGINE_STITCHES = new Set(['uwagake-chidori', 'chidori', 'sakasa']);
const shown = (appears: string) =>
  appears === 'dock' ? 'кнопка в мастерской' : appears === 'variant-chip' ? 'чип варианта' : 'только данные, кнопки нет';

/**
 * Единственный рецепт — это поле `recipe` у строки каталога. `motifSupport`
 * различает СЕМЬИ, а не строки: на «простом 8» он говорит «да» всем шести кику,
 * хотя компилятор собирает одну геометрию — ту, что записана в `KIKU_8_POINT`.
 * Поэтому «шьётся на самом деле» считается по `recipe`, а не по `motifSupport`.
 */
const RECIPES = MOTIF_CATALOG.flatMap((m) => (m.recipe ? [m.recipe] : []));

const VAULT = 'Temari-Obsidian';
const ROOT = resolve(import.meta.dirname, '..');

// ── что игра на самом деле подключает ────────────────────────────────────────
/**
 * Замыкание импортов от входа. Это и есть ответ на вопрос «в игре или нет»:
 * модуль, которого нет в замыкании `src/pages.tsx`, в игру не попадает, какой
 * бы законченный он ни был. Так «нить в пространстве» и «ката» получают своё
 * состояние не с наших слов, а из файлов.
 */
async function closure(entry: string): Promise<Set<string>> {
  const seen = new Set<string>();
  const exists = async (p: string) => {
    try { await readFile(p); return true; } catch { return false; }
  };
  const resolveSpec = async (from: string, spec: string) => {
    const raw = spec.startsWith('@/') ? join(ROOT, 'src', spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
    if (!raw) return null;
    const bare = raw.replace(/\.(ts|tsx)$/, '');
    for (const cand of [`${bare}.ts`, `${bare}.tsx`, join(bare, 'index.ts'), join(bare, 'index.tsx')]) {
      if (await exists(cand)) return cand;
    }
    return null;
  };
  const walk = async (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    let src: string;
    try { src = await readFile(file, 'utf8'); } catch { return; }
    const specs = [
      ...[...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!),
      // `import "./spatial-catch";` — ради побочного эффекта, без `from`.
      // Без этой строки половина лаборатории считалась бы неподключённой.
      ...[...src.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]!),
      ...[...src.matchAll(/import\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!),
      // Воркер — тоже вход: `new Worker(new URL('./x.worker.ts', import.meta.url))`.
      ...[...src.matchAll(/new URL\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!),
    ];
    for (const spec of specs) {
      const target = await resolveSpec(file, spec);
      if (target) await walk(target);
    }
  };
  const start = join(ROOT, entry);
  if (!(await exists(start))) throw new Error(`вход ${entry} не найден: пересчитать замыкание нечем`);
  await walk(start);
  return new Set([...seen].map((f) => relative(ROOT, f)));
}

const GAME = await closure('src/pages.tsx');
const LAB = await closure('src/lab.ts');
/** Символы, которые интерфейс игры действительно вызывает (кнопка существует). */
const UI_SOURCE = await (async () => {
  let text = '';
  for (const f of GAME) {
    if (!f.endsWith('.tsx')) continue;
    try { text += await readFile(join(ROOT, f), 'utf8'); } catch { /* исчез — считаем, что вызова нет */ }
  }
  return text;
})();

const MODULE_STATE = (f: string) =>
  GAME.has(f) ? 'в игре' : LAB.has(f) ? 'только в лаборатории' : 'нигде не подключён';

// ── механики: верхний этаж ───────────────────────────────────────────────────
type Row = { name: string; state: string; live: boolean };
type Mechanic = {
  key: string;
  title: string;
  one: string;
  what: string;
  /** Ключи механик, без которых эта не работает. Ребро пишется здесь. */
  needs: string[];
  /** Файлы, в которых эта механика живёт. По ним считается состояние. */
  modules: string[];
  /** Вход из интерфейса: id действия либо символ, который зовёт .tsx игры. */
  entry: { action?: string; call?: string };
  /** Внутренние шаги для маленькой схемы. Не заметки — кликабельными не будут. */
  steps: string[];
  catalogTitle: string;
  rows: Row[];
  limits: string[];
};

const wrapYarns = YARN_CATALOG.filter((y) => y.role === 'wrap');
const kagariYarns = YARN_CATALOG.filter((y) => y.role !== 'wrap');
const wrapMm = Object.values(WRAP_THREAD_MM).map((w) => w.mm);
const recipeMm = RECIPES.map((r) => STITCH_THREAD_MM[r.thread]);
/**
 * ⚑ РАЗМЕТОЧНАЯ НИТЬ ТОЖЕ ЛЕЖИТ НА ШАРЕ (19.09). Обе проверки ниже знали только про намотку и
 * рецепт, поэтому дзивари (0,2 мм, статус `now`) объявлялась незваной — а её кладут и на титуле,
 * и в мастерской, и это первое, что игрок видит после намотки. Из-за этого таблица стадии
 * показывала «доходит до нитки на шаре 4» вместо 5 и противоречила своей же колонке «отложено».
 */
const markMm = STITCH_THREAD_MM.mark;
const GAME_DIVISIONS = (Object.keys(UI_DIVISION) as string[])
  .filter((id) => ACTION_IDS.has(UI_DIVISION[id]!));
const marksOf = (id: string) => {
  const runtime = runtimeDivisionFor(id as DivisionId);
  return runtime ? kikuWorkingPins(runtime, 0).length : 0;
};

const MECHANICS: Mechanic[] = [
  {
    key: 'wrap',
    title: 'Механика · намотка шара',
    one: 'Шар обматывается нитью до ровной сферы — и до неё ни одно другое действие не открыто.',
    what:
      'Три прохода, толстый к тонкому: пряжа, тоньше, швейная. Видно только верхний слой, он же держит булавки.\n'
      + 'Намотку ведёт рука: виток кладётся по большому кругу, плоскость поворачивается на границе витка, а не посреди него.\n'
      + 'В коде это `MariWinder` и `WrapBuffer`; готовность считается покрытием сферы, а не числом витков.',
    needs: [],
    modules: ['src/components/temari/craft.ts'],
    entry: { call: 'MariWinder' },
    steps: Object.values(WRAP_THREAD_MM).map((w) => `${w.label} ${w.mm} мм`).concat('база готова'),
    catalogTitle: 'Каталог: нити намотки и размеры шара',
    rows: [
      ...wrapYarns.map((y) => ({
        name: `${y.names.ru} — ${y.mm} мм`,
        state: wrapMm.includes(y.mm) ? 'кладётся проходом намотки' : 'в намотке не участвует',
        live: wrapMm.includes(y.mm),
      })),
      ...MARI_CATALOG.map((s) => ({
        name: `${s.label} — окружность ${s.C} см`,
        state: s.C === MARI_C_CM ? 'на нём и считается геометрия' : `геометрия под ${MARI_C_CM} см, перенос не проверен`,
        live: s.C === MARI_C_CM,
      })),
    ],
    limits: [
      `Размер шара не выбирается: \`MARI_C_CM\` = ${MARI_C_CM} см вписан константой, остальные ${MARI_CATALOG.length - 1} строки каталога существуют только как данные.`,
      'Цвет намотки выбирается на титуле, толщина — ползунком; самой нити из каталога игрок не выбирает.',
    ],
  },
  {
    key: 'marking',
    title: 'Механика · разметка',
    one: 'Дзивари: большие круги делят поверхность и задают, где вообще может стоять стежок.',
    what:
      'Разметка идёт фазами: полоска на обхват, полюса, экватор, меридианы, у комбинированных — квадраты и V-линейка, потом юг.\n'
      + `Простое 8 — это ${SIMPLE_THREADS.length} больших кругов, C8 добавляет ещё ${C8_EXTRA.length} квадратов у полюсов.\n`
      + 'Пока фаза не доведена до конца, вышивка закрыта: это `needFinishedMarking` в `actions.ts`.',
    needs: ['wrap'],
    modules: ['src/components/temari/jiwari.ts', 'src/components/temari/division.ts'],
    entry: { action: 'jiwari-simple' },
    steps: [`${SIMPLE_THREADS.length} больших кругов`, 'фазы до «done»', 'метки-булавки'],
    catalogTitle: 'Каталог: разметки',
    rows: DIVISION_CATALOG.map((d) => {
      const button = !!UI_DIVISION[d.id] && ACTION_IDS.has(UI_DIVISION[d.id]!);
      const sewable = MOTIF_CATALOG.some((m) => implementsOn(m, d.id));
      return {
        name: d.names.ru,
        state: !button ? 'только данные, кнопки нет'
          : sewable ? 'кнопка есть, и на ней есть что шить'
          : 'кнопка есть, узора под неё нет',
        live: button,
      };
    }),
    limits: [
      `Кнопкой выбираются ${GAME_DIVISIONS.length} разметки из ${DIVISION_CATALOG.length}; остальные — строки каталога без геометрии в коде.`,
      `Узор с рецептом есть ровно на одной из них; на прочих разметка ложится, а шить нечем.`,
    ],
  },
  {
    key: 'recipe',
    title: 'Механика · рецепт узора',
    one: 'Рецепт — то единственное, что решает, дадут ли шить этот узор на этой разметке.',
    what:
      '`motifSupport(разметка, семья)` спрашивают все кнопки узоров и обе кнопки шитья; без «да» кнопка гаснет с причиной.\n'
      + '`PatternRecipe` — не пересказ книги, а геометрия одной реализации: метки, доля пути от экватора, нить, перехлёст, растяжка, подхват.\n'
      + 'Важная тонкость: `motifSupport` различает СЕМЬИ, а не строки каталога. Карта сверяет точный `divisionId` и собственный рецепт строки с реально исполняемым рецептом; поддержка семьи не открывает её варианты.',
    needs: ['marking'],
    modules: ['src/components/temari/patterns.ts', 'src/components/temari/kagari.ts'],
    entry: { action: 'motif-kiku' },
    steps: ['motifSupport(разметка, семья)', 'PatternRecipe', 'compileKiku'],
    catalogTitle: 'Каталог: узоры',
    rows: MOTIF_CATALOG.map((m) => ({
      name: m.names.ru,
      state: `${compatibilityState(m)}; ${implementationOf(m).implemented
        ? 'точный рецепт исполняется, полная приёмка открыта'
        : implementationOf(m).reason}`,
      live: implementationOf(m).implemented,
    })),
    limits: [
      `Поле \`recipe\` заполнено у ${RECIPES.length} строки из ${MOTIF_CATALOG.length}.`,
      `Кнопок узора в мастерской ${MOTIF_CATALOG.filter((m) => m.appears === 'dock').length} плюс свободный эскиз; у трёх из них подпись «Позже» и запрет от \`needRecipe\`.`,
      `\`MOTIF_LIST\` в \`patterns.ts\` перечисляет «none» и «kiku» — и не используется нигде, кроме своего теста: список узоров интерфейсу задают действия, а не он.`,
    ],
  },
  {
    key: 'marks',
    title: 'Механика · метки под узор',
    one: 'Прежде чем шить, игрок ставит булавки ровно туда, где рецепт назначил метки.',
    what:
      '`kikuWorkingPins` выдаёт рабочие метки полюса: сам полюс плюс внешние точки на трети пути от экватора.\n'
      + '`snapToKikuMark` притягивает нажатие к ближайшей, `kikuMarksReady` держит кнопку шитья, пока стоят не все.\n'
      + 'Метки приходят из рецепта: без него `kikuWorkingPins` возвращает пустой список, и ставить нечего.',
    needs: ['marking', 'recipe'],
    modules: ['src/components/temari/patterns.ts', 'src/components/temari/local-marking.ts'],
    entry: { action: 'pin' },
    steps: ['kikuWorkingPins', 'snapToKikuMark', 'kikuMarksReady'],
    catalogTitle: 'Каталог: рабочие метки по разметкам',
    rows: GAME_DIVISIONS.map((id) => {
      const n = marksOf(id);
      const d = DIVISION_CATALOG.find((x) => x.id === id);
      return {
        name: `${d ? d.names.ru : id} — ${n} рабочих меток`,
        state: n > 0 ? 'метки есть, кику по ним шьётся' : 'меток нет: рецепта под эту разметку не существует',
        live: n > 0,
      };
    }),
    limits: [
      'Метки умеет выдавать только кику: у любого другого узора своего набора меток в коде нет.',
      'Метки дзивари и рабочие метки узора — разные вещи: дальний полюс и экватор держат разметку, но не этот цветок.',
    ],
  },
  {
    key: 'kagari',
    title: 'Механика · укладка стежка',
    one: 'Кагари: рецепт разворачивается в ряд операций, и нить ложится виток за витком поверх уже лежащих.',
    what:
      '`compileKiku` превращает рецепт в `KagariOp` — положить на шар, подхватить у метки, встать поверх нужных прежних рядов (`stackOver`).\n'
      + 'Рабочих нитей две, A и B, они идут попеременно и паркуются между кай; ряды считаются до вместимости полюса (`kikuFit`).\n'
      + 'Дальше `stitches.ts` строит из этого ленты и трубки для кадра.',
    needs: ['recipe', 'marks'],
    modules: ['src/components/temari/stitches.ts', 'src/components/temari/patterns.ts', 'src/components/temari/kagari.ts'],
    entry: { action: 'fill' },
    steps: ['compileKiku → KagariOp', 'две группы: A и B', 'stackOver: кто поверх кого', 'Stitch → кадр'],
    catalogTitle: 'Каталог: стежки',
    rows: STITCH_CATALOG.map((s) => {
      const sewn = RECIPES.some((r) => r.stitch === s.id);
      return {
        name: s.names.ru,
        state: sewn ? 'им и шьётся действующий рецепт'
          : ENGINE_STITCHES.has(s.id) ? 'рецепт умеет его назвать, но ни один рецепт не называет'
          : 'движок этот стежок не знает',
        live: sewn,
      };
    }),
    limits: [
      `Тип \`RecipeStitch\` знает ${ENGINE_STITCHES.size} имени, рецепт называет ${new Set(RECIPES.map((r) => r.stitch)).size}; остальные ${STITCH_CATALOG.length - ENGINE_STITCHES.size} строк каталога движку не имена, а текст.`,
      'Стежок не выбирается отдельно: он приходит вместе с рецептом узора.',
      'Отрисовка умеет только поднимать нить над лежащей. Там, где по ремеслу нить должна пройти ПОД пучком, перехлёст остаётся неверным.',
    ],
  },
  {
    key: 'spatial',
    title: 'Механика · нить в пространстве',
    one: 'Настоящая толстая нить: длина, изгибная жёсткость, контакт с шаром и с собой — вместо дуги по сфере.',
    what:
      'Задача поставлена как толстая нить: цель — интеграл квадрата скорости, кривизна ограничена радиусом `ρ_min`, сертификат ККТ на NNLS.\n'
      + 'Нижний подхват, первый круг кику на простом 8 и лестница разрешений приняты численно и показываются в `lab.html`.\n'
      + 'В игру это не включено: в кадре мастерской по-прежнему дуги и подъёмы из `stitches.ts`.',
    needs: ['kagari'],
    modules: [
      'src/components/temari/spatial-contact.ts',
      'src/components/temari/curvature-bound.ts',
      'src/components/temari/taut-contact.ts',
      'src/components/temari/thread-geometry.ts',
      'src/components/temari/lower-kagari.ts',
      'src/components/temari/computed-lower-kagari.ts',
      'src/components/temari/thick-rope-ladder.ts',
      'src/components/temari/s8-kiku.ts',
      'src/components/temari/spatial-spline-seed.ts',
      'src/components/temari/spatial-catch-fixture.ts',
    ],
    entry: {},
    steps: ['постановка: толстая нить', 'решатель + сертификат', 'лестница разрешений', 'lab.html'],
    catalogTitle: 'Каталог: модули этой механики',
    rows: [
      'src/components/temari/spatial-contact.ts',
      'src/components/temari/curvature-bound.ts',
      'src/components/temari/taut-contact.ts',
      'src/components/temari/thread-geometry.ts',
      'src/components/temari/lower-kagari.ts',
      'src/components/temari/computed-lower-kagari.ts',
      'src/components/temari/thick-rope-ladder.ts',
      'src/components/temari/s8-kiku.ts',
      'src/components/temari/spatial-spline-seed.ts',
      'src/components/temari/spatial-catch-fixture.ts',
    ].map((f) => ({
      name: f.replace('src/components/temari/', ''),
      state: MODULE_STATE(f),
      live: GAME.has(f),
    })),
    limits: [
      'Численная приёмка — не ремесленная: принята заданная конструкция, а не форма после затягивания.',
      'Сжатие нити не обосновано источником; сечение держится круглым и несжимаемым.',
      'Перенести это в мастерскую нельзя одной заменой: решатель считает медленно, а кадр должен собираться за миллисекунды.',
    ],
  },
  {
    key: 'kata',
    title: 'Механика · ката',
    one: 'Отдельный режим: не шить, а заливать грани разметки в цвет по образцу.',
    what:
      'У каждой головоломки своя разметка, своя палитра и целевая раскладка; совпадение проверяет `fillsMatch`, решённые копятся в `solved`.\n'
      + 'Режим целиком собран — состояние, отрисовка, подсчёт решённых в накладке.\n'
      + 'Попасть в него нельзя: `enterKata` не вызывается ни из одного файла интерфейса.',
    needs: ['marking'],
    modules: ['src/components/temari/puzzles.ts'],
    entry: { call: 'enterKata' },
    steps: ['заливка граней', 'fillsMatch', 'solved'],
    catalogTitle: 'Каталог: головоломки',
    rows: PUZZLES.map((p) => ({
      name: `${p.name} — ${p.hint}`,
      state: UI_SOURCE.includes('enterKata') ? 'открыта из интерфейса' : 'входа в режим нет',
      live: UI_SOURCE.includes('enterKata'),
    })),
    limits: [
      'Заливка грани — не вышивка: узор здесь не шьётся, а закрашивается.',
      'Кнопки «ката» на титуле нет: `enterKata` объявлен в хранилище состояния и не вызван ни из одного файла интерфейса.',
    ],
  },
];

const BY_KEY = new Map(MECHANICS.map((m) => [m.key, m]));
const titleOf = (key: string) => BY_KEY.get(key)?.title ?? key;

/** Состояние механики — из файлов и списка действий, а не с наших слов. */
function stateOf(m: Mechanic) {
  const missing = m.modules.filter((f) => !GAME.has(f) && !LAB.has(f));
  const inGame = m.modules.every((f) => GAME.has(f));
  const reachable = m.entry.action ? ACTION_IDS.has(m.entry.action)
    : m.entry.call ? UI_SOURCE.includes(m.entry.call)
    : false;
  if (inGame && reachable) return 'работает';
  if (missing.length === m.modules.length) return 'задумано';
  return 'собрано, но не в игре';
}
const STATE_OF = new Map(MECHANICS.map((m) => [m.key, stateOf(m)]));
const liveOf = (m: Mechanic) => m.rows.filter((r) => r.live).length;

// ── что пишет сборщик, и ничего больше ───────────────────────────────────────
/**
 * A file outside these paths is never written, never checked and never removed:
 * the vault is also where the owner draws (Excalidraw) and where Obsidian keeps
 * its settings and plugins.
 *
 * `RETIRED_DIRS` — папки, которые сборщик писал раньше и больше не пишет. Они
 * остаются «своими» ровно для того, чтобы `--write` их вычистил: убрать их из
 * списка совсем значило бы оставить в хранилище три заметки-сироты навсегда.
 */
const OWNED_FILES = ['00 Карта ремесла.md', '00 Совместимость узоров.md'];
const OWNED_DIRS = ['01 Механики', '02 Узоры', '03 Разметки', '04 Стежки', '05 Нити', '06 Шары'];
const RETIRED_DIRS = ['01 Этапы'];
const owned = (path: string) =>
  OWNED_FILES.includes(path) || [...OWNED_DIRS, ...RETIRED_DIRS].some((d) => path.startsWith(d + '/'));

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

const slug = (s: string) => s.replace(/[\\/:*?"<>|#^[\]]/g, '·').trim();
const title = (names: CatalogName) => slug(names.ru);
const head = (names: CatalogName) => `${names.ja}（${names.reading}） · ${names.en}`;

/**
 * Одно имя — не всегда одна заметка. «Судзидагику» и «сикаку» есть в каталоге
 * и узором, и стежком: короткая ссылка `[[сикаку]]` тогда неоднозначна, и
 * Obsidian выбирает файл за нас. Поэтому имена сперва пересчитываются, и там,
 * где имя занято дважды, ссылка пишется с путём и подписью.
 */
const HOMONYMS = (() => {
  const seen = new Map<string, number>();
  const bump = (name: string) => seen.set(slug(name), (seen.get(slug(name)) ?? 0) + 1);
  for (const m of MECHANICS) bump(m.title);
  for (const m of MOTIF_CATALOG) bump(m.names.ru);
  for (const d of DIVISION_CATALOG) bump(d.names.ru);
  for (const s of STITCH_CATALOG) bump(s.names.ru);
  for (const y of YARN_CATALOG) bump(y.names.ru);
  for (const s of MARI_CATALOG) bump(s.label);
  return new Set([...seen].filter(([, n]) => n > 1).map(([name]) => name));
})();
const FOLDER = {
  mechanic: '01 Механики', motif: '02 Узоры', division: '03 Разметки',
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
 * встречные ссылки дают в графе два ребра друг поверх друга. Имена полей
 * русские: их читает владелица в панели «Свойства», и то же имя Breadcrumbs
 * берёт как имя ребра. Ссылка в значении обязана быть в кавычках — иначе YAML
 * видит вложенный список; список ссылок пишется отдельными строками с дефисом.
 */
const frontmatter = (props: [string, string | string[]][]) =>
  props.length
    ? ['---', ...props.flatMap(([k, v]) =>
        Array.isArray(v) ? [`${k}:`, ...v.map((one) => `  - "${one}"`)] : [`${k}: "${v}"`]), '---', '']
    : [];

const files = new Map<string, string>();
const put = (path: string, body: string) => files.set(path, body.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n');
const footer = '\n\n---\n\n*Собрано `scripts/build-craft-vault.mts` из кода игры. Править — там: эти файлы перезаписываются.*';

/**
 * Кликабельный узел mermaid — проверено по коду Obsidian 1.13.7. После
 * отрисовки Obsidian ищет `[*|class*="internal-link"] > g.label foreignObject
 * > div` и подменяет содержимое на `<a class="internal-link" href=ТЕКСТ>`.
 *
 * СЛЕДСТВИЕ, КОТОРОЕ РЕШАЕТ ВСЁ: ссылка ведёт по ПОДПИСИ узла. Подпись обязана
 * быть точным именем существующей заметки, буква в букву, иначе ссылка уходит
 * в пустоту и молча. Поэтому каждая такая подпись собирается здесь и в конце
 * сверяется со списком написанных заметок — сборка падает, а не выпускает
 * хранилище с мёртвой схемой.
 */
const clickable: { where: string; label: string }[] = [];
/**
 * Схема. `note` делает узел ссылкой (Obsidian берёт цель из ПОДПИСИ, поэтому подпись обязана быть
 * точным именем заметки). `idle` рисует его пунктиром — «собрано, но в игре не включено»:
 * без этого все узлы одинаковы, и стадию, за которой схему и просили, на картинке не видно.
 */
function mermaid(
  lines: string[],
  nodes: { id: string; label: string; note?: boolean; idle?: boolean }[],
  edges: string[], where: string,
) {
  const links = nodes.filter((n) => n.note);
  const idle = nodes.filter((n) => n.idle);
  for (const n of links) clickable.push({ where, label: n.label });
  lines.push('```mermaid', 'flowchart LR');
  if (idle.length) lines.push('  classDef idle stroke-dasharray:5 3,opacity:0.65;');
  for (const n of nodes) lines.push(`  ${n.id}["${n.label}"]`);
  for (const e of edges) lines.push(`  ${e}`);
  if (links.length) lines.push(`  class ${links.map((n) => n.id).join(',')} internal-link;`);
  if (idle.length) lines.push(`  class ${idle.map((n) => n.id).join(',')} idle;`);
  lines.push('```');
}

// ── механики: заметки второго этажа ──────────────────────────────────────────
for (const m of MECHANICS) {
  const state = STATE_OF.get(m.key)!;
  const dependents = MECHANICS.filter((x) => x.needs.includes(m.key));
  const lines = [
    ...frontmatter(m.needs.length ? [['нужна', m.needs.map((k) => `[[${titleOf(k)}]]`)]] : []),
    `# ${m.title}`, '',
    `> ${m.one}`, '',
    `- Состояние: **${state}**`,
    `- Нужна: ${m.needs.length ? m.needs.map((k) => link(FOLDER.mechanic, titleOf(k))).join(', ') : 'ничего — это начало цепочки'}`,
    `- Без неё не работает: ${dependents.length ? dependents.map((x) => link(FOLDER.mechanic, x.title)).join(', ') : 'ничего'}`,
    `- Живых строк каталога: **${liveOf(m)} из ${m.rows.length}**`,
    '',
    m.what, '',
    '## Как работает', '',
  ];
  {
    // Внутренние шаги подписями заметок не являются — кликабельными их делать
    // нельзя: ссылка по подписи ушла бы в пустоту. Кликабельны только соседи.
    const nodes: { id: string; label: string; note?: boolean }[] = [];
    const edges: string[] = [];
    m.needs.forEach((k, i) => nodes.push({ id: `IN${i}`, label: titleOf(k), note: true }));
    m.steps.forEach((s, i) => nodes.push({ id: `S${i}`, label: s }));
    dependents.forEach((x, i) => nodes.push({ id: `OUT${i}`, label: x.title, note: true }));
    m.needs.forEach((_, i) => edges.push(`S0 --> IN${i}`));
    // Тот же разворот, что и на карте: шаги читаются «что за чем», слева направо.
    for (let i = 1; i < m.steps.length; i++) edges.push(`S${i - 1} --> S${i}`);
    dependents.forEach((_, i) => edges.push(`S${m.steps.length - 1} --> OUT${i}`));
    mermaid(lines, nodes, edges, `01 Механики/${m.title}.md`);
  }
  lines.push('', 'Стрелка читается «что за чем»: слева то, что делают раньше.', '');
  lines.push(`## ${m.catalogTitle}`, '');
  // Каталог здесь ТЕКСТОМ: ссылками он собрал бы обратно хаб на все строки.
  for (const r of m.rows) lines.push(`- ${r.live ? '**' + r.name + '**' : r.name} — ${r.state}`);
  lines.push('', `Живых: ${liveOf(m)} из ${m.rows.length}.`, '');
  lines.push('## Чем ограничена', '');
  for (const l of m.limits) lines.push(`- ${l}`);
  put(`01 Механики/${m.title}.md`, lines.join('\n') + footer);
}

// ── узоры ────────────────────────────────────────────────────────────────────
for (const m of MOTIF_CATALOG) {
  const divisions = declaredDivisions(m);
  const confirmed = confirmedDivisions(m);
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
      ['разметка_статус', compatibilityState(m)],
      ...(confirmed.length ? [['разметка', confirmed.map((id) => link(FOLDER.division, divisionName(id)))] as [string, string[]]] : []),
      ...(m.compatibility.state === 'unverified'
        ? [['разметка_кандидаты', [...divisions]] as [string, string[]]] : []),
      ['реализация_строки', implementationOf(m).implemented ? 'есть' : 'нет'],
      ...(stitch ? [['стежок', link(FOLDER.stitch, stitch.names.ru)] as [string, string]] : []),
      ...(yarn ? [['нить', link(FOLDER.yarn, yarn.names.ru)] as [string, string]] : []),
    ]),
    `# ${title(m.names)}`, '', `*${head(m.names)}*`, '', m.note, '',
    '## Чем и на чём', '',
    `- Разметка: ${divisions.length ? divisions.map(divisionName).join(', ') : 'не установлена'} (${compatibilityState(m)})`,
    `- Основание: ${m.compatibility.note}`,
    ...(m.compatibility.state === 'documented'
      ? m.compatibility.sourceUrls.map((url) => `- Источник совместимости: [ремесленное описание](${url})`) : []),
    `- Стежок: ${stitch ? link(FOLDER.stitch, stitch.names.ru) : m.stitch}`,
    `- Механика: ${MECHANICS.find((x) => x.key === 'recipe')!.title}`,
    `- Состояние: **${STATUS[m.status]}**`,
  ];
  if (m.centers) lines.push(`- Центры: ${m.centers === 'facing-pole' ? 'полюс, обращённый к мастеру' : 'оба полюса'}`);
  if (m.direction) lines.push(`- Ход: ${m.direction === 'outward' ? 'от полюса' : 'к полюсу'}`);
  if (m.crossing) lines.push(`- Перехлёст: ${m.crossing}`);
  if (m.skip) lines.push(`- Через сколько лучей: ${m.skip}`);
  const uiMotif = UI_MOTIF[m.family];
  const implementation = implementationOf(m);
  lines.push('', '## Достижимость в игре', '',
    `- Место по каталогу: ${shown(m.appears)} (не доказательство наличия этой строки в интерфейсе)`,
    `- Действие семейства: ${uiMotif && ACTION_IDS.has(uiMotif) ? `\`${uiMotif}\`; оно не выбирает все варианты семьи` : 'нет'}`,
    `- Рецепт этой строки исполняется: **${implementation.implemented ? 'да' : 'нет'}**; ${implementation.reason}`,
    `- Своя геометрия (поле \`recipe\`): ${m.recipe ? '**есть**' : '**нет**'}`,
    `- Приёмка: ${implementation.implemented
      ? 'полный узор не принят; лабораторные этапы и дефекты мастерской учитываются отдельно ([#94](https://github.com/newYurk/temari/issues/94)). Человеческая приёмка открыта.'
      : 'исполняемый вариант этой строки не проверен'}`);
  if (m.appears === 'dock' && !implementation.implemented) {
    lines.push('- Кнопка семейства не означает готовый рецепт этой строки.');
  }
  lines.push('', '## Что требуется этому варианту', '');
  {
    const nodes = [{ id: 'M', label: title(m.names) }];
    const edges: string[] = [];
    if (divisions.length) {
      divisions.forEach((id, i) => {
        nodes.push({ id: `D${i}`, label: divisionName(id) });
        edges.push(m.compatibility.state === 'documented'
          ? `M -->|требует по источнику| D${i}`
          : `M -.->|заявлено, проверить| D${i}`);
      });
    } else {
      nodes.push({ id: 'U', label: 'Точное деление не установлено' });
      edges.push('M -.->|вопрос, не запрет| U');
    }
    mermaid(lines, nodes, edges, `02 Узоры/${title(m.names)}.md`);
    lines.push('', 'Сплошная стрелка: подтверждённое требование этого варианта. Пунктир: непроверенное утверждение или вопрос.',
      'Это не порядок действий и не схема прохода нити. Неуказанные сочетания остаются неизвестными, а не запрещёнными.');
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
  const declared = motifsForDivision(d.id);
  const confirmed = declared.filter((m) => confirmedDivisions(m).includes(d.id));
  const candidates = declared.filter((m) => m.compatibility.state === 'unverified');
  const base = d.builtOn ? DIVISION_CATALOG.find((x) => x.id === d.builtOn) : undefined;
  const lines = [
    ...frontmatter(base ? [['основа', link(FOLDER.division, base.names.ru)]] : []),
    `# ${title(d.names)}`, '', `*${head(d.names)}*`, '', d.note, '',
    '## О ней', '',
    `- Вид: ${d.kind === 'simple' ? 'простое деление' : d.kind === 'combination' ? 'комбинированное' : 'дополнительное'}`,
    ...(d.poles ? [`- Центров: ${d.poles}`] : []),
    ...(d.rays ? [`- Лучей: ${d.rays}`] : []),
    ...(d.builtOn ? [`- Построена на: ${base ? link(FOLDER.division, base.names.ru) : d.builtOn}`] : []),
    `- Механика: ${MECHANICS.find((x) => x.key === 'marking')!.title}`,
    `- Состояние: **${STATUS[d.status]}**`,
    // Обратное перечисление: то же самое слово в слово показывает панель
    // Backlinks, теперь наполняемая свойством «разметка» у самих узоров.
    '', '## Варианты с подтверждённой совместимостью', '',
    ...(confirmed.length ? confirmed.map((m) => `- ${title(m.names)}: ${implementationOf(m).implemented ? 'рецепт исполняется; приёмка открыта' : 'не реализовано'}`)
      : ['- В каталоге нет подтверждённых вариантов. Это не запрет ремесла.']),
    '', '## Заявлено в каталоге, нужно проверить', '',
    ...(candidates.length ? candidates.map((m) => `- ${title(m.names)}: ${m.compatibility.note}`) : ['- Нет заявленных вариантов.']),
  ];
  const uiDivision = UI_DIVISION[d.id];
  const sewable = declared.filter((m) => implementsOn(m, d.id));
  lines.push('', '## Достижимость в игре', '',
    `- В интерфейсе: ${shown(d.appears)}${uiDivision && ACTION_IDS.has(uiDivision) ? ` (действие \`${uiDivision}\`)` : ''}`,
    `- Исполняемых вариантов на этой точной разметке: ${sewable.length} из ${declared.length} заявленных.`);
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
    `- Механика: ${MECHANICS.find((x) => x.key === 'kagari')!.title}`,
    `- Состояние: **${STATUS[s.status]}**`,
    // Тоже обратное перечисление: его даёт Backlinks из свойства «стежок».
    '', '## Каким узорам нужен', '',
    ...(used.length ? used.map((m) => `- ${title(m.names)}`) : ['- пока ни одному']),
  ];
  const sewable = used.filter((m) => !!m.recipe);
  lines.push('', '## Достижимость в игре', '',
    `- В интерфейсе: ${shown(s.appears)}`,
    `- Движок называет этот стежок: ${ENGINE_STITCHES.has(s.id) ? '**да**' : '**нет** — рецепт его не знает'}`,
    `- Узоров, которые им действительно шьются: ${sewable.length} из ${used.length}`);
  put(`04 Стежки/${title(s.names)}.md`, lines.join('\n') + footer);
}

// ── нити ─────────────────────────────────────────────────────────────────────
for (const y of YARN_CATALOG) {
  const mechanic = y.role === 'wrap' ? 'wrap' : y.role === 'mark' ? 'marking' : 'kagari';
  const lines = [
    `# ${title(y.names)}`, '', `*${head(y.names)}*`, '', y.note, '',
    `- Толщина: **${y.mm} мм**`,
    `- Роль: ${y.role === 'wrap' ? 'намотка' : y.role === 'mark' ? 'разметка' : 'вышивка'} — ${titleOf(mechanic)}`,
    `- Состояние: **${STATUS[y.status]}**`,
    ...(y.kind
      ? [`- В кадре рисуется как \`${y.kind}\`${THREAD_KINDS.includes(y.kind) ? '' : ' (вид, которого рендер не знает)'}`]
      : ['- Рендер эту нить пока не рисует отдельно']),
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
    `- Кладётся ли она сегодня: ${
      y.role === 'wrap' && wrapMm.includes(y.mm) ? '**да**, это один из проходов намотки'
        : y.role === 'mark' && y.mm === markMm ? '**да**, ею ложится разметка — и на титуле, и в мастерской'
        : recipeMm.includes(y.mm) ? '**да**, ею шьёт действующий рецепт'
        : '**нет** — ни намотка, ни разметка, ни рецепт её не зовут'}`,
  ];
  put(`05 Нити/${title(y.names)}.md`, lines.join('\n') + footer);
}

// ── размеры шара ─────────────────────────────────────────────────────────────
for (const s of MARI_CATALOG) {
  const lines = [
    `# ${slug(s.label)}`, '', s.note, '',
    `- Окружность: **${s.C} см** (радиус ${(s.C / (2 * Math.PI)).toFixed(2)} см)`,
    `- Механика: ${titleOf('wrap')}`,
    `- Состояние: **${STATUS[s.status]}**`,
    ...(s.C === MARI_C_CM
      ? [`- Именно на этом размере игра и считает: \`MARI_C_CM\` = ${MARI_C_CM}.`]
      : ['', `> Геометрия узора сегодня считается для эталона ${MARI_C_CM} см: перенос рецепта на этот размер ещё не проверен.`]),
  ];
  put(`06 Шары/${slug(s.label)}.md`, lines.join('\n') + footer);
}

// ── 00 Карта ремесла: приборная панель ───────────────────────────────────────
/**
 * Скелет входной заметки один на три игры: заголовок, «Стадия», «Как это
 * устроено» с ОДНОЙ схемой в теле, «Механики», «Что осталось», «Чего здесь нет».
 * Числа в таблице считаются, а не пишутся руками.
 */
const dockMotifButtons = CRAFT_ACTIONS.filter((a) => a.id.startsWith('motif-')).length;
const dockDivisionButtons = CRAFT_ACTIONS.filter((a) => a.id.startsWith('jiwari-')).length;
const recipeStitches = new Set(RECIPES.map((r) => r.stitch));
const liveYarns = YARN_CATALOG.filter((y) =>
  (y.role === 'wrap' && wrapMm.includes(y.mm)) || (y.role === 'mark' && y.mm === markMm) || recipeMm.includes(y.mm));
const later = (xs: { status: CatalogStatus }[]) => xs.filter((x) => x.status !== 'now').length;

const stageRows: [string, string, string, string, string][] = [
  ['узоры', `${MOTIF_CATALOG.length}`,
    `${dockMotifButtons} (включая свободный эскиз)`,
    `**${RECIPES.length}** — своя геометрия только у «${MOTIF_CATALOG.find((m) => m.recipe)?.names.ru ?? '—'}»`,
    `${later(MOTIF_CATALOG)}`],
  ['разметки', `${DIVISION_CATALOG.length}`,
    `${dockDivisionButtons} (включая «без сетки»)`,
    `**${DIVISION_CATALOG.filter((d) => MOTIF_CATALOG.some((m) => implementsOn(m, d.id))).length}** — на остальных шить нечем`,
    `${later(DIVISION_CATALOG)}`],
  ['стежки', `${STITCH_CATALOG.length}`, 'выбора нет — приходит с рецептом',
    `**${STITCH_CATALOG.filter((s) => recipeStitches.has(s.id)).length}** из ${ENGINE_STITCHES.size}, которые движок умеет назвать`,
    `${later(STITCH_CATALOG)}`],
  ['нити', `${YARN_CATALOG.length}`, 'выбирается цвет, не нить',
    // Разбивка по ролям, а не «намотка и всё остальное»: разметочная нить — третий случай,
    // и сваливать её в «нить рецепта» значит снова потерять её из виду.
    `**${liveYarns.length}** — ${[
      [liveYarns.filter((y) => y.role === 'wrap').length, 'прохода намотки'],
      [liveYarns.filter((y) => y.role === 'mark').length, 'нить разметки'],
      [liveYarns.filter((y) => y.role === 'kagari').length, 'нить рецепта'],
    ].filter(([n]) => n).map(([n, w]) => `${n} ${w}`).join(', ')}`,
    `${later(YARN_CATALOG)}`],
  ['размеры шара', `${MARI_CATALOG.length}`, 'выбора нет',
    `**${MARI_CATALOG.filter((s) => s.C === MARI_C_CM).length}** — \`MARI_C_CM\` = ${MARI_C_CM} см вписан константой`,
    `${later(MARI_CATALOG)}`],
];

const mapLines: string[] = [
  '# Темари — карта',
  '',
  '> Игрок наматывает шар, размечает его нитями и вышивает по меткам. Тянет не сюжет, а то, что рука кладёт настоящую нить:',
  '> ряд ложится поверх ряда, и промах виден сразу — как в ремесле.',
  '',
  '## Что можно вышить на выбранной разметке',
  '',
  'Откройте [[00 Совместимость узоров]]: точные разметки, основания совместимости и реализация показаны отдельно.',
  'Отсутствие рецепта в игре не означает невозможность узора в ремесле. Порядок механик ниже отвечает на другой вопрос.',
  '',
  '## Стадия',
  '',
  // Ответ стоит НАД таблицей: сначала «где мы», потом доказательство. Пока вывод лежал под
  // таблицей 5×5, глаз проходил 25 клеток с числами и только потом узнавал, что из них следует.
  `**Каталог на ${MOTIF_CATALOG.length + DIVISION_CATALOG.length + STITCH_CATALOG.length + YARN_CATALOG.length + MARI_CATALOG.length} строк, `
  + `а шьётся из него одна связка** — «${MOTIF_CATALOG.find((m) => m.recipe)?.names.ru ?? '—'}» на «${DIVISION_CATALOG.find((d) => d.id === 's8')?.names.ru ?? '—'}» `
  + `стежком «${STITCH_CATALOG.find((s) => recipeStitches.has(s.id))?.names.ru ?? '—'}» нитью «${YARN_CATALOG.find((y) => recipeMm.includes(y.mm))?.names.ru ?? '—'}». `
  + `Это не ошибка карты: каталог ведётся заранее, а компилятор рецептов пока один.`,
  '',
  '| что | строк в каталоге | показано в мастерской | доходит до нитки на шаре | отложено |',
  '| --- | ---: | --- | --- | ---: |',
  ...stageRows.map((r) => `| ${r.join(' | ')} |`),
  '',
  `Чего нет вовсе: выбора нити и размера шара, второго рецепта, входа в режим ката.`,
  '',
  '## Как это устроено',
  '',
];
{
  const nodes = MECHANICS.map((m, i) =>
    ({ id: `M${i}`, label: m.title, note: true, idle: STATE_OF.get(m.key) !== 'работает' }));
  const index = new Map(MECHANICS.map((m, i) => [m.key, `M${i}`]));
  // ⚑ НАПРАВЛЕНИЕ: «что за чем», а не «что от чего зависит» (19.09). Зависимость пишется в
  // MECHANICS.needs как «мне нужен тот», и стрелка `M1 --> M0` в flowchart LR ставила намотку —
  // первый шаг ремесла — в КОНЕЦ строки, а недоделанное в начало. Глаз читает слева направо и
  // встречал цепочку задом наперёд. Рисуем обратное ребро: данные те же, порядок чтения верный.
  const edges = MECHANICS.flatMap((m, i) => m.needs.map((k) => `${index.get(k)} --> M${i}`));
  mermaid(mapLines, nodes, edges, '00 Карта ремесла.md');
}
mapLines.push('',
  'Стрелка читается «что за чем»: от того, что уже есть, к тому, что оно открывает.',
  'Узел — механика, а не строка каталога: каталог лежит внутри механики. Пунктиром — собрано, но в игре не включено.',
  'Нажатие на узел открывает её заметку.',
  '',
  '## Механики',
  '',
  ...MECHANICS.map((m) =>
    `- ${link(FOLDER.mechanic, m.title)} — ${m.one} **${STATE_OF.get(m.key)}**, живых строк ${liveOf(m)} из ${m.rows.length}.`),
  '',
  '## Что осталось',
  '',
);
{
  const noRecipe = MOTIF_CATALOG.length - RECIPES.length;
  const noSewable = DIVISION_CATALOG.length
    - DIVISION_CATALOG.filter((d) => MOTIF_CATALOG.some((m) => implementsOn(m, d.id))).length;
  const dark = MOTIF_CATALOG.filter((m) => m.appears === 'dock' && !m.recipe).length;
  mapLines.push(
    `- **Второй рецепт.** Без него ${noRecipe} строк узоров и ${noSewable} разметок стоят на месте, `
    + `а ${dark} кнопки в мастерской гаснут с подписью «Позже». Держит: ${link(FOLDER.mechanic, titleOf('recipe'))}.`,
    `- **Перехлёсты.** Отрисовка умеет только поднимать нить; там, где по ремеслу она должна пройти ПОД пучком, `
    + `рисунок остаётся неверным. Держит: ${link(FOLDER.mechanic, titleOf('kagari'))}.`,
    // Незакрытые вопросы механик не выписываются руками: берём те, чьё
    // состояние сам сборщик посчитал не «работает», и спрашиваем их же, что их держит.
    ...MECHANICS.filter((m) => STATE_OF.get(m.key) !== 'работает').map((m) =>
      `- **${(STATE_OF.get(m.key) ?? '').replace(/^./, (c) => c.toUpperCase())}: ${m.title.replace('Механика · ', '')}.** `
      + `${m.limits[m.limits.length - 1] ?? ''} Держит: ${link(FOLDER.mechanic, m.title)}.`),
    `- **Каталог не управляет игрой.** \`library.ts\` отсутствует в замыкании \`src/pages.tsx\`. `
    + `Сборщик теперь сверяет точный рецепт строки с \`motifSupport\` и адаптером разметки, но это не доказывает исправность контактов или человеческую приёмку.`,
    '',
    '## Чего здесь нет',
    '',
    '- На чём стоят числа и что из них наш выбор — `docs/assumptions.md`, `spec/craft-sources.md`, `spec/embroidery-model.md`.',
    '- Текущая правка, проверки и договорённости этапа — `STATE.md` и `HANDOFF.md`.',
    '- Открытые вопросы поимённо — issues на GitHub.',
    '- Пересказа спецификаций здесь нет намеренно, чтобы они не разошлись.',
  );
}
put('00 Карта ремесла.md', mapLines.join('\n') + footer);

// No wiki-links in the catalogue table: do not recreate a hub of dependencies.
const compatibilityLines = [
  '# Совместимость узоров',
  '',
  'Здесь три разных ответа: что известно о разметке, исполняется ли вариант в игре и пройдена ли приёмка.',
  '«Не установлено» не означает «невозможно». Перечень разметок не исчерпывает возможности всего семейства кику.',
  '',
  '| Вариант | Точная разметка | Основание совместимости | Реализация этой строки |',
  '| --- | --- | --- | --- |',
  ...MOTIF_CATALOG.map((m) => `| ${title(m.names)} | ${declaredDivisions(m).map(divisionName).join(', ') || 'не установлена'} | ${compatibilityState(m)} | ${implementationOf(m).implemented ? 'рецепт исполняется; приёмка открыта' : 'нет своего исполняемого рецепта'} |`),
  '',
  '## Как читать связи',
  '',
  '- Подтверждено источником: у конкретного варианта есть ссылка на ремесленный источник. Только эти разметки становятся зависимостями `разметка` в графе заметок.',
  '- Заявлено в каталоге: точное деление сохранено как кандидат, но источник ещё не сверён. Это не подтверждённая зависимость и не готовая игровая возможность.',
  '- Не установлено: семейство Simple или прежнее `any` не позволяют выбрать точное деление.',
  '- Реализация: собственный рецепт строки, его `divisionId` и реальный рецепт мастерской совпали. Поддержка другого варианта той же семьи не засчитывается.',
  '- Приёмка: наличие кода и источника не означает проверку полного узора. Лабораторные результаты S8 не закрывают дефект мастерской [#94](https://github.com/newYurk/temari/issues/94); человеческая оценка остаётся отдельной.',
  '',
  '## Три вопроса вместо одного графа',
  '',
  '- Совместимость: подходит ли варианту разметка и выбранное место? Здесь показана только проверенная часть требований к разметке.',
  '- Композиция: какие подготовительные элементы нужны и хватит ли места рядом с другими узорами? Общей проверки наложения пока нет.',
  '- Путь нити: где проходить над, под и через основу? Это задача маршрута и контактов, не ссылок Obsidian.',
  '',
  'В заметке каждого узора есть небольшая схема требований. Каталог здесь оставлен текстом, чтобы не создавать новый узел-хаб.',
];
put('00 Совместимость узоров.md', compatibilityLines.join('\n') + footer);

// ── проверка кликабельности схем ─────────────────────────────────────────────
/**
 * Ссылка мермейда ведёт по подписи узла. Подпись, не совпавшая с именем
 * заметки, ведёт в пустоту и молча — это единственный способ сломать схему так,
 * что никто не заметит. Поэтому сверяем здесь, до записи.
 */
{
  const names = new Set([...files.keys()].map((f) => f.split('/').pop()!.replace(/\.md$/, '')));
  const dead = clickable.filter((c) => !names.has(c.label));
  if (dead.length) {
    throw new Error('кликабельный узел схемы не совпал с именем заметки:\n'
      + dead.map((c) => `  ${c.where}: "${c.label}"`).join('\n'));
  }
}

seed('.obsidian/app.json', JSON.stringify({ promptDelete: false, useMarkdownLinks: false, newLinkFormat: 'shortest', attachmentFolderPath: 'Рисунки' }, null, 2) + '\n');
seed('.obsidian/appearance.json', JSON.stringify({ theme: 'system' }, null, 2) + '\n');
seed('.obsidian/core-plugins.json', JSON.stringify({"file-explorer": true, "global-search": true, "switcher": true, "graph": true, "backlink": true, "outgoing-link": true, "page-preview": true, "command-palette": true, "outline": true, "bookmarks": true, "canvas": false, "daily-notes": false, "templates": false, "note-composer": false, "tag-pane": true, "properties": true, "slash-command": false, "random-note": false, "file-recovery": true, "footnotes": false, "editor-status": true, "markdown-importer": false, "zk-prefixer": false, "word-count": true, "slides": false, "audio-recorder": false, "workspaces": false, "publish": false, "sync": true, "bases": true, "webviewer": false}, null, 2) + '\n');
// Настройки графа и закладки — СЕМЕНЕМ, А НЕ ИЗ GIT (18.09). Obsidian переписывает graph.json
// от каждого движения колёсика: держать его в git значит гонять по истории чужой зум, и раскраску
// это уже дважды сносило в Roti. Здесь лежит исходное состояние, оно ставится ТОЛЬКО если файла нет —
// то, что владелица подкрутила у себя, генератор не трогает.
seed('.obsidian/graph.json', JSON.stringify({"collapse-filter": false, "search": "-file:\"00 Карта ремесла\"", "showTags": false, "showAttachments": false, "hideUnresolved": true, "showOrphans": true, "collapse-color-groups": false, "colorGroups": [{"query": "path:\"01 Механики\"", "color": {"a": 1, "rgb": 16007990}}, {"query": "path:\"02 Узоры\"", "color": {"a": 1, "rgb": 9387314}}, {"query": "path:\"03 Разметки\"", "color": {"a": 1, "rgb": 4022150}}, {"query": "path:\"04 Стежки\"", "color": {"a": 1, "rgb": 2761760}}, {"query": "path:\"05 Нити\"", "color": {"a": 1, "rgb": 12887412}}, {"query": "path:\"06 Шары\"", "color": {"a": 1, "rgb": 7035466}}], "collapse-display": false, "showArrow": true, "textFadeMultiplier": -3, "nodeSizeMultiplier": 1.2, "lineSizeMultiplier": 0.7, "collapse-forces": false, "centerStrength": 0.15, "repelStrength": 15, "linkStrength": 0.4, "linkDistance": 420, "scale": 0.9409928231902496, "close": false}, null, 2) + '\n');
seed('.obsidian/bookmarks.json', JSON.stringify({"items": [{"type": "group", "ctime": 1789774569527, "title": "Виды графа", "items": [{"type": "graph", "ctime": 1789774569527, "title": "Механики", "options": {"collapse-filter": false, "search": "path:\"01 Механики\"", "showTags": false, "showAttachments": false, "hideUnresolved": true, "showOrphans": true, "collapse-color-groups": false, "colorGroups": [{"query": "path:\"01 Механики\"", "color": {"a": 1, "rgb": 16007990}}], "collapse-display": false, "showArrow": true, "textFadeMultiplier": -3, "nodeSizeMultiplier": 1.2, "lineSizeMultiplier": 0.7, "collapse-forces": false, "centerStrength": 0.15, "repelStrength": 15, "linkStrength": 0.4, "linkDistance": 420, "scale": 0.9409928231902496, "close": false}}, {"type": "graph", "ctime": 1789774569528, "title": "Узор и на чём он стоит", "options": {"collapse-filter": false, "search": "path:\"02 Узоры\" OR path:\"03 Разметки\" OR path:\"04 Стежки\"", "showTags": false, "showAttachments": false, "hideUnresolved": true, "showOrphans": true, "collapse-color-groups": false, "colorGroups": [{"query": "path:\"02 Узоры\"", "color": {"a": 1, "rgb": 9387314}}, {"query": "path:\"03 Разметки\"", "color": {"a": 1, "rgb": 4022150}}, {"query": "path:\"04 Стежки\"", "color": {"a": 1, "rgb": 2761760}}], "collapse-display": false, "showArrow": true, "textFadeMultiplier": -3, "nodeSizeMultiplier": 1.2, "lineSizeMultiplier": 0.7, "collapse-forces": false, "centerStrength": 0.15, "repelStrength": 15, "linkStrength": 0.4, "linkDistance": 420, "scale": 0.9409928231902496, "close": false}}, {"type": "graph", "ctime": 1789774569529, "title": "Всё как было", "options": {"collapse-filter": false, "search": "", "showTags": false, "showAttachments": false, "hideUnresolved": true, "showOrphans": true, "collapse-color-groups": false, "colorGroups": [{"query": "path:\"01 Механики\"", "color": {"a": 1, "rgb": 16007990}}, {"query": "path:\"02 Узоры\"", "color": {"a": 1, "rgb": 9387314}}, {"query": "path:\"03 Разметки\"", "color": {"a": 1, "rgb": 4022150}}, {"query": "path:\"04 Стежки\"", "color": {"a": 1, "rgb": 2761760}}, {"query": "path:\"05 Нити\"", "color": {"a": 1, "rgb": 12887412}}, {"query": "path:\"06 Шары\"", "color": {"a": 1, "rgb": 7035466}}], "collapse-display": false, "showArrow": true, "textFadeMultiplier": -3, "nodeSizeMultiplier": 1.2, "lineSizeMultiplier": 0.7, "collapse-forces": false, "centerStrength": 0.15, "repelStrength": 15, "linkStrength": 0.4, "linkDistance": 420, "scale": 0.9409928231902496, "close": false}}]}]}, null, 2) + '\n');

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
  for (const d of [...OWNED_DIRS, ...RETIRED_DIRS]) await walk(join(VAULT, d), d + '/');
  return out;
}

const current = await onDisk();
const differing = [...files.keys()].filter((f) => current.get(f) !== files.get(f));
// Inside its own folders a file it did not make is a note the catalogue lost.
const extra = [...current.keys()].filter((f) => owned(f) && !files.has(f));
const strays = [...files.keys()].filter((f) => !owned(f));
if (strays.length) throw new Error(`builder wrote outside what it owns: ${strays.join(', ')}`);

if (check) {
  if (differing.length || extra.length) {
    console.error('Хранилище разошлось с кодом игры.');
    for (const f of differing) console.error('  изменилось:', f);
    for (const f of extra) console.error('  лишнее:', f);
    console.error('Соберите заново: npx tsx scripts/build-craft-vault.mts --write');
    process.exit(1);
  }
  console.log(JSON.stringify({ vault: VAULT, notes: files.size, механик: MECHANICS.length, state: 'совпадает' }, null, 1));
} else if (write) {
  for (const f of extra) await rm(join(VAULT, f));
  for (const d of RETIRED_DIRS) await rm(join(VAULT, d), { recursive: true, force: true });
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
  console.log(JSON.stringify({ vault: VAULT, notes: files.size, механик: MECHANICS.length, written: differing.length, removed: extra.length }, null, 1));
} else {
  console.log('Укажите --write или --check');
  process.exit(2);
}
