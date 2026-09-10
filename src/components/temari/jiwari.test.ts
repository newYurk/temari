import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  C8_EXTRA,
  c8Pins,
  c8Stitches,
  c10NorthRing,
  c10Pins,
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

describe("c8 jiwari", () => {
  it("is Simple plus four extra great circles", () => {
    assert.equal(C8_EXTRA.length, 4);
    assert.equal(jiwariNormals("c8").length, 9);
    assert.equal(c8Stitches(4, 1).length, 9);
    assert.equal(c8Stitches(1, 1).length, 6);
  });

  it("extra circles miss the poles — they are the squares", () => {
    const np = [0, 1, 0];
    for (const n of C8_EXTRA) {
      const dot = n[0] * np[0] + n[1] * np[1] + n[2] * np[2];
      assert.ok(Math.abs(dot) > 0.2, `extra through north: ${n}`);
    }
  });

  it("has six 8-point centers and eight 6-point", () => {
    assert.equal(c8Pins().length, 18);
  });

  it("every C8 thread is a great circle", () => {
    for (const stitch of c8Stitches(4, 1)) {
      if (stitch.kind !== "loop") {
        assert.fail("marking thread must be a closed loop");
        continue;
      }
      assert.equal(isGreatCircle(stitch.points), true);
    }
  });
});

describe("c10 jiwari", () => {
  it("has twelve 10-point centers and a 5-ring at the start pole", () => {
    assert.equal(c10NorthRing().length, 5);
    assert.equal(c10Pins("done", 0).length, 12);
    assert.equal(c10Pins("vruler", 0).length, 1);
    assert.equal(c10Pins("vruler", 5).length, 6);
  });

  it("every C10 thread is a great circle", () => {
    const all = jiwariStitches("c10");
    assert.ok(all.length >= 10);
    for (const stitch of all) {
      if (stitch.kind !== "loop") {
        assert.fail("marking thread must be a closed loop");
        continue;
      }
      assert.equal(isGreatCircle(stitch.points), true);
    }
  });
});
