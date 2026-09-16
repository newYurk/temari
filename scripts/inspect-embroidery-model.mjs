/**
 * Read-only observations supporting spec/embroidery-model.md.
 * Run with Node 24: node --experimental-strip-types scripts/inspect-embroidery-model.mjs
 * This is not production acceptance. Observed application behavior may change;
 * assertions below cover only the independent proposed ray formula.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { polePositions } from "../src/components/temari/division.ts";
import { jiwariNormals } from "../src/components/temari/jiwari.ts";
import { MARI_C_CM, unitFromMm, jiwariLengthM } from "../src/components/temari/measure.ts";
import { around, compileKiku, kikuRecipe, motifSupport, annotateSetCrossings } from "../src/components/temari/patterns.ts";
import { innerBiteJoin, closestApproachT } from "../src/components/temari/kagari.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceFiles = ["division", "jiwari", "measure", "patterns", "kagari", "stitches"]
  .map((name) => `src/components/temari/${name}.ts`);
const git = (...args) => {
  try {
    return execFileSync("git", args, {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    }).trim();
  } catch {
    return null;
  }
};
const snapshot = {
  head: git("rev-parse", "HEAD"),
  sourceChangesFromHead: git("diff", "--name-only", "HEAD", "--", ...sourceFiles),
  sha256: Object.fromEntries(sourceFiles.map((path) => [
    path, createHash("sha256").update(readFileSync(new URL(`../${path}`, import.meta.url))).digest("hex"),
  ])),
};

const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => a.map((x) => x / Math.hypot(...a));
const dist = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
const angle = (a, b) => Math.atan2(Math.hypot(...cross(a, b)), dot(a, b));
const clamp = (x) => Math.max(-1, Math.min(1, x));
const Q = ([x, y, z]) => [y, -x, z];
const radiusC24Mm = 240 / (2 * Math.PI);
const observe = (fn) => {
  try { return { status: "reported", value: fn() }; }
  catch (error) { return { status: "unavailable", error: String(error) }; }
};

function inspectDivision(division) {
  const normals = jiwariNormals(division);
  const unique = [], duplicatePairs = [];
  normals.forEach((normal, index) => {
    const earlier = unique.find((entry) => Math.abs(dot(entry.normal, normal)) > 1 - 1e-12);
    if (earlier) duplicatePairs.push([earlier.index, index]);
    else unique.push({ index, normal });
  });
  const centers = polePositions(division);
  const rayCounts = centers.map((p) => unique.filter(({ normal }) => Math.abs(dot(normal, p)) < 1e-10).length * 2);
  const nearestCenterAngleRad = Math.min(...centers.flatMap((a, i) => centers.slice(i + 1).map((b) => angle(a, b))));
  const intendedRayCount = division === "c10" ? 10 : 8;
  const incidenceErrors = centers.flatMap((p) => {
    const incident = unique.filter(({ normal }) => Math.abs(dot(normal, p)) < 1e-10);
    return Array.from({ length: intendedRayCount }, (_, k) => {
      const q = around(p, 0.3, k * 2 * Math.PI / intendedRayCount);
      return Math.min(...incident.map(({ normal }) => Math.asin(clamp(Math.abs(dot(normal, q))))));
    });
  });
  return {
    normalsReturned: normals.length, uniquePlanesModuloSign: unique.length, duplicatePairs,
    centerCount: centers.length, localRayCounts: rayCounts, nearestCenterAngleRad,
    maxWorldFramePointToIncidentPlaneAngleDeg: Math.max(...incidenceErrors) * 180 / Math.PI,
    lengths: {
      scope: "Complete great circles on the C24 base sphere; excludes catches, tails and thread radius.",
      returnedCirclesMeters: normals.length * 0.24,
      uniqueCirclesMeters: unique.length * 0.24,
      existingLengthHelperMeters: jiwariLengthM(24, division),
    },
  };
}

function inspectCompilation(division) {
  const support = motifSupport(division, "kiku");
  if (!support.supported) return { recipe: null, support, opCount: 0 };
  const ops = compileKiku(division, "out", "even", 0, 0, 1);
  if (!Array.isArray(ops)) return { recipe: kikuRecipe(division), result: ops };
  let layPolylineMmAtC24 = 0;
  for (const op of ops) {
    const points = [op.lay.from, ...(op.lay.via ?? []), op.lay.to];
    for (let i = 1; i < points.length; i++) layPolylineMmAtC24 += radiusC24Mm * angle(points[i - 1], points[i]);
  }
  return {
    recipe: kikuRecipe(division), opCount: ops.length,
    groups: [...new Set(ops.map((op) => op.set))], layPolylineMmAtC24,
    lengthScope: "Only compiled lay polylines projected onto the C24 base sphere; not resolved physical thread or total consumption.",
  };
}

function inspectRotations() {
  const pole = [0, 1, 0], theta = 0.3, phi = 0.7;
  const aroundError = dist(Q(around(pole, theta, phi)), around(Q(pole), theta, phi));
  const pearl = unitFromMm(0.71);
  const v = (a) => norm(a).map((x) => x * (1 + pearl / 2));
  const from = v([0.055, 0.987, 0.14]), mark = v([0.04, 0.99, 0.12]), to = v([0.025, 0.987, 0.155]);
  const first = innerBiteJoin(from, mark, to, pearl, 4).map(Q);
  const second = innerBiteJoin(Q(from), Q(mark), Q(to), pearl, 4);
  return {
    rotation: "Q(x,y,z)=(y,-x,z)",
    around: {
      pole, theta, phi, errorUnit: aroundError, errorMmAtC24: aroundError * radiusC24Mm,
      interpretation: "Fixed phi with a reselected world frame is not a fully rotated placement; reports the missing ray/frame input contract.",
    },
    innerBite: {
      from, mark, to, pearlUnit: pearl, steps: 4,
      outputCounts: [first.length, second.length],
      maxErrorMmAtC24: first.length === second.length ? Math.max(...first.map((p, i) => dist(p, second[i]))) * radiusC24Mm : null,
    },
  };
}

function inspectContacts() {
  const arc = (a, b, set, pole) => ({ kind: "arc", a: norm(a), b: norm(b), set, pole, kai: 0, color: 0 });
  const a = arc([-0.3, 1, 0], [0.3, 1, 0], 0, 0);
  const b = arc([0, 1, -0.3], [0, 1, 0.3], 1, 0);
  const summarize = (stitches) => annotateSetCrossings(stitches).map((s) => ({
    pole: s.pole, set: s.set, sites: s.sitAts ?? [], sitMid: s.sitMid ?? null,
  }));
  return {
    fixture: [a, b], sameCenter: summarize([a, b]),
    differentCenters: summarize([a, { ...b, pole: 1 }]),
    sameGroup: summarize([a, { ...b, set: 0 }]),
    samplingCounterexample: {
      fixture: "Euclidean segments [-1,0,0]→[1,0,0] and [0,-1,0]→[0,1,0]; this is an isolated sampling diagnostic, not a sphere stitch.",
      sampled: closestApproachT([[-1, 0, 0], [1, 0, 0]], [[0, -1, 0], [0, 1, 0]]),
      analyticSegmentDistance: 0,
    },
  };
}

function checkProposedRayFormula() {
  const p = norm([0.1, 0.9, 0.3]), t = norm(cross(p, [0.3, 0.2, 0.8])), axis = norm([1, 2, 3]);
  const rotate = (v, a) => {
    const c = Math.cos(a), s = Math.sin(a), k = cross(axis, v), d = dot(axis, v);
    return v.map((x, i) => x * c + k[i] * s + axis[i] * d * (1 - c));
  };
  const embed = (p, t, h) => p.map((x, i) => x * Math.cos(h) + t[i] * Math.sin(h));
  let maxRotationErrorUnit = 0, maxNormError = 0, maxDistanceErrorRad = 0;
  for (let k = 0; k < 100; k++) {
    const a = k * 0.173, h = 0.01 + k * 0.009, point = embed(p, t, h);
    maxRotationErrorUnit = Math.max(maxRotationErrorUnit, dist(rotate(point, a), embed(rotate(p, a), rotate(t, a), h)));
    maxNormError = Math.max(maxNormError, Math.abs(Math.hypot(...point) - 1));
    maxDistanceErrorRad = Math.max(maxDistanceErrorRad, Math.abs(angle(p, point) - h));
  }
  const tolerance = 1e-10;
  assert.ok(maxRotationErrorUnit < tolerance, "Proposed ray embedding must rotate with its center and tangent");
  assert.ok(maxNormError < tolerance, "Proposed ray embedding must remain on S²");
  assert.ok(maxDistanceErrorRad < tolerance, "Proposed ray embedding must preserve its specified angular distance");
  return { cases: 100, p, t, axis, rotationStep: 0.173, thetaStart: 0.01, thetaStep: 0.009,
    maxRotationErrorUnit, maxNormError, maxDistanceErrorRad, tolerance,
    scope: "Independent algebraic identity checks, not application acceptance or material calibration." };
}

const report = {
  purpose: "Read-only architecture diagnostics; application observations are reports, not requirements that defects persist.",
  node: process.version, snapshot,
  divisions: Object.fromEntries(["simple", "c8", "c10"].map((d) => [d, observe(() => inspectDivision(d))])),
  rotations: observe(inspectRotations),
  compilationOneCenterOneRow: Object.fromEntries(["simple", "c8", "c10"].map((d) => [d, observe(() => inspectCompilation(d))])),
  contacts: observe(inspectContacts),
  units: observe(() => ({
    helperDefaultCircumferenceCm: MARI_C_CM,
    unitFromOneMmDefault: unitFromMm(1), unitFromOneMmAtC32: unitFromMm(1, 32),
    defaultOneMmOnC32SphereMm: unitFromMm(1) * 320 / (2 * Math.PI),
    explicitOneMmOnC32SphereMm: unitFromMm(1, 32) * 320 / (2 * Math.PI),
    scope: "Conversion helper behavior; does not claim a working size selector in the application.",
  })),
  proposedRayFormula: checkProposedRayFormula(),
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
