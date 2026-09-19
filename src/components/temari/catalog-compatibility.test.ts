import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DIVISION_CATALOG, MOTIF_CATALOG, type MotifEntry } from "./library.ts";
import { DIVISION_IDS, runtimeDivisionFor } from "./division-config.ts";
import {
  declaredDivisions, confirmedDivisions, motifsForDivision, craftCompatibility,
  catalogImplementation, validateCatalogCompatibility,
} from "./catalog-compatibility.ts";
import { KIKU_8_POINT } from "./kagari.ts";

const motif = (id: string) => MOTIF_CATALOG.find((m) => m.id === id)!;
const note = (path: string) => readFileSync(new URL(`../../../Temari-Obsidian/${path}`, import.meta.url), "utf8");
const motifNote = (m: MotifEntry) => note(`02 Узоры/${m.names.ru}.md`);
const section = (text: string, heading: string) => text.split(`## ${heading}\n`)[1]?.split("\n## ")[0] ?? "";

describe("exact catalogue compatibility", () => {
  it("catalogue has one entry for each exact division ID", () => {
    assert.deepEqual(DIVISION_CATALOG.map((d) => d.id), [...DIVISION_IDS]);
    assert.doesNotThrow(() => validateCatalogCompatibility());
  });

  it("S4, S10 and S16 never fall through to runtime Simple 8", () => {
    assert.equal(runtimeDivisionFor("s8"), "simple");
    assert.equal(runtimeDivisionFor("c8"), "c8");
    assert.equal(runtimeDivisionFor("c10"), "c10");
    for (const id of ["s4", "s10", "s16", "c6", "double-c8", "tamentai"] as const) {
      assert.equal(runtimeDivisionFor(id), undefined);
    }
  });

  it("Kiku S8 keeps the exact, unchanged executable recipe", () => {
    const kiku = motif("kiku-8-point");
    assert.equal(kiku.recipe, KIKU_8_POINT);
    assert.deepEqual(confirmedDivisions(kiku), ["s8"]);
    assert.equal(kiku.recipe!.divisionId, "s8");
    assert.equal(craftCompatibility(kiku, "s8"), "documented");
    assert.equal(catalogImplementation(kiku, "s8").implemented, true);
    for (const id of ["s4", "s16", "c8", "c10"] as const) {
      assert.equal(catalogImplementation(kiku, id).implemented, false);
      assert.equal(craftCompatibility(kiku, id), "unknown");
    }
  });

  it("kiku-16 declares unverified S16, never S8 or an executable family fallback", () => {
    const kiku16 = motif("kiku-16");
    assert.deepEqual(declaredDivisions(kiku16), ["s16"]);
    assert.deepEqual(confirmedDivisions(kiku16), []);
    assert.equal(craftCompatibility(kiku16, "s16"), "unverified");
    assert.equal(craftCompatibility(kiku16, "s8"), "unknown");
    assert.equal(catalogImplementation(kiku16, "s8").implemented, false);
    assert.equal(catalogImplementation(kiku16, "s16").implemented, false);
    assert.ok(!motifsForDivision("s8").includes(kiku16));
    assert.ok(motifsForDivision("s16").includes(kiku16));
  });

  it("family-only and old any declarations stay unknown, not universally compatible", () => {
    for (const id of ["kiku-sakasa", "kiku-shitagake", "kiku-sujidate", "obi"]) {
      const m = motif(id);
      assert.deepEqual(declaredDivisions(m), []);
      for (const division of DIVISION_IDS) {
        assert.equal(craftCompatibility(m, division), "unknown");
        assert.equal(catalogImplementation(m, division).implemented, false);
      }
    }
  });

  it("retains multiple explicit candidates without confirming them", () => {
    assert.deepEqual(declaredDivisions(motif("shikaku")), ["s4", "s8"]);
    assert.equal(craftCompatibility(motif("shikaku"), "s4"), "unverified");
    assert.equal(craftCompatibility(motif("shikaku"), "s8"), "unverified");
    assert.deepEqual(confirmedDivisions(motif("shikaku")), []);
  });

  it("all reverse lists are exactly the projection of outgoing claims", () => {
    for (const division of DIVISION_IDS) {
      for (const m of MOTIF_CATALOG) {
        assert.equal(motifsForDivision(division).includes(m), declaredDivisions(m).includes(division));
      }
    }
  });

  it("status now or an inherited family recipe is not implementation", () => {
    const m = { ...motif("kiku-16"), status: "now" as const, recipe: KIKU_8_POINT };
    assert.equal(catalogImplementation(m, "s8").implemented, false);
    assert.throws(() => validateCatalogCompatibility([m]), /recipe must match/);
  });

  it("rejects documented claims without actual source URLs", () => {
    const m: MotifEntry = {
      ...motif("kiku-8-point"),
      compatibility: { state: "documented", divisionIds: ["s8"], sourceUrls: [""], note: "invalid" },
    };
    assert.throws(() => validateCatalogCompatibility([m]), /source URLs/);
  });

  it("rejects duplicate IDs and division claims instead of emitting ambiguous links", () => {
    assert.throws(() => validateCatalogCompatibility([motif("kiku-16"), motif("kiku-16")]), /duplicate motif/);
    const m: MotifEntry = {
      ...motif("kiku-16"),
      compatibility: { state: "unverified", divisionIds: ["s16", "s16"], note: "invalid" },
    };
    assert.throws(() => validateCatalogCompatibility([m]), /duplicate division/);
  });

  it("rejects a recipe whose exact ID disagrees with the legacy runtime adapter", () => {
    const m: MotifEntry = {
      ...motif("kiku-8-point"),
      compatibility: {
        state: "documented", divisionIds: ["s16"],
        sourceUrls: ["https://www.temarikai.com/PatternsPages/Simple/GT14.html"], note: "invalid fixture",
      },
      recipe: { ...KIKU_8_POINT, divisionId: "s16" },
    };
    assert.throws(() => validateCatalogCompatibility([m]), /адаптера/);
  });
});

describe("generated Obsidian compatibility", () => {
  it("emits confirmed division edges only, never candidate dependencies", () => {
    for (const m of MOTIF_CATALOG) {
      const text = motifNote(m);
      const yaml = text.split("---")[1]!;
      const edges = yaml.match(/разметка:\n((?:  - .+\n)+)/)?.[1] ?? "";
      const expected = confirmedDivisions(m).map((id) => DIVISION_CATALOG.find((d) => d.id === id)!.names.ru);
      assert.deepEqual([...edges.matchAll(/\[\[(.+?)\]\]/g)].map((match) => match[1]), expected, m.id);
      if (m.compatibility.state !== "documented") {
        for (const d of DIVISION_CATALOG) assert.ok(!text.includes(`[[${d.names.ru}]]`), m.id);
      }
    }
  });

  it("kiku-16 visibly says S16 candidate, unknown implementation and no S8 edge", () => {
    const text = motifNote(motif("kiku-16"));
    assert.match(text, /разметка_кандидаты:\n  - "s16"/);
    assert.match(text, /простое 16/);
    assert.match(text, /заявлено в каталоге, не проверено/);
    assert.match(text, /Рецепт этой строки исполняется: \*\*нет\*\*/);
    assert.doesNotMatch(text, /\[\[простое 8\]\]/);
    assert.doesNotMatch(text, /Семья поддержана компилятором: \*\*да/);
  });

  it("every generated reverse section agrees with outgoing evidence, including empty lists", () => {
    for (const d of DIVISION_CATALOG) {
      const text = note(`03 Разметки/${d.names.ru}.md`);
      for (const [heading, state] of [
        ["Варианты с подтверждённой совместимостью", "documented"],
        ["Заявлено в каталоге, нужно проверить", "unverified"],
      ] as const) {
        const names = [...section(text, heading).matchAll(/^- ([^:\n]+): /gm)].map((m) => m[1]);
        const expected = motifsForDivision(d.id).filter((m) => m.compatibility.state === state).map((m) => m.names.ru);
        assert.deepEqual(names, expected, `${d.id}: ${state}`);
      }
    }
  });

  it("has one matrix row per variant and separates source, runtime and acceptance", () => {
    const matrix = note("00 Совместимость узоров.md");
    for (const m of MOTIF_CATALOG) {
      const row = matrix.split("\n").filter((line) => line.startsWith(`| ${m.names.ru} |`));
      assert.equal(row.length, 1, m.id);
      assert.equal(row[0].includes("рецепт исполняется"), !!m.recipe, m.id);
    }
    assert.match(matrix, /не означает «невозможно»/);
    assert.match(matrix, /человеческая оценка/);
    assert.match(note("00 Карта ремесла.md"), /\[\[00 Совместимость узоров\]\]/);
  });
});
