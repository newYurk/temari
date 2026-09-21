import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  COVERAGE_BASIS, CRAFT_LEVELS, CRAFT_REQUIREMENTS, HONKA_CONTROLS,
  controlImplementation, requirementLabel, requirementProgress, requirementsForLevel, validateCraftCoverage,
} from "./craft-coverage.ts";

describe("historical JTA craft coverage", () => {
  it("validates every reference without claiming current certification", () => {
    validateCraftCoverage();
    assert.equal(COVERAGE_BASIS.updated, "2017-04");
    assert.equal(COVERAGE_BASIS.currentJtaRequirementsConfirmed, false);
    assert.equal(CRAFT_REQUIREMENTS.length, 36);
    assert.ok(CRAFT_REQUIREMENTS.every((item) => requirementLabel(item).length > 0));
  });

  it("covers the listed basic techniques and all four control compositions", () => {
    const basic = requirementsForLevel("honka").map((item) => item.id);
    assert.deepEqual(basic, [
      "mari", "wrap", "simple", "chidori", "matsuba", "shikaku", "tsumu",
      "uwagake", "mitsubane", "jyouge-douji", "hoshi", "nejiri", "kousa", "obi",
    ]);
    assert.deepEqual(HONKA_CONTROLS.map((item) => item.division), ["s4", "s6", "s8", "s12"]);
    for (const control of HONKA_CONTROLS) {
      assert.equal(controlImplementation(control).implemented, false);
    }
  });

  it("inherits earlier requirements without losing advanced techniques", () => {
    const all = requirementsForLevel("kyoujyu");
    assert.equal(all.length, CRAFT_REQUIREMENTS.length);
    assert.deepEqual(requirementsForLevel("kyoujyu", false).map((item) => item.id),
      ["polyhedra-variants", "complex-renzoku", "complex-hitohudegake"]);
    for (let i = 1; i < CRAFT_LEVELS.length; i++) {
      const previous = requirementsForLevel(CRAFT_LEVELS[i - 1]);
      const current = requirementsForLevel(CRAFT_LEVELS[i]);
      assert.ok(previous.every((item) => current.includes(item)));
    }
    for (const id of ["shitagake", "yubinuki", "maki-kagari", "renzoku", "asanoha", "bara", "kagome", "hitohudegake"]) {
      assert.ok(requirementsForLevel("koutouka", false).some((item) => item.id === id));
    }
    for (const id of ["tamentai", "extra-markings", "sujidate", "uzu", "sakasa", "all-over-kousa", "shishuu", "original-composition", "relative-measures"]) {
      assert.ok(requirementsForLevel("shihan", false).some((item) => item.id === id));
    }
  });

  it("derives the existing example from runtime, not a catalogue status", () => {
    const progress = requirementProgress("uwagake");
    assert.deepEqual(progress.runtimeExamples.map((item) => [item.id, item.division, item.implemented]),
      [["kiku-8-point", "s8", true]]);
    assert.equal(progress.stages.find((item) => item.stage === "numerical")?.status, "partial");
    assert.equal(progress.stages.find((item) => item.stage === "human")?.status, "unverified");
    assert.ok(progress.stages.every((item) => item.status !== "complete"));
    assert.deepEqual(requirementProgress("sakasa").runtimeExamples, []);
    assert.deepEqual(requirementProgress("jyouge-douji").runtimeExamples, []);
  });

  it("rejects a family fallback on the wrong exact marking", () => {
    assert.equal(controlImplementation({
      ...HONKA_CONTROLS[3], recipeId: "kiku-8-point",
    }).implemented, false);
    assert.throws(() => controlImplementation({
      ...HONKA_CONTROLS[0], recipeId: "missing-recipe",
    }), /unknown catalogue recipe/);
  });

  it("does not turn a scoped numerical result into visual or human acceptance", () => {
    const progress = requirementProgress("uwagake", [{
      requirementId: "uwagake", stage: "numerical", artifact: "test", revision: "test",
      scope: "synthetic complete numerical coverage", completeRequirement: true,
    }]);
    assert.equal(progress.stages.find((item) => item.stage === "numerical")?.status, "complete");
    assert.equal(progress.stages.find((item) => item.stage === "visual")?.status, "unverified");
    assert.equal(progress.stages.find((item) => item.stage === "human")?.status, "unverified");
  });

  it("rejects duplicate requirements, invalid catalogue links and incomplete evidence", () => {
    assert.throws(() => validateCraftCoverage([...CRAFT_REQUIREMENTS, CRAFT_REQUIREMENTS[0]]), /Duplicate/);
    assert.throws(() => validateCraftCoverage([{
      ...CRAFT_REQUIREMENTS[3], label: undefined, catalog: { kind: "stitch", id: "not-a-stitch" },
    }]), /catalogue reference/);
    assert.throws(() => validateCraftCoverage(CRAFT_REQUIREMENTS, HONKA_CONTROLS, [{
      requirementId: "uwagake", stage: "human", artifact: "", revision: "", scope: "", completeRequirement: true,
    }]), /Incomplete craft evidence/);
    assert.throws(() => requirementProgress("missing"), /Unknown craft requirement/);
  });

  it("rejects missing, cyclic and later-level prerequisites", () => {
    const first = CRAFT_REQUIREMENTS[0];
    assert.throws(() => validateCraftCoverage([{ ...first, prerequisiteIds: ["missing"] }], [], []), /Unknown craft prerequisite/);
    assert.throws(() => validateCraftCoverage([{ ...first, prerequisiteIds: [first.id] }], [], []), /Cyclic/);
    assert.throws(() => validateCraftCoverage([
      { ...first, prerequisiteIds: ["later"] },
      { ...first, id: "later", firstLevel: "kyoujyu" },
    ], [], []), /later level/);
  });

  it("exports parseable JSON and rejects unknown CLI arguments", () => {
    const script = fileURLToPath(new URL("../../../scripts/check-craft-coverage.mts", import.meta.url));
    const result = spawnSync(process.execPath, ["--import", "tsx", script, "--json"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.basis.currentJtaRequirementsConfirmed, false);
    assert.deepEqual(report.levels.map((item: { level: string }) => item.level), CRAFT_LEVELS);
    assert.equal(report.controls.length, 4);
    assert.equal(report.controls.filter((item: { implemented: boolean }) => item.implemented).length, 0);
    const invalid = spawnSync(process.execPath, ["--import", "tsx", script, "--certify"], { encoding: "utf8" });
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /Usage:/);
    assert.equal(invalid.stdout, "");
  });
});
