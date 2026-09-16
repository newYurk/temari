import { polePositions, type Division } from "./division";
import { jiwariNormals } from "./jiwari";
import { uniqueMarkingCircles, type MarkingVector } from "./local-marking";

type DiagramDivision = Division | "none";

const dot = (a: MarkingVector, b: MarkingVector) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const cross = (a: MarkingVector, b: MarkingVector): MarkingVector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

function unit(v: MarkingVector): MarkingVector {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
}

// One fixed orthographic camera for all diagrams; no division-specific distortion.
const view = unit([1.65, 1.25, 2.5]);
const right = unit(cross([0, 1, 0], view));
const up = cross(view, right);
const radius = 33;

function project(p: MarkingVector) {
  return {
    x: 40 + radius * dot(p, right),
    y: 40 - radius * dot(p, up),
    front: dot(p, view) >= 0,
  };
}

function circlePaths(normal: MarkingVector) {
  const horizon = cross(normal, view);
  const faceOn = Math.hypot(...horizon) < 1e-10;
  const reference: MarkingVector = Math.abs(normal[1]) < 0.9
    ? [0, 1, 0]
    : [1, 0, 0];
  const a = unit(faceOn ? cross(normal, reference) : horizon);
  // b points toward the viewer within the source plane: 0 < theta < pi is front.
  const b = cross(a, normal);
  const arc = (start: number, sweep: number) =>
    Array.from({ length: 65 }, (_, i) => {
      const angle = start + (i / 64) * sweep;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const p = project([
        a[0] * cosine + b[0] * sine,
        a[1] * cosine + b[1] * sine,
        a[2] * cosine + b[2] * sine,
      ]);
      return `${i === 0 ? "M" : "L"}${p.x.toFixed(3)},${p.y.toFixed(3)}`;
    }).join(" ");
  return faceOn
    ? { front: arc(0, 2 * Math.PI), back: "" }
    : { front: arc(0, Math.PI), back: arc(Math.PI, Math.PI) };
}

function diagram(division: Division) {
  return {
    circles: uniqueMarkingCircles(
      jiwariNormals(division).map((normal, i) => ({ id: `circle-${i}`, normal })),
    ).map(({ normal }) => circlePaths(normal)),
    // Principal centers only; dots do not stand for every intersection or pin.
    centers: polePositions(division).map(project),
  };
}

const diagrams = {
  none: { circles: [], centers: [] },
  simple: diagram("simple"),
  c8: diagram("c8"),
  c10: diagram("c10"),
};

/** Decorative geometry preview; the surrounding control supplies its visible name. */
export function MarkingDiagram({
  division,
  className,
}: {
  division: DiagramDivision;
  className?: string;
}) {
  const geometry = diagrams[division];
  return (
    <svg
      viewBox="0 0 80 80"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <g strokeWidth="1" opacity="0.22" strokeDasharray="2 2">
        {geometry.circles.map((circle, i) => (
          <path key={i} d={circle.back} />
        ))}
      </g>
      <g strokeWidth="1.1" opacity="0.45">
        {geometry.centers.map((center, i) => center.front ? null : (
          <circle key={i} cx={center.x} cy={center.y} r="2" />
        ))}
      </g>
      <g strokeWidth="1.15" strokeLinecap="round" opacity="0.86">
        {geometry.circles.map((circle, i) => (
          <path key={i} d={circle.front} />
        ))}
      </g>
      <circle cx="40" cy="40" r={radius} strokeWidth="1.5" />
      <g fill="currentColor" stroke="none">
        {geometry.centers.map((center, i) => center.front ? (
          <circle key={i} cx={center.x} cy={center.y} r="2.5" />
        ) : null)}
      </g>
    </svg>
  );
}
