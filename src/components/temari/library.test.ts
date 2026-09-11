import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DIVISION_CATALOG,
  MOTIF_CATALOG,
  STITCH_CATALOG,
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
  });

  it("kiku chips stay hidden until a second variant is now", () => {
    assert.equal(variantChips("kiku").length, 0);
    assert.equal(nowMotifs().length, 1);
  });

  it("Suess herringbone family is named, only uwagake is now", () => {
    const chidori = STITCH_CATALOG.filter((s) => s.family === "chidori");
    const ids = chidori.map((s) => s.id);
    assert.deepEqual(ids, ["uwagake-chidori", "chidori", "sakasa", "shitagake", "sujidate"]);
    assert.equal(chidori.filter((s) => s.status === "now").length, 1);
  });

  it("standard three divisions exist; extra mentai is later and data-only", () => {
    assert.ok(DIVISION_CATALOG.some((d) => d.id === "s8" && d.status === "now"));
    assert.ok(DIVISION_CATALOG.some((d) => d.id === "c8"));
    assert.ok(DIVISION_CATALOG.some((d) => d.id === "c10"));
    const extra = DIVISION_CATALOG.find((d) => d.id === "tamentai");
    assert.equal(extra?.status, "later");
    assert.equal(extra?.appears, "data-only");
  });

  it("asanoha and bara never dock", () => {
    for (const id of ["asanoha", "bara", "kiku-16", "kiku-shitagake"]) {
      const m = MOTIF_CATALOG.find((x) => x.id === id);
      assert.equal(m?.status, "later");
      assert.notEqual(m?.appears, "dock");
    }
  });
});
