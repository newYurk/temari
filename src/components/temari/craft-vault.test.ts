import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { basename } from "node:path";

const root = new URL("../../../Temari-Obsidian/", import.meta.url);
const files = new Map<string, string>();
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.startsWith("00 ") && entry.name.endsWith(".md")) {
    files.set(entry.name, readFileSync(new URL(entry.name, root), "utf8"));
  } else if (entry.isDirectory() && /^0[1-6] /.test(entry.name)) {
    for (const name of readdirSync(new URL(`${entry.name}/`, root))) {
      if (name.endsWith(".md")) {
        files.set(`${entry.name}/${name}`, readFileSync(new URL(`${entry.name}/${name}`, root), "utf8"));
      }
    }
  }
}
const note = (path: string) => {
  const text = files.get(path);
  assert.ok(text, path);
  return text;
};

describe("Obsidian craft presentation", () => {
  it("puts a labelled, top-down craft diagram on the first screen, not release statistics", () => {
    const main = note("00 Карта ремесла.md");
    assert.ok(main.indexOf("```mermaid") < main.indexOf("## Что дают другие разметки"));
    assert.match(main, /flowchart TB/);
    assert.match(main, /D -->\|задаёт место\| P/);
    assert.match(main, /M -->\|стежок\| S/);
    assert.match(main, /M -->\|нить\| Y/);
    assert.doesNotMatch(main, /^# /m, "Obsidian already shows the file's inline title");
    assert.doesNotMatch(main, /## Стадия|строк в каталоге|доходит до нитки на шаре/);
    assert.match(main, /\[\[00 Состояние реализации\]\]/);
    assert.match(note("00 Состояние реализации.md"), /## Стадия/);
  });

  it("has globally unique node names, including pattern and stitch homonyms", () => {
    const names = [...files.keys()].map((path) => basename(path, ".md"));
    assert.equal(new Set(names).size, names.length);
    for (const kind of ["Узор", "Стежок"]) {
      const folder = kind === "Узор" ? "02 Узоры" : "04 Стежки";
      for (const name of ["сикаку", "судзидагику"]) {
        const text = note(`${folder}/${kind} · ${name}.md`);
        assert.match(text, new RegExp(`тип: "${kind.toLowerCase()}"`));
        assert.match(text, /aliases:\n  - "/);
        assert.ok(!files.has(`${folder}/${name}.md`));
      }
    }
  });

  it("resolves every generated wiki-link to exactly one generated note", () => {
    for (const [path, text] of files) {
      for (const match of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
        const target = match[1].split("|")[0].split("#")[0];
        const candidates = [...files.keys()].filter((name) =>
          name === `${target}.md` || basename(name, ".md") === target);
        assert.equal(candidates.length, 1, `${path}: ${target}`);
      }
    }
  });

  it("uses real note names for every clickable Mermaid node", () => {
    const names = new Set([...files.keys()].map((path) => basename(path, ".md")));
    for (const [path, text] of files) {
      for (const block of text.matchAll(/```mermaid\n([\s\S]*?)```/g)) {
        const nodes = new Map([...block[1].matchAll(/^\s+(\w+)\["([^"]+)"\]/gm)]
          .map((m) => [m[1], m[2]]));
        for (const declaration of block[1].matchAll(/class ([\w,]+) internal-link;/g)) {
          for (const id of declaration[1].split(",")) {
            assert.ok(names.has(nodes.get(id)!), `${path}: ${id} → ${nodes.get(id)}`);
          }
        }
      }
    }
  });

  it("puts requirements before long implementation metadata in every pattern note", () => {
    for (const [path, text] of files) {
      if (!path.startsWith("02 Узоры/")) continue;
      assert.ok(text.indexOf("```mermaid") < text.indexOf("## Достижимость в игре"), path);
      assert.match(text, /стежок рецепта|стежок по каталогу/);
      assert.match(text, /flowchart TB/);
    }
  });

  it("shows S16 and unknown cases without turning questions into certain dependencies", () => {
    const s16 = note("03 Разметки/простое 16.md");
    assert.match(s16, /D -\.->\|заявлено, проверить\| M0/);
    assert.match(s16, /M0\["кику 16"\]/);
    assert.doesNotMatch(s16, /D -->/);
    assert.match(note("03 Разметки/C6.md"), /неизвестно, не запрещено/);
    const shikaku = note("02 Узоры/Узор · сикаку.md");
    assert.match(shikaku, /\[\[Стежок · сикаку\]\]/);
    assert.match(shikaku, /M -\.->\|разметка, проверить\| D0/);
    assert.match(shikaku, /M -\.->\|разметка, проверить\| D1/);
  });

  it("does not claim that the overview solves composition or rewrites graph settings", () => {
    const main = note("00 Карта ремесла.md");
    assert.match(main, /пока не вычисляет такие сочетания/);
    assert.match(main, /не перезаписываются генератором/);
  });

  it("keeps the generator's user-settings seeds out of the tracked presentation change", () => {
    const script = readFileSync(new URL("../../../scripts/build-craft-vault.mts", import.meta.url), "utf8");
    assert.match(script, /await readFile\(join\(VAULT, f\)\); continue;/);
    assert.match(script, /const OWNED_DIRS = \['01 Механики', '02 Узоры', '03 Разметки', '04 Стежки', '05 Нити', '06 Шары'\]/);
  });
});
