import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { compileKiku, stitchesFromOps, kikuWorkingPins, motifStitchPlan, type Stitch } from "./patterns.ts";
import { pileParts } from "./stitches.ts";
import { useTemari } from "./store.ts";

const initial = useTemari.getState();
type Arc = Extract<Stitch, { kind: "arc" }>;
const id = (s: Stitch) => s.kind === "arc" ? s.operation?.operationId : undefined;
const geometry = (s: Stitch) => {
  const { color: _color, operation: _operation, ...shape } = s as Arc;
  return shape;
};
const laid = () => {
  const s = useTemari.getState();
  return [...s.kagariKept, ...s.kagariPlan.slice(0, s.kagariLaid)];
};
function openFirstRow(colors: [number, number]) {
  useTemari.setState({ ...initial, mode: "studio", division: "simple", motif: "kiku",
    layerDone: true, craft: "stitch", facingPole: 0, kagariSet: 1, kikuLayers: 1,
    pins: kikuWorkingPins("simple", 0), kagariColors: colors,
    kagariKept: motifStitchPlan("simple", "kiku", "out", "even", 0, colors[0], 1, 0),
    kagariPlan: motifStitchPlan("simple", "kiku", "out", "even", 0, colors[1], 1, 1),
    kagariLaid: 8, kagariPlaying: false, kagariHistory: [],
  }, true);
}
function finishPlan() {
  for (let i = 0; useTemari.getState().kagariPlaying && i < 1000; i++) useTemari.getState().advanceKagari();
  assert.equal(useTemari.getState().kagariPlaying, false);
}

describe("workshop geometry follows the executed recipe prefix", () => {
  afterEach(() => useTemari.setState(initial, true));

  for (const { colors, batch } of [
    { colors: [1, 3], batch: false }, { colors: [1, 1], batch: false },
    { colors: [1, 3], batch: true },
  ] as { colors: [number, number]; batch: boolean }[]) {
    it(`matches a ten-row compilation including actual pile paths: A/B ${colors}, ${batch ? "to equator" : "one row at a time"}`, () => {
      openFirstRow(colors);
      const first = laid(), savedFirst = structuredClone(first);
      if (batch) {
        useTemari.getState().sewKikuRows("all");
        finishPlan();
      } else for (let row = 2; row <= 10; row++) {
        useTemari.getState().sewKikuRows(1);
        finishPlan();
      }
      const sewn = laid();
      const full = motifStitchPlan("simple", "kiku", "out", "even", 0, 0, 10, "all")
        .map(s => ({ ...s, color: colors[(s as Arc).set!] }));
      assert.equal(sewn.length, 160);
      assert.deepEqual(sewn.map(id), full.map(id), "row/set chronology and operation identities survive");
      assert.deepEqual(sewn.filter((s, i) => !isDeepStrictEqual(geometry(s), geometry(full[i]!))).map(id), [],
        "earlier flanks receive the compiler's later gathers");
      assert.deepEqual(sewn.map(s => s.color), full.map(s => s.color));
      assert.deepEqual(first, savedFirst, "old snapshots must not be mutated");
      for (const old of first as Arc[]) {
        const now = sewn.find(s => id(s) === id(old)) as Arc;
        assert.deepEqual(now.operation, old.operation, "geometry refresh preserves thread and operation traces");
      }
      assert.equal(new Set((sewn as Arc[]).map(s => s.operation!.threadId)).size, 2,
        "same-colour sets remain independent working threads");
      const actual = pileParts(sewn, "pearl5"), expected = pileParts(full, "pearl5");
      assert.equal(actual.length, expected.length);
      for (let i = 0; i < actual.length; i++) {
        assert.equal(id(actual[i]!.at), id(expected[i]!.at));
        assert.equal(actual[i]!.color, expected[i]!.color);
        assert.ok(isDeepStrictEqual(actual[i]!.pts.map(p => p.toArray()), expected[i]!.pts.map(p => p.toArray())),
          `rendered path ${id(actual[i]!.at)} matches the same recipe`);
      }
    });
  }

  it("does not gather before the new work is laid, preserves other poles and restores exact geometry on undo", () => {
    openFirstRow([1, 3]);
    const elsewhere = motifStitchPlan("simple", "kiku", "out", "even", 1, 4, 1, "all");
    useTemari.setState({ kagariKept: [...elsewhere, ...useTemari.getState().kagariKept] });
    const before = useTemari.getState(), beforeLaid = structuredClone(laid());
    useTemari.getState().sewKikuRows(2);
    assert.deepEqual(laid(), beforeLaid, "scheduling stitches does not apply future catches");
    finishPlan();
    assert.deepEqual(useTemari.getState().kagariKept.slice(0, elsewhere.length), elsewhere);
    useTemari.getState().undo();
    const after = useTemari.getState();
    assert.deepEqual(after.kagariKept, before.kagariKept);
    assert.deepEqual(after.kagariPlan, before.kagariPlan);
    assert.equal(after.kagariLaid, before.kagariLaid);
    assert.equal(after.kikuLayers, before.kikuLayers);
  });

  it("finishes the sewn pole after a camera turn and removes only that pole's pins", () => {
    openFirstRow([1, 3]);
    const southPins = kikuWorkingPins("simple", 1);
    useTemari.setState({ pins: [...useTemari.getState().pins, ...southPins] });
    useTemari.getState().sewKikuRows("all");
    useTemari.getState().advanceKagari();
    useTemari.getState().setFacingPole(1);
    finishPlan();
    const full = motifStitchPlan("simple", "kiku", "out", "even", 0, 0, 10, "all");
    assert.deepEqual(laid().filter((s, i) => !isDeepStrictEqual(geometry(s), geometry(full[i]!))).map(id), [],
      "finishing refreshes the north operations, regardless of the camera");
    assert.deepEqual(useTemari.getState().pins, southPins);
    assert.equal(useTemari.getState().facingPole, 1, "finishing does not change the viewing direction");
  });

  it("gathers the appropriate earlier flanks at each catch, never at an unsewn neighbouring tip", () => {
    openFirstRow([1, 3]);
    const arc = (mark: string) => laid().find(s => id(s) === `kiku-8-point/p0/s0/r0/${mark}`) as Arc;
    const old = Object.fromEntries(["inner-2", "outer-3", "inner-4", "outer-5", "inner-6"]
      .map(mark => [mark, arc(mark).via]));
    useTemari.getState().sewKikuRows("all");
    useTemari.getState().advanceKagari(); // A2 outer-1: no upper catch yet.
    for (const mark of Object.keys(old)) assert.deepEqual(arc(mark).via, old[mark], mark);
    useTemari.getState().advanceKagari(); // A2 inner-2: this upper catch has now happened.
    for (const mark of ["inner-2", "outer-3"]) assert.notDeepEqual(arc(mark).via, old[mark], mark);
    for (const mark of ["inner-4", "outer-5", "inner-6"]) assert.deepEqual(arc(mark).via, old[mark], mark);
    const caught = structuredClone(arc("inner-2").via);
    useTemari.getState().advanceKagari(); // A2 outer-3.
    assert.deepEqual(arc("inner-4").via, old["inner-4"]);
    useTemari.getState().advanceKagari(); // A2 inner-4.
    for (const mark of ["inner-4", "outer-5"]) assert.notDeepEqual(arc(mark).via, old[mark], mark);
    assert.deepEqual(arc("inner-2").via, caught, "another tip does not reapply the first gather");
    assert.deepEqual(arc("inner-6").via, old["inner-6"], "the next upper catch remains unexecuted");
  });

  it("batch and single-row execution have identical geometry at every operation, including partial catches", () => {
    const snapshots = (batch: boolean) => {
      openFirstRow([1, 3]);
      const samples: { digest: string; pile?: string }[] = [];
      if (batch) useTemari.getState().sewKikuRows(2);
      for (let completed = 17; completed <= 48; completed++) {
        if (!useTemari.getState().kagariPlaying) useTemari.getState().sewKikuRows(1);
        useTemari.getState().advanceKagari();
        const actual = laid();
        const expected = stitchesFromOps(compileKiku("simple", "out", "even", 0, 0, 10, "all", completed));
        assert.deepEqual(actual.filter((s, i) => !isDeepStrictEqual(geometry(s), geometry(expected[i]!))).map(id), [],
          `only the first ${completed} completed operations may affect geometry`);
        const digest = createHash("sha256").update(JSON.stringify(actual)).digest("hex");
        const pile = [17, 18, 20, 32, 34, 48].includes(completed)
          ? createHash("sha256").update(JSON.stringify(pileParts(actual, "pearl5")
            .map(p => ({ id: id(p.at), color: p.color, points: p.pts.map(v => v.toArray()) })))).digest("hex") : undefined;
        samples.push({ digest, pile });
      }
      return samples;
    };
    assert.deepEqual(snapshots(true), snapshots(false));
  });

  for (const onlySet of [0, 1] as const) {
    it(`updates a standalone set ${onlySet} without inventing the other working thread`, () => {
      openFirstRow([1, 3]);
      useTemari.setState({ kagariKept: [], kagariLaid: 0, kagariPlaying: true, kagariSet: onlySet,
        kikuLayers: 3, kagariPlan: motifStitchPlan("simple", "kiku", "out", "even", 0, 2, 3, onlySet) });
      for (let completed = 1; completed <= 10; completed++) {
        useTemari.getState().advanceKagari();
        const actual = laid();
        const expected = stitchesFromOps(compileKiku("simple", "out", "even", 0, 2, 3, onlySet, completed));
        assert.deepEqual(actual.filter((s, i) => !isDeepStrictEqual(geometry(s), geometry(expected[i]!))).map(id), []);
        assert.ok((actual as Arc[]).every(s => s.set === onlySet && s.color === 2));
      }
    });
  }
});

describe("bounded kiku compilation stops before future catches", () => {
  it("preserves causal geometry regardless of the number of scheduled future rows", () => {
    const prefix = (rows: number, count: number) => compileKiku("simple", "out", "even", 0, 0, rows, "all", count);
    assert.deepEqual(prefix(10, 18), prefix(2, 18));
    assert.deepEqual(prefix(10, 160), compileKiku("simple", "out", "even", 0, 0, 10, "all"));
    assert.notDeepEqual(prefix(10, 18)[1]!.lay.via, prefix(10, 17)[1]!.lay.via);
    assert.deepEqual(prefix(10, 18)[3]!.lay.via, prefix(10, 17)[3]!.lay.via);
    assert.deepEqual(prefix(10, 0), []);
    for (const invalid of [-1, .5, NaN, Infinity]) assert.throws(() => prefix(10, invalid), RangeError);
  });

  for (const onlySet of [0, 1] as const) {
    it(`keeps anchors and park/resume traces for a partial set ${onlySet}`, () => {
      const full = compileKiku("simple", "out", "even", 0, 0, 3, onlySet);
      for (const count of [1, 2, 8, 9, 10, 16, 17, 24]) {
        const prefix = compileKiku("simple", "out", "even", 0, 0, 3, onlySet, count);
        const stitches = stitchesFromOps(prefix); // Also validates all resume references.
        assert.equal(stitches.length, count);
        assert.ok(prefix.every(op => op.set === onlySet));
        assert.deepEqual(prefix.at(-1)!.lay.from, full[count - 1]!.lay.from);
        assert.deepEqual(prefix.at(-1)!.bite, full[count - 1]!.bite);
        assert.deepEqual(prefix.at(-1)!.resume, full[count - 1]!.resume);
        assert.equal(new Set((stitches as Arc[]).map(s => s.operation!.threadId)).size, 1);
      }
    });
  }
});
