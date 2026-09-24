/** Read-only finite-mesh witness, not a capture certificate or a new solver. */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { Vector3 } from "three";
import { compileKiku, stitchesFromOps } from "../src/components/temari/patterns.ts";
import { createMotifGeometryParts, pileParts } from "../src/components/temari/stitches.ts";
import { buildUpperStudioBaseline, intersectPolylineSphere } from "../src/components/temari/upper-studio-baseline.ts";
import { runtimeModelSource } from "./lib/stitch-diagram-data.ts";

const root = resolve(import.meta.dirname, "..");
const sourceEntry = "src/components/temari/upper-studio-baseline.ts";
const source = runtimeModelSource(root, sourceEntry);
const baseline = buildUpperStudioBaseline();
const referenceVisit = baseline.visits.find(v => v.row === 3)!;
const bothSets = process.argv.includes("--both-sets");
const stitches = stitchesFromOps(compileKiku("simple", "out", "even", 0, 0, 3, bothSets ? "all" : 0));
const actualParts = pileParts(stitches, "pearl5").map((p, i) => ({
  partId: `actual-part-${i}`, operationId: p.at.operation!.operationId,
  pointsMm: p.pts.map(v => v.clone().multiplyScalar(baseline.config.bodyRadiusMm).toArray()),
}));
const localArmIds = referenceVisit.partIds.map(id => baseline.parts.find(p => p.partId === id)!.operationId);
const visit = { ...referenceVisit, axisSphereCrossings: actualParts.filter(p => localArmIds.includes(p.operationId))
  .flatMap(p => intersectPolylineSphere(p.pointsMm, baseline.config.bodyRadiusMm)
    .filter(c => new Vector3(...c.pointMm).distanceTo(new Vector3(...referenceVisit.recipe.markMm)) < referenceVisit.windowHalfWidthMm)
    .map(c => ({ ...c, partId: p.partId, operationId: p.operationId }))) };
if (visit.axisSphereCrossings.length !== 2) throw new Error("This diagnostic requires exactly two actual local surface crossings.");
const R = baseline.config.bodyRadiusMm;
const ports = visit.axisSphereCrossings.map(c => new Vector3(...c.pointMm));
const radial = ports[0]!.clone().add(ports[1]!).normalize();
const across = ports[0]!.clone().sub(ports[1]!);
across.addScaledVector(radial, -across.dot(radial)).normalize();
const normal = new Vector3().crossVectors(radial, across).normalize();
const angularMm = (p: Vector3) => R * Math.atan2(p.dot(across), p.dot(radial));
const local = (p: Vector3) => p.dot(radial) > 0 && Math.abs(angularMm(p)) < 4;
const nextId = (id: string) => baseline.operations.find(op => op.trace.previousInThread === id)?.trace.operationId;
const arms = (id: string) => {
  const next = nextId(id);
  if (!next) throw new Error(`Missing outgoing flank for ${id}.`);
  return [id, next];
};
const priorIds = visit.recipe.trace.overOperations.flatMap(arms);
const currentIds = arms(visit.operationId);

type Cut = { triangle: number; vertices: Vector3[]; a: Vector3; b: Vector3 };
const meshes = createMotifGeometryParts(stitches, 0, "pearl5", { pile: true });
const sections = meshes.filter(g => [...priorIds, ...currentIds].includes(g.userData.operationId)).map(g => {
  const position = g.getAttribute("position"), index = g.getIndex()!;
  const cuts: Cut[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const vertices = [0, 1, 2].map(j => new Vector3().fromBufferAttribute(position, index.getX(i + j)).multiplyScalar(R));
    const hits: Vector3[] = [];
    for (let j = 0; j < 3; j++) {
      const a = vertices[j]!, b = vertices[(j + 1) % 3]!, fa = a.dot(normal), fb = b.dot(normal);
      if (fa * fb > 0 || fa === fb) continue;
      const point = a.clone().lerp(b, fa / (fa - fb));
      if (!hits.some(p => p.distanceTo(point) < 1e-9)) hits.push(point);
    }
    if (hits.length === 2 && hits.every(local)) cuts.push({ triangle: i / 3, vertices, a: hits[0]!, b: hits[1]! });
  }
  const points = cuts.flatMap(c => [c.a, c.b]);
  return { operationId: g.userData.operationId as string, cuts,
    angularExtentMm: points.length ? [Math.min(...points.map(angularMm)), Math.max(...points.map(angularMm))] : null };
});

// Independent 2-D line-segment intersection in the common plane, not the
// centreline/circular-envelope closestSegmentApproach used by the baseline.
const xy = (p: Vector3) => [p.dot(across), p.dot(radial)] as const;
const cross2 = (a: readonly number[], b: readonly number[]) => a[0]! * b[1]! - a[1]! * b[0]!;
const sub2 = (a: readonly number[], b: readonly number[]) => [a[0]! - b[0]!, a[1]! - b[1]!];
function barycentric(point: Vector3, vertices: Vector3[]) {
  const u = vertices[1]!.clone().sub(vertices[0]!), v = vertices[2]!.clone().sub(vertices[0]!);
  const w = point.clone().sub(vertices[0]!);
  const uu = u.dot(u), uv = u.dot(v), vv = v.dot(v), wu = w.dot(u), wv = w.dot(v);
  const determinant = uu * vv - uv * uv;
  const b = (vv * wu - uv * wv) / determinant, c = (uu * wv - uv * wu) / determinant;
  return [1 - b - c, b, c];
}
const witnesses = [];
const checkedPairs: { priorOperation: string; currentOperation: string; intersectionWitness: boolean }[] = [];
for (const old of sections.filter(s => priorIds.includes(s.operationId))) {
  for (const current of sections.filter(s => currentIds.includes(s.operationId))) {
    let witness = null;
    for (const a of old.cuts) {
      for (const b of current.cuts) {
        const u = sub2(xy(a.b), xy(a.a)), v = sub2(xy(b.b), xy(b.a)), delta = sub2(xy(b.a), xy(a.a));
        const determinant = cross2(u, v), lengths = Math.hypot(...u) * Math.hypot(...v);
        if (Math.abs(determinant) <= 1e-8 * lengths) continue;
        const t = cross2(delta, v) / determinant, s = cross2(delta, u) / determinant;
        if (t <= 1e-7 || t >= 1 - 1e-7 || s <= 1e-7 || s >= 1 - 1e-7) continue;
        const p = a.a.clone().lerp(a.b, t), q = b.a.clone().lerp(b.b, s);
        if (p.length() <= R || p.distanceTo(q) > 1e-7) continue;
        const priorBarycentric = barycentric(p, a.vertices), currentBarycentric = barycentric(q, b.vertices);
        if (![...priorBarycentric, ...currentBarycentric].every(x => x > 1e-7 && x < 1 - 1e-7)) continue;
        witness = { priorOperation: old.operationId, currentOperation: current.operationId,
          priorTriangle: a.triangle, currentTriangle: b.triangle, pointMm: p.toArray(),
          heightMm: p.length() - R, residualMm: p.distanceTo(q), priorBarycentric, currentBarycentric,
          priorVerticesMm: a.vertices.map(v => v.toArray()), currentVerticesMm: b.vertices.map(v => v.toArray()) };
        break;
      }
      if (witness) break;
    }
    if (witness) witnesses.push(witness);
    checkedPairs.push({ priorOperation: old.operationId, currentOperation: current.operationId, intersectionWitness: !!witness });
  }
}
const priorAxisSections = actualParts.filter(p => priorIds.includes(p.operationId)).map(part => ({
  operationId: part.operationId,
  intersections: part.pointsMm.slice(1).flatMap((point, i) => {
    const a = new Vector3(...part.pointsMm[i]!), b = new Vector3(...point), fa = a.dot(normal), fb = b.dot(normal);
    if (fa * fb > 0 || fa === fb) return [];
    const t = fa / (fa - fb), p = a.clone().lerp(b, t);
    return local(p) ? [{ segment: i, t, angularMm: angularMm(p), heightMm: p.length() - R }] : [];
  }),
}));
if (runtimeModelSource(root, sourceEntry).digest !== source.digest) throw new Error("Studio sources changed during measurement.");
const missingOrEmptySections = [...priorIds, ...currentIds].filter(id => !sections.some(s => s.operationId === id && s.cuts.length));
console.log(JSON.stringify({
  status: witnesses.length ? "rendered-mesh-intersection-witness" : "no-witness-in-this-section",
  source: { ...source, revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    sourceModified: !!execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim() },
  config: { ...baseline.config, sceneSets: bothSets ? "A+B" : "A", inspectedCatchSet: "A" },
  section: { normal: normal.toArray(), radial: radial.toArray(), across: across.toArray(),
    actualPortAngularMm: ports.map(angularMm), meaning: "Plane through sphere centre and both actual third-catch surface crossings." },
  declaredCaptures: visit.recipe.trace.overOperations, priorAxisSections,
  coverage: { priorIds, currentIds, checkedPairs,
    missingOrEmptySections },
  meshSections: sections.map(({ cuts, ...s }) => ({ ...s, cutSegments: cuts.length })), witnesses,
  limitations: [
    "Finite rendered triangles after mesh smoothing; no circular or rounded proxy is used for the witnesses.",
    "Transverse interior section intersections witness common points of the two rendered surfaces outside the mari.",
    "Absence of a witness on one plane is not a full collision clearance or a capture certificate.",
    "Angular extents are section measurements; aperture containment alone cannot prove capture or link topology.",
    "Only the named first/second-row incoming/outgoing flanks and third catch, within 4 mm angular distance of the aperture middle, are tested.",
    "Tangencies, coplanar degeneracies and section endpoint contacts are not accepted as transverse witnesses; no equilibrium or craft acceptance.",
  ],
}, null, 2));
// A necessary local gate, not a whole-path or craft acceptance certificate.
if (process.argv.includes("--assert-section") && (witnesses.length || missingOrEmptySections.length
  || priorIds.length !== 4 || currentIds.length !== 2 || checkedPairs.length !== 8)) {
  console.error(`Upper catch section rejected: ${witnesses.length} intersecting pairs; ${missingOrEmptySections.length} missing sections.`);
  process.exitCode = 1;
}
