import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { buildUpperStudioBaseline } from "../src/components/temari/upper-studio-baseline.ts";
import { runtimeModelSource } from "./lib/stitch-diagram-data.ts";

const root = resolve(import.meta.dirname, "..");
const entry = "src/components/temari/upper-studio-baseline.ts";
const source = runtimeModelSource(root, entry);
const dependencyHash = () => createHash("sha256").update(readFileSync(resolve(root, "package-lock.json"))).digest("hex");
const dependencies = dependencyHash();
const baseline = buildUpperStudioBaseline();
if (runtimeModelSource(root, entry).digest !== source.digest) throw new Error("Studio sources changed while measuring the baseline.");
if (dependencyHash() !== dependencies) throw new Error("Dependencies changed while measuring the baseline.");
const summary = {
  status: baseline.status,
  meaning: "Измерения нынешней отрисовки S8, три ряда A. Это не приёмка физики или ремесла.",
  selectedOperations: baseline.operations.length,
  selectedParts: baseline.parts.length,
  referenceParts: baseline.referenceParts.length,
  bodyRadiusMm: baseline.config.bodyRadiusMm,
  circularProxyRadiusMm: baseline.config.roundEnvelopeRadiusMm,
  visits: baseline.visits.map(v => ({ row: v.row, operationId: v.operationId,
    maxAxisHeightMm: v.maxAxisHeightMm, axisSphereCrossings: v.axisSphereCrossings.length,
    recipeToAxisMm: v.recipeToAxis.map(d => ({ port: d.port, distanceMm: d.distanceMm })),
    minExteriorPriorAxisDistanceMm: v.exteriorPriorDistance.minAxisDistanceMm,
    twoCircularProxiesGapMm: v.exteriorPriorDistance.twoRoundEnvelopesGapMm,
    portProbes: v.priorPathProbes.map(p => ({ label: p.label, distanceMm: p.minAxisDistanceMm,
      pointToCircularProxyGapMm: p.pointToRoundEnvelopeGapMm, priorOperation: p.witness?.operationId ?? null })) })),
};
const artifact = { ...baseline, source: { ...source, dependencies,
  revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  sourceModified: !!execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim(),
  measurement: "existing final three-row studio polylines, no solver or recipe modification",
}, geometryDigest: createHash("sha256").update(JSON.stringify({ operations: baseline.operations, parts: baseline.parts,
  referenceParts: baseline.referenceParts })).digest("hex"), summary };
const path = resolve(root, process.argv.find(arg => arg.startsWith("--out="))?.slice(6)
  ?? "screenshots/upper-bundle/upper-studio-baseline.json");
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, JSON.stringify(artifact, null, 2) + "\n");
console.log(JSON.stringify({ artifact: path, sourceDigest: source.digest, geometryDigest: artifact.geometryDigest, summary }, null, 2));
