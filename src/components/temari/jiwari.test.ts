import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isGreatCircle,
  jiwariNormals,
  jiwariStitches,
  simplePins,
  simpleStitches,
  SIMPLE_THREADS,
} from "./jiwari.ts";

describe("simple jiwari", () => {
  it("is 4 meridians plus equator", () => {
    assert.equal(SIMPLE_THREADS.length, 5);
    assert.equal(jiwariNormals("simple").length, 5);
  });

  it("pins: none, then poles, then 8 on the equator", () => {
    assert.equal(simplePins("strip").length, 0);
    assert.equal(simplePins("poles").length, 2);
    assert.equal(simplePins("equator").length, 10);
    assert.equal(simplePins("done").length, 10);
  });

  it("threads appear one great circle at a time", () => {
    assert.equal(simpleStitches(0, 1).length, 0);
    assert.equal(simpleStitches(1, 1).length, 1);
    assert.equal(simpleStitches(5, 1).length, 5);
  });

  it("every marking thread is a great circle of length C", () => {
    const loops = [...jiwariStitches("simple"), ...simpleStitches(5, 1)];
    for (const stitch of loops) {
      if (stitch.kind !== "loop") {
        assert.fail("marking thread must be a closed loop");
        continue;
      }
      assert.equal(isGreatCircle(stitch.points), true);
    }
  });
});
