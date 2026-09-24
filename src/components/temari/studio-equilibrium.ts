import { buildUpperStudioBaseline, intersectPolylineSphere, type StudioPointMm } from './upper-studio-baseline';
import { solveYarnEquilibrium, type YarnEquilibriumInput } from './yarn-equilibrium';

/** A conditional mechanical experiment using the ACTUAL studio paths, not a new kiku recipe.
 * Clamps at the observation window are explicit boundary conditions, not new stitch anchors.
 * Assigned ports stay fixed; buried material may move inside an assigned shell. No claim about full-flower equilibrium,
 * embroidery acceptance, or calibrated pearl stiffness follows from this experiment.
 */
export type StudioEquilibriumOptions = {
  radiusMm?: number;
  stepMm?: number;
  windowMm?: number;
  axialStiffnessN?: number;
  bendingStiffnessNmm2?: number;
  /** Assigned initial elastic strain; zero preserves the complete initial material length. */
  initialStrain?: number;
  foundationAllowanceMm?: number;
  /** Renderer intersections are not measured holes. Recipe mode starts a NEW construction. */
  portSource?: 'render' | 'recipe';
  /** Explicit free-sliding pull control, not the no-slip elastic material case. */
  feedTensionN?: number;
  availableLengthMm?: number;
};
const distance = (a: StudioPointMm, b: StudioPointMm) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mix = (a: StudioPointMm, b: StudioPointMm, t: number): StudioPointMm => a.map((v, i) => v + t * (b[i] - v)) as StudioPointMm;

/** Retain exact sphere crossings and the two ends while spacing other nodes by arc length. */
function resampleWithPorts(points: StudioPointMm[], step: number, R: number) {
  const crossings = intersectPolylineSphere(points, R);
  const anchors = new Map<number, StudioPointMm[]>();
  for (const c of crossings) {
    const list = anchors.get(c.segment) ?? [];
    list.push(c.pointMm); anchors.set(c.segment, list);
  }
  const out: StudioPointMm[] = [[...points[0]]], materialCoordinatesMm = [0];
  let along = 0, next = step;
  const push = (point: StudioPointMm, s: number) => {
    if (s - materialCoordinatesMm.at(-1)! > 1e-9) { out.push([...point]); materialCoordinatesMm.push(s); }
  };
  for (let i = 0; i + 1 < points.length; i++) {
    const stops = [...(anchors.get(i) ?? []), points[i + 1]];
    let a = points[i];
    for (let j = 0; j < stops.length; j++) {
      const b = stops[j], length = distance(a, b), end = along + length;
      while (next < end - 1e-9) { push(mix(a, b, (next - along) / length), next); next += step; }
      if (j < stops.length - 1 || i === points.length - 2) {
        push(b, end); next = end + step;
      }
      along = end; a = b;
    }
  }
  return { points: out, ports: crossings.map(c => c.pointMm), materialCoordinatesMm };
}

export function buildStudioEquilibriumInput(options: StudioEquilibriumOptions = {}) {
  const parameters = {
    radiusMm: options.radiusMm ?? .355,
    stepMm: options.stepMm ?? .45,
    windowMm: options.windowMm ?? 8,
    axialStiffnessN: options.axialStiffnessN ?? 10,
    bendingStiffnessNmm2: options.bendingStiffnessNmm2 ?? .001,
    initialStrain: options.initialStrain ?? 0,
    foundationAllowanceMm: options.foundationAllowanceMm ?? 1.2,
  };
  if (Object.values(parameters).some(v => !Number.isFinite(v)) || parameters.radiusMm <= 0
    || parameters.stepMm <= 0 || parameters.windowMm <= 2 || parameters.axialStiffnessN <= 0
    || parameters.bendingStiffnessNmm2 <= 0 || parameters.initialStrain < 0 || parameters.initialStrain > .05
    || parameters.foundationAllowanceMm <= 2 * parameters.radiusMm)
    throw new RangeError('Finite positive dimensions/stiffnesses and a stated initial strain in [0,.05] are required.');
  const baseline = buildUpperStudioBaseline();
  const portSource = options.portSource ?? 'render';
  if (portSource !== 'render' && portSource !== 'recipe') throw new RangeError('Unknown port source.');
  if (options.feedTensionN !== undefined && (!(options.feedTensionN > 0) || !Number.isFinite(options.feedTensionN)))
    throw new RangeError('The pull control requires a finite positive tension.');
  if (options.availableLengthMm !== undefined && (!(options.availableLengthMm > 0) || !Number.isFinite(options.availableLengthMm)))
    throw new RangeError('The material budget requires a finite positive length.');
  if (options.availableLengthMm !== undefined && options.feedTensionN === undefined)
    throw new RangeError('An available material budget requires explicit feed tension.');
  if (options.feedTensionN !== undefined && parameters.initialStrain !== 0)
    throw new RangeError('The inextensible feed control cannot also prescribe elastic prestrain.');
  const R = baseline.config.bodyRadiusMm;
  const focusMm = baseline.visits[2].recipe.markMm;
  const rows = [1, 2, 3].map(row => {
    const incoming = baseline.parts.find(p => p.row === row && p.mark === 'inner-2')!;
    const outgoing = baseline.parts.find(p => p.row === row && p.mark === 'outer-3')!;
    const first = incoming.pointsMm.findIndex(p => distance(p, focusMm) < parameters.windowMm);
    let last = outgoing.pointsMm.findIndex(p => distance(p, focusMm) > parameters.windowMm);
    if (first < 0 || last < 2) throw new Error('The complete local upper catch is not inside the observation window.');
    // The renderer omits the hidden connector. Include and explicitly identify the
    // straight connector between its buried ends; this is an assigned boundary path.
    const a = incoming.pointsMm.at(-1)!, b = outgoing.pointsMm[0];
    const chordN = Math.max(1, Math.ceil(distance(a, b) / parameters.stepMm));
    const hidden = Array.from({ length: chordN - 1 }, (_, i) => mix(a, b, (i + 1) / chordN));
    const dense = [...incoming.pointsMm.slice(Math.max(0, first - 1)), ...hidden, ...outgoing.pointsMm.slice(0, ++last)];
    const { points, ports: sourceSurfaceCrossingsMm, materialCoordinatesMm } = resampleWithPorts(dense, parameters.stepMm, R);
    const originalPointsMm = points.map(p => [...p] as StudioPointMm);
    if (sourceSurfaceCrossingsMm.length !== 2) throw new Error('The local catch must enter and leave the nominal sphere exactly once.');
    const portal = points.map(p => sourceSurfaceCrossingsMm.some(q => distance(p, q) < 1e-8));
    const portIndices = portal.flatMap((isPort, i) => isPort ? [i] : []);
    if (portIndices.length !== 2) throw new Error('The two sphere crossings must be retained as distinct nodes.');
    const buried = points.map(p => Math.hypot(...p) < R - 1e-8);
    const recipePorts = [baseline.visits[row - 1].recipe.biteEnterMm, baseline.visits[row - 1].recipe.biteExitMm];
    const ports = sourceSurfaceCrossingsMm.map(p => portSource === 'recipe'
      ? [...recipePorts.reduce((best, q) => distance(p, q) < distance(p, best) ? q : best)] as StudioPointMm : p);
    if (distance(ports[0], ports[1]) < 1e-8) throw new Error('Recipe port correspondence is ambiguous; refusing a collapsed needle passage.');
    if (portSource === 'recipe') for (let i = 0; i < points.length; i++) if (portal[i]) {
      const j = sourceSurfaceCrossingsMm.findIndex(q => distance(points[i], q) < 1e-8);
      points[i] = [...ports[j]];
    }
    const clamps = points.map((_, i) => i === 0 || i === points.length - 1);
    const fixed = points.map((_, i) => clamps[i] || portal[i]);
    // The old display ellipse and the circular control have different envelopes.
    // Put the ASSIGNED observation clamps outside the round envelope; actual
    // selected port coordinates are not shifted. The 0.01 mm clearance is fixed across
    // discretizations. Clamps fix position only, not a mesh-dependent second node.
    for (let i = 0; i < points.length; i++) if (clamps[i]) {
      const length = Math.hypot(...points[i]);
      const target = Math.max(length, R + parameters.radiusMm + .01);
      points[i] = points[i].map(x => x * target / length) as StudioPointMm;
    }
    // A declared passage through the shell, NOT an inferred physical indentation.
    // The exterior entrance allowance tapers from the old port to the full envelope.
    const minRadii = points.map((p, i) => buried[i] ? R - parameters.foundationAllowanceMm + parameters.radiusMm
      : Math.min(R + parameters.radiusMm, ...ports.map(port => R + distance(p, port))));
    // Material coordinates belong to the dense original path, BEFORE resampling
    // or changing observation clamps. Refinement must not create/remove material.
    const restLengthsMm = materialCoordinatesMm.slice(1).map((s, i) => (s - materialCoordinatesMm[i]) / (1 + parameters.initialStrain));
    const thread = {
      id: `studio-upper-row-${row}`,
      radiusMm: parameters.radiusMm,
      axialStiffnessN: parameters.axialStiffnessN,
      bendingStiffnessNmm2: parameters.bendingStiffnessNmm2,
      ...(options.feedTensionN === undefined ? {} : { feed: {
        tensionN: options.feedTensionN, availableLengthMm: options.availableLengthMm ?? 40,
      } }),
      nodes: points.map((positionMm, i) => ({ positionMm, fixed: fixed[i], minimumSphereRadiusMm: minRadii[i],
        ...(buried[i] ? { maximumSphereRadiusMm: R } : {}) })),
      restLengthsMm,
      // A coarse mesh may contain no strictly buried NODE between the ports.
      // Classify the whole material interval, not only its sampled endpoints.
      segmentMinimumSphereRadiiMm: points.slice(1).map((_, i) => i >= portIndices[0] && i < portIndices[1]
        ? R - parameters.foundationAllowanceMm + parameters.radiusMm : Math.min(minRadii[i], minRadii[i + 1])),
    };
    return { row, operationIds: [incoming.operationId, outgoing.operationId], portsMm: ports, sourceSurfaceCrossingsMm,
      originalPointsMm, materialCoordinatesMm, thread };
  });
  const input: YarnEquilibriumInput = { threads: rows.map(row => row.thread), sphere: { centerMm: [0, 0, 0], radiusMm: R } };
  return { parameters, portSource, bodyRadiusMm: R, focusMm, rows, input,
    limitations: [
      'Engineering stiffnesses; not measured pearl properties. The circular section is a control, not the studio ellipse.',
      'Window cuts are held clamps; the complete flower, marking thread, friction and transverse compression are not solved.',
      'Ports are assigned from renderer/sphere intersections or a NEW recipe construction, not measured holes. Fixed material nodes mean no-slip in the elastic case, including the ports. Buried nodes may move within an assigned shell; the needle mouth allowance and round-envelope observation clamps are explicit engineering boundaries, not a solved foundation.',
      options.feedTensionN === undefined
        ? 'Three material intervals retain their input rest lengths; no hidden shortening or feed through the clamps.'
        : 'Explicit ideal sliding control: material can pass through every held spatial point. Three local intervals have assigned external reservoirs; they do not establish the complete working-thread balance or frictional holding.',
      'The seed already contains collisions. A final stationary solution does not establish an executable collision-free sewing history or the required over/under topology.',
    ] };
}

export function solveStudioEquilibrium(options: StudioEquilibriumOptions = {}, solverOptions?: YarnEquilibriumInput['options']) {
  const fixture = buildStudioEquilibriumInput(options);
  const result = solveYarnEquilibrium({ ...fixture.input, options: solverOptions });
  return { ...fixture, result };
}
