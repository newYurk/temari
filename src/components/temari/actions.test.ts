import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { CRAFT_ACTIONS, dispatchCommand, getCraftState } from "./actions";
import { c8Pins, c10Pins } from "./jiwari";
import { around, kikuWorkingPins, motifStitchPlan, motifSupport, type MotifId } from "./patterns";
import { useTemari } from "./store";

const initialState = useTemari.getState();

function action(id: string) {
  const result = CRAFT_ACTIONS.find((item) => item.id === id);
  assert.ok(result, id);
  return result;
}

function finishPlan() {
  // Advance the real sequence; the cap makes a regression fail without hanging.
  for (let i = 0; useTemari.getState().kagariPlaying && i < 1000; i++) {
    useTemari.getState().advanceKagari();
  }
  assert.equal(useTemari.getState().kagariPlaying, false);
}

describe("recipe compatibility in studio actions and state", () => {
  beforeEach(() => {
    useTemari.setState({
      ...initialState,
      mode: "studio",
      division: "simple",
      motif: "none",
      layerDone: true,
      craft: "pin",
      jiwariOn: true,
      jiwariPhase: "done",
    }, true);
  });
  afterEach(() => useTemari.setState(initialState, true));

  it("disables unsupported motifs with a recipe reason even when the markings are complete", () => {
    for (const division of ["simple", "c8", "c10"] as const) {
      useTemari.setState({ division });
      for (const motif of ["kiku", "hoshi", "hishi", "obi"] as const) {
        const support = motifSupport(division, motif);
        const choice = action(`motif-${motif}`);
        assert.equal(choice.canExecute(getCraftState()), support.supported);
        assert.equal(choice.getDisabledReason(getCraftState()), support.supported ? null : support.reason);
        if (!support.supported) {
          dispatchCommand(`motif-${motif}`);
          assert.equal(useTemari.getState().motif, "none");
          assert.deepEqual(useTemari.getState().kagariPlan, []);
        }
      }
    }
  });

  it("rejects direct selection without replacing an existing supported plan", () => {
    const existing = motifStitchPlan("simple", "kiku", "out", "even", 0, 0, 1, 0);
    useTemari.setState({ motif: "kiku", kagariPlan: existing, kagariLaid: 2 });
    for (const motif of ["hoshi", "hishi", "obi"] as const) {
      useTemari.getState().setMotif(motif);
      assert.equal(useTemari.getState().motif, "kiku");
      assert.equal(useTemari.getState().kagariPlan, existing);
      assert.equal(useTemari.getState().kagariLaid, 2);
      assert.match(useTemari.getState().pinNote ?? "", /ещё не реализован/);
    }
    for (const division of ["c8", "c10"] as const) {
      useTemari.setState({ division, motif: "none", kagariPlan: [], kagariLaid: 0 });
      useTemari.getState().setMotif("kiku");
      assert.equal(useTemari.getState().motif, "none");
      assert.deepEqual(useTemari.getState().kagariPlan, []);
      assert.match(useTemari.getState().pinNote ?? "", /ещё не реализован/);
    }
  });

  it("blocks compiler entry points even for injected legacy unsupported state", () => {
    const legacyPlan = motifStitchPlan("simple", "kiku", "out", "even", 0, 0, 1, 0);
    for (const division of ["simple", "c8", "c10"] as const) {
      for (const motif of ["kiku", "hoshi", "hishi", "obi"] as MotifId[]) {
        const support = motifSupport(division, motif);
        if (support.supported) continue;
        useTemari.setState({ division, motif, pins: kikuWorkingPins("simple", 0) });
        for (const id of ["stitch", "fill"]) {
          assert.equal(action(id).canExecute(getCraftState()), false);
          assert.equal(action(id).getDisabledReason(getCraftState()), support.reason);
        }
        // Recolor used to call the compiler independently of start/fill.
        useTemari.setState({ kagariPlan: legacyPlan, kagariLaid: 1 });
        assert.doesNotThrow(() => useTemari.getState().setColor(2));
        for (const entry of ["startKagari", "fillKiku"] as const) {
          useTemari.setState({ kagariPlan: legacyPlan, kagariLaid: 1, kagariPlaying: true });
          assert.doesNotThrow(() => useTemari.getState()[entry]());
          assert.deepEqual(useTemari.getState().kagariPlan, []);
          assert.equal(useTemari.getState().kagariPlaying, false);
          assert.equal(useTemari.getState().pinNote, support.reason);
        }
      }
    }
  });

  it("clears Simple 8 recipe state and undo history when changing the division", () => {
    const oldPins = kikuWorkingPins("simple", 0);
    const oldPlan = motifStitchPlan("simple", "kiku", "out", "even", 0, 0, 1, 0);
    for (const division of ["c8", "c10"] as const) {
      useTemari.setState({
        division: "simple", motif: "kiku", pins: oldPins,
        pinHistory: [{ pins: oldPins, pinArcs: [], activePin: 0 }],
        kagariPlan: oldPlan, kagariLaid: 2, kagariPlaying: true,
        kagariKept: oldPlan, facingPole: 1,
      });
      useTemari.getState().setDivision(division);
      const state = useTemari.getState();
      assert.equal(state.motif, "none");
      assert.equal(state.facingPole, 0);
      assert.deepEqual(state.kagariPlan, []);
      assert.deepEqual(state.kagariKept, []);
      assert.equal(state.kagariLaid, 0);
      assert.equal(state.kagariPlaying, false);
      const expectedPins = division === "c8" ? c8Pins() : c10Pins("vruler", 0);
      assert.deepEqual(state.pins, expectedPins);
      assert.deepEqual(state.pinHistory, []);
      useTemari.getState().setCraft("pin");
      useTemari.getState().undo();
      assert.deepEqual(useTemari.getState().pins, expectedPins, "undo cannot restore another division's marks");
    }
  });

  it("keeps Simple 8 A1 then B1 then the next pair of rounds executable", () => {
    dispatchCommand("motif-kiku");
    assert.equal(useTemari.getState().motif, "kiku");
    assert.equal(getCraftState().kikuMarksReady, false);
    useTemari.setState({ pins: kikuWorkingPins("simple", 0) });
    assert.equal(action("stitch").canExecute(getCraftState()), true);
    dispatchCommand("motif-kiku");
    assert.equal(useTemari.getState().kagariPlan.length, 8);
    assert.equal(useTemari.getState().kagariSet, 0);
    finishPlan();
    assert.equal(action("fill").canExecute(getCraftState()), false);
    assert.match(action("fill").getDisabledReason(getCraftState()) ?? "", /вторые 4/);
    dispatchCommand("motif-kiku");
    assert.equal(useTemari.getState().kagariSet, 1);
    assert.equal(useTemari.getState().kagariKept.length, 8);
    finishPlan();
    assert.equal(action("fill").canExecute(getCraftState()), true);
    dispatchCommand("fill");
    assert.equal(useTemari.getState().kikuLayers, 2);
    assert.equal(useTemari.getState().kagariPlan.length, 24);
    assert.equal(useTemari.getState().kagariPlaying, true);
  });

  it("keeps free contour filling available on C8 and C10", () => {
    for (const division of ["c8", "c10"] as const) {
      const pins = Array.from({ length: 4 }, (_, i) => ({
        id: `free-${i}`, p: around([0, 1, 0], 0.65, i * Math.PI / 2),
      }));
      useTemari.setState({ division, motif: "none", pins, pinArcs: [], jiwariOn: false });
      assert.equal(action("stitch").canExecute(getCraftState()), true);
      assert.equal(action("fill").canExecute(getCraftState()), true);
      dispatchCommand("fill");
      assert.ok(useTemari.getState().pinArcs.length > 0);
      assert.deepEqual(useTemari.getState().kagariPlan, []);
    }
  });

  it("starts the Simple 8 example at its north marks with no previous division's work", () => {
    const stalePlan = motifStitchPlan("simple", "kiku", "out", "even", 1, 2, 1, 0);
    const oldPins = c8Pins();
    useTemari.setState({
      division: "c8", motif: "none", facingPole: 4,
      kagariPlan: stalePlan, kagariLaid: stalePlan.length, kagariKept: stalePlan,
      pinHistory: [{ pins: oldPins, pinArcs: [], activePin: 0 }],
      pinNote: "Рецепт ещё не реализован.",
    });
    dispatchCommand("example");
    const state = useTemari.getState();
    assert.equal(state.division, "simple");
    assert.equal(state.motif, "kiku");
    assert.equal(state.facingPole, 0);
    assert.equal(getCraftState().kikuMarksReady, true);
    assert.deepEqual(state.kagariKept, []);
    assert.equal(state.kagariPlan.length, 8);
    assert.ok(state.kagariPlan.every((stitch) => stitch.kind === "arc" && stitch.pole === 0));
    assert.equal(state.kagariLaid, 1);
    assert.equal(state.kagariPlaying, true);
    assert.deepEqual(state.pinHistory, []);
    assert.equal(state.pinNote, null);
  });
});
