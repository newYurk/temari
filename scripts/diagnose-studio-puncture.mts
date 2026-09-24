/** Read-only #105 witness. Run: node --import tsx scripts/diagnose-studio-puncture.mts */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { buildUpperStudioBaseline, intersectPolylineSphere } from "../src/components/temari/upper-studio-baseline.ts";
import { runtimeModelSource } from "./lib/stitch-diagram-data.ts";

const root = resolve(import.meta.dirname, "..");
const entry = "src/components/temari/upper-studio-baseline.ts";
const source = runtimeModelSource(root, entry);
const baseline = buildUpperStudioBaseline();
const visit = baseline.visits.find(v => v.row === 3)!;
const R = baseline.config.bodyRadiusMm;
// Mirrors the current renderer's STITCH_FLAT=0.5 and base-height gate.
// This is a reported implementation threshold, not an accepted material law.
const heightScale = .5;
const diveThresholdMm = -baseline.config.roundEnvelopeRadiusMm * heightScale;
const norm = (p: readonly number[]) => Math.hypot(...p);
const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((v, i) => v - b[i]!));
const crossingWitnesses = visit.axisSphereCrossings.map(crossing => {
  const part = baseline.parts.find(p => p.partId === crossing.partId)!;
  const beforePile = part.pointsMm.map((p, i) => {
    const factor = (norm(p) - part.liftMm[i]!) / norm(p);
    return p.map(v => v * factor) as [number, number, number];
  });
  return {
    crossing,
    beforePileCrossings: intersectPolylineSphere(beforePile, R)
      .filter(c => distance(c.pointMm, visit.recipe.markMm) < visit.windowHalfWidthMm)
      .map(c => ({ ...c, nearestRecipePortDistanceMm: Math.min(
        distance(c.pointMm, visit.recipe.biteEnterMm), distance(c.pointMm, visit.recipe.biteExitMm),
      ) })),
    neighbours: [crossing.segment, crossing.segment + 1].map(i => {
      const heightMm = norm(part.pointsMm[i]!) - R;
      const rawHeightMm = heightMm - part.liftMm[i]!;
      return { index: i, pointMm: part.pointsMm[i], rawHeightMm, liftMm: part.liftMm[i], heightMm,
        diveAtCurrentThreshold: rawHeightMm < diveThresholdMm };
    }),
  };
});
if (runtimeModelSource(root, entry).digest !== source.digest) throw new Error("Studio sources changed during measurement.");
console.log(JSON.stringify({
  status: "diagnostic-only",
  source: { ...source,
    revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    sourceModified: !!execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim(),
  },
  config: baseline.config, diveThresholdMm,
  recipe: visit.recipe, recipeToAxis: visit.recipeToAxis, crossingWitnesses,
  priorPathProbes: visit.priorPathProbes, exteriorPriorDistance: visit.exteriorPriorDistance,
  limitations: [...baseline.limitations,
    "Before-pile points are reconstructed from the recorded radial lifts on the same dense polyline.",
    "The reported dive flag mirrors STITCH_FLAT=0.5 in this renderer; revisit it if that implementation changes.",
    "The final tube mesh applies additional smoothing; these witnesses describe pileParts axes, not mesh faces.",
  ],
}, null, 2));
