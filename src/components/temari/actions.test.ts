import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { CRAFT_ACTIONS, dispatchCommand, getCraftState } from "./actions";
import { c8Pins, c10Pins, kikuThreads } from "./jiwari";
import { around, kikuWorkingPins, motifStitchPlan, motifSupport, stitchPoleIndex, type MotifId } from "./patterns";
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
    assert.match(action("fill").getDisabledReason(getCraftState()) ?? "", /Вторая группа/);
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

  it("places visible-grid-independent temporary pins without drawing or moving them to hidden nodes", () => {
    useTemari.setState({ jiwariOn: false, jiwariPhase: "off", pins: [] });
    const a = [0.17, 0.23, 1] as [number, number, number];
    const b = [-0.31, 0.19, 1] as [number, number, number];
    useTemari.getState().placePin(a);
    useTemari.getState().placePin(b);
    const placed = useTemari.getState().pins;
    assert.equal(placed.length, 2);
    assert.deepEqual(placed[0]!.p, a.map((n) => n / Math.hypot(...a)));
    assert.deepEqual(placed[1]!.p, b.map((n) => n / Math.hypot(...b)));
    assert.deepEqual(useTemari.getState().pinArcs, []);
    assert.equal(useTemari.getState().activePin, null);
    // Any pin is removed by one tap, without selecting it or drawing a line first.
    useTemari.getState().placePin(placed[0]!.p);
    assert.deepEqual(useTemari.getState().pins, [placed[1]]);
    assert.deepEqual(useTemari.getState().pinArcs, []);
    dispatchCommand("undo");
    assert.deepEqual(useTemari.getState().pins, placed);
  });

  it("draws a free sketch only between existing pins in the separate stitch tool, with undo", () => {
    const pins = [
      { id: "first", p: around([0, 1, 0], 0.6, 0) },
      { id: "second", p: around([0, 1, 0], 0.6, Math.PI / 2) },
    ];
    useTemari.setState({ pins: pins.slice(0, 1), jiwariOn: false, jiwariPhase: "off" });
    assert.equal(action("stitch").canExecute(getCraftState()), false);
    assert.match(action("stitch").getDisabledReason(getCraftState()) ?? "", /две булавки/);
    useTemari.setState({ pins });
    dispatchCommand("stitch");
    useTemari.getState().sketchToPin([0, 1, 0]);
    assert.deepEqual(useTemari.getState().pins, pins, "off-pin tap cannot create a mark");
    assert.deepEqual(useTemari.getState().pinArcs, []);
    assert.match(useTemari.getState().pinNote ?? "", /только метки/);
    useTemari.getState().sketchToPin(pins[0]!.p);
    assert.equal(useTemari.getState().activePin, 0);
    const note = useTemari.getState().pinNote;
    useTemari.getState().setCraft("stitch");
    assert.equal(useTemari.getState().activePin, 0, "same tool preserves the selected start");
    assert.equal(useTemari.getState().pinNote, note);
    useTemari.getState().sketchToPin(pins[1]!.p);
    assert.deepEqual(useTemari.getState().pinArcs, [{ a: pins[0]!.p, b: pins[1]!.p, color: 0 }]);
    assert.deepEqual(useTemari.getState().pins, pins);
    assert.deepEqual(useTemari.getState().sewn, [], "a free sketch cannot invent a kiku slot");
    assert.equal(action("undo").canExecute(getCraftState()), true);
    dispatchCommand("undo");
    assert.deepEqual(useTemari.getState().pinArcs, []);
    assert.equal(useTemari.getState().activePin, 0);
  });

  it("removing a temporary pin preserves existing sketch lines", () => {
    const pins = kikuWorkingPins("simple", 0).slice(1, 3);
    const arc = { a: pins[0]!.p, b: pins[1]!.p, color: 1 };
    useTemari.setState({ jiwariOn: false, pins, pinArcs: [arc], craft: "pin" });
    useTemari.getState().placePin(pins[0]!.p);
    assert.deepEqual(useTemari.getState().pins, [pins[1]]);
    assert.deepEqual(useTemari.getState().pinArcs, [arc]);
    dispatchCommand("undo");
    assert.deepEqual(useTemari.getState().pins, pins);
    assert.deepEqual(useTemari.getState().pinArcs, [arc]);
  });

  it("keeps the pin tool selected when the ninth GT14 mark is placed", () => {
    useTemari.getState().setMotif("kiku");
    for (const pin of kikuWorkingPins("simple", 0)) useTemari.getState().placePin(pin.p);
    assert.equal(useTemari.getState().pins.length, 9);
    assert.equal(getCraftState().kikuMarksReady, true);
    assert.equal(useTemari.getState().craft, "pin");
    assert.deepEqual(useTemari.getState().pinArcs, []);
    useTemari.getState().placePin(kikuWorkingPins("simple", 0)[0]!.p);
    assert.equal(useTemari.getState().pins.length, 8);
    assert.equal(getCraftState().kikuMarksReady, false);
  });

  it("rejects hidden legacy kiku-slot drawing in free mode and unsupported divisions", () => {
    for (const division of ["simple", "c8", "c10"] as const) {
      useTemari.setState({ division, motif: "none", craft: "stitch" });
      useTemari.getState().sew({ pole: 0, ring: 0, sector: 0 });
      assert.deepEqual(useTemari.getState().sewn, []);
    }
  });

  it("switches from kiku to free pin placement when the grid is cleared", () => {
    useTemari.getState().setMotif("kiku");
    const marks = kikuWorkingPins("simple", 0);
    useTemari.setState({
      pins: marks, pinHistory: [{ pins: marks, pinArcs: [], activePin: null }],
      kagariPlan: motifStitchPlan("simple", "kiku"), kagariPlaying: true,
    });
    dispatchCommand("jiwari-off");
    assert.equal(useTemari.getState().motif, "none");
    assert.equal(useTemari.getState().craft, "pin");
    assert.equal(useTemari.getState().jiwariOn, false);
    assert.deepEqual(useTemari.getState().kagariPlan, []);
    assert.deepEqual(useTemari.getState().pinHistory, []);
    assert.equal(action("pin").canExecute(getCraftState()), true);
    useTemari.getState().placePin([0.2, 0.3, 1]);
    assert.equal(useTemari.getState().pins.length, 1);
    assert.ok(useTemari.getState().pins[0]!.id.startsWith("p-"));
    assert.equal(useTemari.getState().pinNote, null);
  });

  it("does not let automatic marking phases overwrite manually placed pins or sketch selections", () => {
    const pins = kikuWorkingPins("simple", 0).slice(0, 2);
    for (const jiwariPhase of ["strip", "combine", "vruler", "south", "meridians"] as const) {
      useTemari.setState({ jiwariOn: true, jiwariPhase, motif: "none", pins, craft: "pin" });
      for (const id of ["pin", "stitch"]) {
        assert.equal(action(id).canExecute(getCraftState()), false);
        assert.equal(action(id).getDisabledReason(getCraftState()), "Дождитесь завершения разметки");
      }
      useTemari.getState().placePin([0, 0, 1]);
      assert.deepEqual(useTemari.getState().pins, pins);
      useTemari.setState({ craft: "stitch", activePin: null });
      useTemari.getState().sketchToPin(pins[0]!.p);
      assert.equal(useTemari.getState().activePin, null);
      assert.deepEqual(useTemari.getState().pinArcs, []);
    }
    useTemari.setState({ jiwariPhase: "done" });
    assert.equal(action("pin").canExecute(getCraftState()), true);
    assert.equal(action("stitch").canExecute(getCraftState()), true);
  });

  it("requires the completed S8 grid to choose kiku, even when free pins already exist", () => {
    useTemari.setState({ jiwariOn: false, jiwariPhase: "off", pins: kikuWorkingPins("simple", 0) });
    assert.equal(action("motif-kiku").canExecute(getCraftState()), false);
    assert.equal(action("motif-kiku").getDisabledReason(getCraftState()), "Выберите S8 в разделе „Разметка“");
    useTemari.getState().setMotif("kiku");
    assert.equal(useTemari.getState().motif, "none");
    useTemari.setState({ jiwariOn: true, jiwariPhase: "meridians" });
    assert.equal(action("motif-kiku").canExecute(getCraftState()), false);
    assert.equal(action("motif-kiku").getDisabledReason(getCraftState()), "Дождитесь завершения разметки");
    useTemari.getState().setMotif("kiku");
    assert.equal(useTemari.getState().motif, "none");
    useTemari.setState({ jiwariPhase: "done" });
    assert.equal(action("motif-kiku").canExecute(getCraftState()), true);
  });

  it("allows choosing the sketch without a grid or pins, without manufacturing hidden marks", () => {
    useTemari.setState({ jiwariOn: false, jiwariPhase: "off", pins: [] });
    assert.equal(action("motif-none").canExecute(getCraftState()), true);
    dispatchCommand("motif-none");
    assert.deepEqual(useTemari.getState().pins, []);
    useTemari.getState().placePin([0.3, 0.2, 1]);
    const pins = useTemari.getState().pins;
    dispatchCommand("motif-none");
    assert.deepEqual(useTemari.getState().pins, pins);
  });
});

describe("quick kiku: marking and pins at the facing pole in one tap", () => {
  beforeEach(() => {
    // A fresh workshop: no grid, sketch motif, C8 remembered from an earlier session.
    useTemari.setState({
      ...initialState,
      mode: "studio",
      division: "c8",
      motif: "none",
      layerDone: true,
      craft: "pin",
      jiwariOn: false,
      jiwariPhase: "off",
      pins: [{ id: "free", p: [0, 0, 1] }],
    }, true);
  });
  afterEach(() => useTemari.setState(initialState, true));

  for (const pole of [0, 1]) {
    it(`finishes S8 and sets the working pins at pole ${pole}, ready to sew there`, () => {
      useTemari.setState({ facingPole: pole });
      assert.equal(action("quick-kiku").canExecute(getCraftState()), true);
      dispatchCommand("quick-kiku");
      const s = useTemari.getState();
      assert.equal(s.division, "simple");
      assert.equal(s.jiwariOn && s.jiwariPhase === "done", true);
      assert.equal(s.motif, "kiku");
      assert.equal(s.facingPole, pole);
      assert.deepEqual(s.pins.map((pin) => pin.id).sort(), kikuWorkingPins("simple", pole).map((pin) => pin.id).sort());
      assert.equal(getCraftState().kikuMarksReady, true);
      assert.deepEqual(s.kagariPlan, []);
      assert.equal(s.pinNote, null);
      // «Начать кику» is available and sews this pole only.
      assert.equal(action("fill").canExecute(getCraftState()), true);
      dispatchCommand("fill");
      finishPlan();
      const plan = useTemari.getState().kagariPlan;
      assert.ok(plan.length > 0);
      assert.ok(plan.every((stitch) => stitchPoleIndex(stitch, "simple", "kiku") === pole));
    });
  }

  it("keeps a flower sewn at one pole when the other pole is prepared, and restarts the facing one", () => {
    dispatchCommand("quick-kiku");
    dispatchCommand("fill");
    finishPlan();
    const north = useTemari.getState().kagariPlan;
    assert.ok(north.length > 0);
    useTemari.setState({ facingPole: 1 });
    dispatchCommand("quick-kiku");
    let s = useTemari.getState();
    assert.deepEqual(s.kagariKept, north);
    assert.deepEqual(s.kagariPlan, []);
    assert.deepEqual(s.pins.map((pin) => pin.id).sort(), kikuWorkingPins("simple", 1).map((pin) => pin.id).sort());
    // Pressing again at the same pole drops only that pole's unfinished flower.
    dispatchCommand("fill");
    finishPlan();
    useTemari.getState().quickKiku();
    s = useTemari.getState();
    assert.deepEqual(s.kagariKept, north);
    assert.deepEqual(s.kagariPlan, []);
  });

  it("keeps the sewn flower when the view is turned to the other pole", () => {
    dispatchCommand("quick-kiku");
    dispatchCommand("fill");
    finishPlan();
    const north = useTemari.getState().kagariPlan;
    assert.ok(north.length > 0);
    useTemari.setState({ poseDirty: false, viewPole: 0 });
    useTemari.getState().resetView();
    const s = useTemari.getState();
    assert.equal(s.facingPole, 1);
    assert.deepEqual(s.kagariKept, north);
    assert.deepEqual(s.kagariPlan, []);
    dispatchCommand("quick-kiku");
    assert.deepEqual(useTemari.getState().kagariKept, north);
  });

  it("keeps each working thread's colour: painting the second group leaves the first", () => {
    dispatchCommand("quick-kiku");
    useTemari.getState().setColor(1);
    dispatchCommand("fill");
    finishPlan();
    const first = useTemari.getState().kagariPlan;
    assert.ok(first.length > 0);
    assert.ok(first.every((stitch) => stitch.color === 1), "the first group is sewn in the thread in hand");
    // A second thread for the second group.
    useTemari.getState().setColor(3);
    dispatchCommand("motif-kiku");
    finishPlan();
    const both = useTemari.getState();
    assert.equal(both.kagariSet, 1);
    assert.ok(both.kagariPlan.every((stitch) => stitch.color === 3), "the second group takes the new thread");
    assert.ok(both.kagariKept.every((stitch) => stitch.color === 1), "what is sewn keeps its own colour");
    assert.deepEqual(both.kagariColors, [1, 3]);
    // Rows added afterwards follow their own set, not the last pick.
    dispatchCommand("kiku-finish");
    finishPlan();
    const done = useTemari.getState();
    const laid = [...done.kagariKept, ...done.kagariPlan];
    const bySet = new Map<number, Set<number>>();
    for (const stitch of laid) {
      if (stitch.kind !== "arc" || stitch.set == null) continue;
      const seen = bySet.get(stitch.set) ?? new Set<number>();
      seen.add(stitch.color);
      bySet.set(stitch.set, seen);
    }
    assert.deepEqual([...(bySet.get(0) ?? [])], [1], "set A stays its colour to the equator");
    assert.deepEqual([...(bySet.get(1) ?? [])], [3], "set B stays its colour to the equator");
  });

  it("a colour picked before «Кику здесь» is the first four petals' thread", () => {
    // The owner picked a colour in the workshop and the first four came out in
    // another one: starting a new flower replaced the pick with a default pair.
    const wrap = useTemari.getState().wrapColor;
    const pick = [0, 1, 2, 3, 4].find((c) => c !== wrap && c !== kikuThreads(wrap)[0])!;
    useTemari.getState().setColor(pick);
    dispatchCommand("quick-kiku");
    assert.equal(useTemari.getState().kagariColors[0], pick);
    dispatchCommand("fill");
    finishPlan();
    assert.ok(useTemari.getState().kagariPlan.every((stitch) => stitch.color === pick));
  });

  it("a thread of the wrap's own colour is not carried into a new flower", () => {
    const wrap = useTemari.getState().wrapColor;
    useTemari.getState().setColor(wrap);
    dispatchCommand("quick-kiku");
    assert.equal(useTemari.getState().kagariColors[0], kikuThreads(wrap)[0]);
  });

  it("«1» and «2» choose which four petals the palette paints", () => {
    dispatchCommand("quick-kiku");
    const [a] = useTemari.getState().kagariColors;
    const b = [0, 1, 2, 3, 4].find((c) => c !== a)!;
    // Both threads chosen before a stitch is sewn.
    useTemari.getState().editThread(1);
    useTemari.getState().setColor(b);
    let s = useTemari.getState();
    assert.deepEqual(s.kagariColors, [a, b]);
    assert.equal(s.selectedColor, b, "the palette shows the thread being painted");
    dispatchCommand("fill");
    assert.equal(useTemari.getState().kagariEdit, 1, "the choice holds while the group is sewn");
    finishPlan();
    s = useTemari.getState();
    assert.ok(s.kagariPlan.every((stitch) => stitch.color === a), "first four in thread 1");
    assert.equal(s.kagariEdit, null, "once the hand changes thread, the palette follows it again");
    assert.equal(s.selectedColor, b);
    dispatchCommand("motif-kiku");
    finishPlan();
    s = useTemari.getState();
    assert.ok(s.kagariPlan.every((stitch) => stitch.color === b), "second four in thread 2");
    assert.ok(s.kagariKept.every((stitch) => stitch.color === a));
    // Thread 1 repainted while the second group waits: nothing laid changes,
    // the rows still to come in set A take the new colour.
    const c = [0, 1, 2, 3, 4].find((x) => x !== a && x !== b)!;
    useTemari.getState().editThread(0);
    useTemari.getState().setColor(c);
    s = useTemari.getState();
    assert.deepEqual(s.kagariColors, [c, b]);
    assert.ok(s.kagariKept.every((stitch) => stitch.color === a), "laid thread keeps its colour");
    dispatchCommand("kiku-finish");
    finishPlan();
    const rest = useTemari.getState().kagariPlan.slice(useTemari.getState().kagariPlan.length / 2);
    for (const stitch of rest) {
      if (stitch.kind === "arc" && stitch.set === 0) assert.equal(stitch.color, c);
      if (stitch.kind === "arc" && stitch.set === 1) assert.equal(stitch.color, b);
    }
  });

  it("the palette always shows the thread the next stitches will be sewn in", () => {
    // The hand holds the set being sewn — and once its group is finished, the
    // next one, because that is the thread the pattern says to pick up.
    const inHand = () => {
      const s = useTemari.getState();
      const laidOut = s.kagariPlan.length > 0 && s.kagariLaid >= s.kagariPlan.length;
      return s.kagariSet === 0 && laidOut ? 1 : s.kagariSet;
    };
    const agrees = (step: string) => {
      const s = useTemari.getState();
      if (s.motif !== "kiku") return;
      assert.equal(s.selectedColor, s.kagariColors[inHand()], `${step}: palette holds the thread in hand`);
      const next = s.kagariPlan[s.kagariLaid];
      if (next && next.kind === "arc" && next.set === s.kagariSet) {
        assert.equal(next.color, s.kagariColors[s.kagariSet], `${step}: the next stitch is that thread`);
      }
    };
    dispatchCommand("quick-kiku"); agrees("«Кику здесь»");
    useTemari.getState().setColor(3); agrees("colour picked before the first group");
    dispatchCommand("fill"); agrees("first group started");
    finishPlan(); agrees("first group finished");
    useTemari.getState().setColor(4); agrees("colour picked for the second thread");
    dispatchCommand("motif-kiku"); agrees("«Вторая группа»");
    finishPlan(); agrees("second group finished");
    dispatchCommand("kiku-finish"); finishPlan(); agrees("«Дошить»");
    dispatchCommand("undo"); agrees("«Отменить»");
    useTemari.setState({ poseDirty: false, viewPole: 0 });
    useTemari.getState().resetView(); agrees("turned to the other pole");
    dispatchCommand("quick-kiku"); agrees("«Кику здесь» again");
    useTemari.getState().showExample(); agrees("«Пример»");
  });

  it("repainting a thread moves no stitch, even mid-row when both sets are in the plan", () => {
    dispatchCommand("quick-kiku");
    dispatchCommand("fill");
    finishPlan();
    dispatchCommand("motif-kiku");
    finishPlan();
    // A grown round holds a row of each set, and the animation stops inside it.
    dispatchCommand("fill");
    for (let i = 0; i < 3 && useTemari.getState().kagariPlaying; i++) useTemari.getState().advanceKagari();
    const before = useTemari.getState();
    assert.ok(before.kagariLaid > 0 && before.kagariLaid < before.kagariPlan.length, "stopped mid-round");
    const sets = new Set(before.kagariPlan.map((stitch) => stitch.kind === "arc" ? stitch.set : null));
    assert.equal(sets.size, 2, "the plan holds both sets");
    const inHand = before.kagariSet;
    useTemari.getState().setColor(0);
    const after = useTemari.getState();
    assert.equal(after.kagariPlan.length, before.kagariPlan.length);
    before.kagariPlan.forEach((stitch, i) => {
      const now = after.kagariPlan[i]!;
      if (stitch.kind !== "arc" || now.kind !== "arc") return;
      assert.deepEqual(now.a, stitch.a, `stitch ${i} kept its place`);
      assert.deepEqual(now.b, stitch.b, `stitch ${i} kept its place`);
      assert.equal(now.set, stitch.set, `stitch ${i} kept its set`);
      const repainted = i >= before.kagariLaid && stitch.set === inHand;
      assert.equal(now.color, repainted ? 0 : stitch.color, `stitch ${i} colour`);
    });
  });

  it("takes a laid group back, one group per «Отменить», down to the bare marks", () => {
    dispatchCommand("quick-kiku");
    const marks = useTemari.getState().pins.length;
    assert.equal(action("undo").canExecute(getCraftState()), false, "nothing sewn yet");
    dispatchCommand("fill");
    finishPlan();
    const first = useTemari.getState().kagariPlan;
    assert.ok(first.length > 0);
    // The second group: four more petals, over the first four.
    dispatchCommand("motif-kiku");
    finishPlan();
    const both = useTemari.getState();
    assert.equal(both.kagariSet, 1);
    assert.ok(both.kagariKept.length + both.kagariPlan.length > first.length);
    assert.equal(action("undo").canExecute(getCraftState()), true);
    dispatchCommand("undo");
    const back = useTemari.getState();
    assert.equal(back.kagariSet, 0);
    assert.deepEqual(back.kagariPlan, first);
    assert.deepEqual(back.kagariKept, []);
    dispatchCommand("undo");
    const bare = useTemari.getState();
    assert.deepEqual(bare.kagariPlan, []);
    assert.deepEqual(bare.kagariKept, []);
    assert.equal(bare.pins.length, marks, "the marks stay; only the thread goes back");
    assert.equal(action("undo").canExecute(getCraftState()), false);
  });

  it("gives back a flower that a second «Кику здесь» cleared at this pole", () => {
    dispatchCommand("quick-kiku");
    dispatchCommand("fill");
    finishPlan();
    const sewn = useTemari.getState().kagariPlan;
    assert.ok(sewn.length > 0);
    dispatchCommand("quick-kiku");
    const cleared = useTemari.getState();
    assert.deepEqual(cleared.kagariPlan, []);
    assert.deepEqual(cleared.kagariKept, []);
    // Nothing is lost in silence: the pin tool is selected, and undo still has the thread.
    assert.equal(cleared.craft, "pin");
    assert.deepEqual(cleared.pinHistory, []);
    assert.equal(action("undo").canExecute(getCraftState()), true);
    dispatchCommand("undo");
    assert.deepEqual(useTemari.getState().kagariPlan, sewn);
  });

  it("sews every row this pole has room for in one step, undone in one step", () => {
    dispatchCommand("quick-kiku");
    assert.equal(action("kiku-finish").canExecute(getCraftState()), false, "not before the groups");
    dispatchCommand("fill");
    finishPlan();
    assert.equal(action("kiku-finish").canExecute(getCraftState()), false, "not on one group");
    dispatchCommand("motif-kiku");
    finishPlan();
    const two = useTemari.getState();
    const fit = getCraftState().kikuFit;
    assert.ok(fit > two.kikuLayers, `room left: ${fit} > ${two.kikuLayers}`);
    assert.equal(action("kiku-finish").canExecute(getCraftState()), true);
    dispatchCommand("kiku-finish");
    finishPlan();
    const done = useTemari.getState();
    assert.equal(done.kikuLayers, fit);
    assert.ok(done.kagariPlan.length > two.kagariPlan.length);
    assert.equal(done.kagariLaid, done.kagariPlan.length);
    // The pole is full: the step is offered no more.
    assert.equal(action("kiku-finish").canExecute(getCraftState()), false);
    assert.match(action("kiku-finish").getDisabledReason(getCraftState()) ?? "", /Экватор/);
    // Pins are pulled as the work covers them: a finished flower carries none.
    assert.deepEqual(done.pins, []);
    dispatchCommand("undo");
    const back = useTemari.getState();
    assert.equal(back.kikuLayers, two.kikuLayers);
    assert.deepEqual(back.kagariPlan, two.kagariPlan);
    assert.deepEqual(back.pins, two.pins, "undo puts the marks back with the rows");
  });

  it("turns the working pole to the eye instead of leaving it on the silhouette", () => {
    useTemari.setState({ facingPole: 1, viewPole: 0, poseDirty: true });
    const nonce = useTemari.getState().viewNonce;
    dispatchCommand("quick-kiku");
    const s = useTemari.getState();
    assert.equal(s.viewPole, 1);
    assert.equal(s.viewPole, s.facingPole);
    assert.equal(s.viewNonce, nonce + 1, "the view turn is a command, not a state");
    assert.equal(s.poseDirty, false);
  });

  it("leaves the pin tool selected so a nudge cannot move the working pole", () => {
    dispatchCommand("quick-kiku");
    assert.equal(useTemari.getState().craft, "pin");
    // Sewing switches the tool itself.
    dispatchCommand("fill");
    assert.equal(useTemari.getState().craft, "stitch");
  });

  it("does nothing outside the workshop", () => {
    useTemari.setState({ mode: "kata" });
    assert.equal(action("quick-kiku").canExecute(getCraftState()), false);
    const before = useTemari.getState();
    dispatchCommand("quick-kiku");
    useTemari.getState().quickKiku();
    assert.equal(useTemari.getState().division, before.division);
    assert.equal(useTemari.getState().motif, before.motif);
  });
});
