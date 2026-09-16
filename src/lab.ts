import { polePositions } from "./components/temari/division";
import { jiwariNormals } from "./components/temari/jiwari";
import {
  C8_ENGINEERING_FIXTURE,
  createC8EngineeringCoupon,
} from "./components/temari/c8-engineering-coupon";
import {
  uniqueMarkingCircles,
  type MarkingVector,
} from "./components/temari/local-marking";
import "./lab.css";

// An orthographic diagram of the geometric intent. Line width is graphical only.
const dot = (a: MarkingVector, b: MarkingVector) =>
  a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a: MarkingVector, b: MarkingVector): MarkingVector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (v: MarkingVector): MarkingVector =>
  v.map((x) => x / Math.hypot(...v)) as unknown as MarkingVector;
const centers = polePositions("c8");
const circles = uniqueMarkingCircles(
  jiwariNormals("c8").map((normal, i) => ({ id: `circle-${i}`, normal })),
);
const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const centerSelect = document.getElementById("center") as HTMLSelectElement;
centers.forEach((center, i) =>
  centerSelect.add(
    new Option(`Центр ${i + 1} · (${center.join(", ")})`, String(i)),
  ),
);
const svg = document.getElementById("sphere")!;
const ns = "http://www.w3.org/2000/svg";

function render() {
  const center = centers[Number(centerSelect.value)];
  const firstCircle = circles.find(
    (circle) => Math.abs(dot(circle.normal, center)) < 1e-10,
  )!;
  const first = unit(cross(firstCircle.normal, center));
  const frameY = cross(center, first);
  const circumferenceMm = Number(input("circumference").value);
  const coupon = createC8EngineeringCoupon({
    center,
    circles,
    firstRay: { circleId: firstCircle.id, tangent: first },
    handedness: input("reverse").checked ? -1 : 1,
    ...C8_ENGINEERING_FIXTURE,
    circumferenceMm,
  });
  const radius = circumferenceMm / (2 * Math.PI);
  const step = Number(input("step").value);
  const turn = (Number(input("turn").value) * Math.PI) / 180;
  const tilt = (Number(input("tilt").value) * Math.PI) / 180;
  const project = (p: MarkingVector) => {
    const x = dot(p, first),
      y = dot(p, frameY),
      z = dot(p, center);
    const xx = x * Math.cos(turn) + z * Math.sin(turn);
    const zz = z * Math.cos(turn) - x * Math.sin(turn);
    const yy = y * Math.cos(tilt) - zz * Math.sin(tilt);
    return {
      x: 300 + 256 * xx,
      y: 300 - 256 * yy,
      z: y * Math.sin(tilt) + zz * Math.cos(tilt),
    };
  };
  svg.innerHTML =
    '<defs><radialGradient id="body" cx="34%" cy="27%" r="76%"><stop stop-color="#fcf9f2"/><stop offset=".75" stop-color="#e0d8ca"/><stop offset="1" stop-color="#c5baa8"/></radialGradient></defs><circle cx="300" cy="300" r="256" fill="url(#body)" stroke="#bcb09e" stroke-width=".7"/>';
  const element = (
    tag: string,
    attrs: Record<string, string | number>,
    text?: string,
  ) => {
    const el = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    if (text) el.textContent = text;
    svg.appendChild(el);
    return el;
  };
  const path = (points: MarkingVector[], color: string, width: number) => {
    let d = "",
      visible = false;
    for (const point of points) {
      const p = project(point);
      if (p.z < 0) {
        visible = false;
        continue;
      }
      d += `${visible ? "L" : "M"}${p.x.toFixed(3)},${p.y.toFixed(3)} `;
      visible = true;
    }
    element("path", {
      d,
      fill: "none",
      stroke: color,
      "stroke-width": width,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
  };
  for (const circle of circles) {
    const axis: MarkingVector =
      Math.abs(circle.normal[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
    const a = unit(cross(circle.normal, axis)),
      b = cross(circle.normal, a);
    path(
      Array.from({ length: 361 }, (_, i) => {
        const angle = (i * Math.PI) / 180;
        return a.map(
          (v, k) => v * Math.cos(angle) + b[k] * Math.sin(angle),
        ) as unknown as MarkingVector;
      }),
      "#b2a388",
      1,
    );
  }
  // Highlight the actual first ray only, not its whole great circle.
  path(
    Array.from({ length: 65 }, (_, i) => {
      const angle = (i / 64) * 0.82;
      return center.map(
        (v, k) => v * Math.cos(angle) + first[k] * Math.sin(angle),
      ) as unknown as MarkingVector;
    }),
    "#65513a",
    1.6,
  );
  const marks = coupon.marks.map(
    (mark) =>
      mark.positionMm.map((v) => v / radius) as unknown as MarkingVector,
  );
  coupon.legs.slice(0, step).forEach((leg) => {
    const a = marks[leg.order],
      b = marks[(leg.order + 1) % marks.length];
    const angle = Math.atan2(Math.hypot(...cross(a, b)), dot(a, b));
    path(
      Array.from({ length: 65 }, (_, i) => {
        const t = i / 64;
        return a.map(
          (v, k) =>
            (v * Math.sin((1 - t) * angle) + b[k] * Math.sin(t * angle)) /
            Math.sin(angle),
        ) as unknown as MarkingVector;
      }),
      "#963e44",
      2.6,
    );
  });
  const c = project(center);
  if (c.z > 0) element("circle", { cx: c.x, cy: c.y, r: 3, fill: "#3b3932" });
  marks.forEach((mark, i) => {
    const p = project(mark);
    if (p.z <= 0) return;
    element("circle", {
      cx: p.x,
      cy: p.y,
      r: 5,
      fill: coupon.marks[i].role === "inner" ? "#84623f" : "#963e44",
      stroke: "#fff9ef",
      "stroke-width": 1.5,
    });
    const dx = p.x - c.x,
      dy = p.y - c.y,
      length = Math.hypot(dx, dy) || 1;
    element(
      "text",
      {
        x: p.x + (dx / length) * 17,
        y: p.y + (dy / length) * 17 + 4,
        fill: "#392e26",
        "font-size": 15,
        "font-family": "system-ui",
        "text-anchor": "middle",
        stroke: "#f5efe3",
        "stroke-width": 3,
        "paint-order": "stroke",
      },
      String(i + 1),
    );
  });
  document.getElementById("circumference-value")!.textContent =
    `${circumferenceMm / 10} см`;
  document.getElementById("step-value")!.textContent = `${step} / 8`;
  document.getElementById("progress")!.textContent =
    step === 0
      ? "Только разметка и восемь меток"
      : `Обход: ${Array.from({ length: step + 1 }, (_, i) => (i % 8) + 1).join(" → ")}`;
  svg.setAttribute("data-center", centerSelect.value);
  svg.setAttribute("data-step", String(step));
}
document
  .querySelectorAll("input,select")
  .forEach((el) => el.addEventListener("input", render));
document.getElementById("next")!.addEventListener("click", () => {
  input("step").value = String((Number(input("step").value) + 1) % 9);
  render();
});
document.getElementById("front")!.addEventListener("click", () => {
  input("turn").value = "0";
  input("tilt").value = "0";
  render();
});
document.getElementById("side")!.addEventListener("click", () => {
  input("turn").value = "65";
  input("tilt").value = "15";
  render();
});
render();
