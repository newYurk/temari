import {
  COVERAGE_BASIS, CRAFT_LEVELS, HONKA_CONTROLS,
  controlImplementation, requirementLabel, requirementProgress, requirementsForLevel, validateCraftCoverage,
} from "../src/components/temari/craft-coverage.ts";

const mode = process.argv[2] ?? "--check";
if (!["--check", "--json"].includes(mode) || process.argv.length > 3) {
  throw new Error("Usage: tsx scripts/check-craft-coverage.mts [--check|--json]");
}
validateCraftCoverage();
const report = {
  basis: COVERAGE_BASIS,
  levels: CRAFT_LEVELS.map((level) => ({
    level,
    requirements: requirementsForLevel(level, false).map((requirement) => ({
      ...requirement, label: requirementLabel(requirement), ...requirementProgress(requirement.id),
    })),
  })),
  controls: HONKA_CONTROLS.map((control) => ({ ...control, ...controlImplementation(control) })),
};
if (mode === "--json") {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("Craft coverage registry is consistent. This check does not certify implementation.");
  for (const level of report.levels) console.log(`${level.level}: ${level.requirements.length} additional requirements`);
  console.log(`Honka controls with an exact runtime recipe: ${report.controls.filter((item) => item.implemented).length}/${report.controls.length}`);
}
