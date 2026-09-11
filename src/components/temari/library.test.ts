import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DIVISION_CATALOG,
  MOTIF_CATALOG,
  STITCH_CATALOG,
  catalogLabel,
  dockMotifs,
  nowMotifs,
  variantChips,
} from "./library.ts";
import { KIKU_8_POINT } from "./kagari.ts";

describe("workshop library", () => {
  it("dock shows one kiku, no grey wall", () => {
    const dock = dockMotifs();
    assert.equal(dock.length, 1);
    assert.equal(dock[0]?.id, "kiku-8-point");
    assert.equal(dock[0]?.recipe?.id, KIKU_8_POINT.id);
    assert.equal(catalogLabel(dock[0].names, "ui"), "кику 8");
  });

  it("stores ja + reading + en + ru, and picks by surface", () => {
    const kiku = MOTIF_CATALOG[0];
    assert.equal(kiku?.names.ja, "菊");
    assert.equal(kiku?.names.reading, "kiku");
    assert.equal(catalogLabel(kiku.names, "book"), "菊（kiku）");
    assert.equal(catalogLabel(kiku.names, "status"), "kiku · 菊");
    const stitch = STITCH_CATALOG[0];
    assert.equal(stitch?.names.ja, "上掛け千鳥かがり");
    assert.match(stitch.names.reading, /uwagake/);
  });

  it("kiku chips stay hidden until a second variant is now", () => {
    assert.equal(variantChips("kiku").length, 0);
    assert.equal(nowMotifs().length, 1);
  });

  it("Suess herringbone family is named, only uwagake is now", () => {
    const chidori = STITCH_CATALOG.filter((s) => s.family === "chidori");
    assert.deepEqual(
      chidori.map((s) => s.id),
      ["uwagake-chidori", "chidori", "sakasa", "shitagake", "sujidate"],
    );
    assert.equal(chidori.filter((s) => s.status === "now").length, 1);
  });

  it("standard three divisions exist; extra mentai is later and data-only", () => {
    assert.ok(DIVISION_CATALOG.some((d) => d.id === "s8" && d.status === "now"));
    assert.equal(DIVISION_CATALOG.find((d) => d.id === "s8")?.names.ja, "単純8等分");
    const extra = DIVISION_CATALOG.find((d) => d.id === "tamentai");
    assert.equal(extra?.status, "later");
    assert.equal(extra?.appears, "data-only");
    assert.equal(extra?.names.ja, "多面体");
  });

  it("asanoha and bara never dock", () => {
    for (const id of ["asanoha", "bara", "kiku-16", "kiku-shitagake"]) {
      const m = MOTIF_CATALOG.find((x) => x.id === id);
      assert.equal(m?.status, "later");
      assert.notEqual(m?.appears, "dock");
    }
  });
});
