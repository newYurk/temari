import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MOTIF_CATALOG, STITCH_CATALOG, YARN_CATALOG, nowMotifs } from "./library.ts";
import { KIKU_8_POINT } from "./kagari.ts";

describe("workshop library", () => {
  it("only kiku-8-point is now, and it carries the executable recipe", () => {
    const now = nowMotifs();
    assert.equal(now.length, 1);
    assert.equal(now[0]?.id, "kiku-8-point");
    assert.equal(now[0]?.recipe?.id, KIKU_8_POINT.id);
    assert.equal(now[0]?.stitch, "uwagake-chidori");
  });

  it("asanoha and bara stay later", () => {
    const later = MOTIF_CATALOG.filter((m) => m.id === "asanoha" || m.id === "bara");
    assert.ok(later.every((m) => m.status === "later"));
  });

  it("uwagake is the only now stitch; pearl 5 is the kagari yarn", () => {
    assert.equal(STITCH_CATALOG.filter((s) => s.status === "now").map((s) => s.id).join(), "uwagake-chidori");
    assert.ok(YARN_CATALOG.some((y) => y.id === "pearl-5" && y.status === "now"));
  });
});
