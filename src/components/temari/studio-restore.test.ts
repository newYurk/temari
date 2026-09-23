import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { padFills } from "./division";
import { kikuThreads } from "./jiwari";

/** A fresh document must hydrate before any workshop interaction is allowed. */
function visit(raw: string | null) {
  const code = `
    const memory = new Map(${JSON.stringify(raw === null ? [] : [["temari-v1", raw]])});
    let writes = 0;
    globalThis.window = {};
    globalThis.localStorage = {
      getItem: key => memory.get(key) ?? null,
      setItem: (key, value) => { writes++; memory.set(key, value); },
    };
    const { useTemari } = await import(${JSON.stringify(new URL("./store.ts", import.meta.url).href)});
    const settings = () => {
      const s = useTemari.getState();
      return Object.fromEntries(["division", "paletteId", "selectedColor", "fills", "kagariColors", "solved"]
        .map(key => [key, s[key]]));
    };
    const opened = settings(), writesOnOpen = writes;
    useTemari.getState().setPalette("sumi");
    const saved = JSON.parse(memory.get("temari-v1"));
    useTemari.getState().enterKata(0);
    useTemari.getState().enterStudio();
    console.log(JSON.stringify({ opened, writesOnOpen, saved, returned: settings() }));
  `;
  return JSON.parse(execFileSync(process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", code], { encoding: "utf8" }));
}

describe("workshop preference restoration", () => {
  for (const [v, division] of [[1, "c8"], [2, "c10"]] as const) {
    it(`preserves saved v${v} preferences through opening, the first action and returning from a kata`, () => {
      const old = { v, division, paletteId: "matsu", selectedColor: 3,
        fills: [2, -1, 1, 0], kagariColors: [4, 1], solved: ["kept-puzzle"] };
      const { opened, writesOnOpen, saved, returned } = visit(JSON.stringify(old));
      const expected = { ...old, fills: padFills(old.fills, division) };
      const { v: _version, ...settings } = expected;
      assert.deepEqual(opened, settings);
      assert.equal(writesOnOpen, 0, "reading preferences must not rewrite the stored record");
      for (const key of ["division", "selectedColor", "fills", "kagariColors", "solved"] as const) {
        assert.deepEqual(saved[key], expected[key], key);
      }
      assert.equal(saved.paletteId, "sumi");
      assert.equal(saved.v, 2);
      assert.deepEqual(returned, { ...settings, paletteId: "sumi" });
    });
  }

  it("retains the new Simple 8 defaults for a first visit or unreadable save", () => {
    for (const raw of [null, "{broken", JSON.stringify({ v: 99, division: "c10" })]) {
      const { opened, writesOnOpen } = visit(raw);
      assert.equal(opened.division, "simple");
      assert.equal(opened.paletteId, "beni");
      assert.equal(opened.selectedColor, kikuThreads(0)[0]);
      assert.deepEqual(opened.kagariColors, kikuThreads(0));
      assert.ok(opened.fills.every((color: number) => color === -1));
      assert.equal(writesOnOpen, 0);
    }
  });

  it("normalizes incomplete legacy preferences without discarding their valid values", () => {
    const { opened } = visit(JSON.stringify({ v: 1, division: "c8", paletteId: "unknown",
      selectedColor: 99, fills: [2, null, "1", 20, -1] }));
    assert.equal(opened.division, "c8");
    assert.equal(opened.paletteId, "beni");
    assert.equal(opened.selectedColor, 4);
    assert.deepEqual(opened.fills.slice(0, 5), [2, -1, -1, -1, -1]);
    assert.deepEqual(opened.kagariColors, kikuThreads(0));
  });
});
