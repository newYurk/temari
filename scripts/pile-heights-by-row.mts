// Max axis height (mm above the mari) per row, upper (inner) tips vs lower (outer) tips,
// full S8 kiku, pole 0, 10 rows, both sets, pile render. Copy into scripts/ and run:
//   node --import tsx scripts/pile-heights-by-row.mts
import { compileKiku, stitchesFromOps } from '../src/components/temari/patterns.ts';
import { pileParts } from '../src/components/temari/stitches.ts';
const R = 38.197186;
const st = stitchesFromOps(compileKiku('simple', 'out', 'even', 0, 0, 10, 'all'));
const t0 = performance.now();
const parts = pileParts(st, 'pearl5');
const ms = performance.now() - t0;
const rows = new Map<number, { upper: number; lower: number }>();
for (const p of parts) {
  const m = (p.at.operation?.operationId ?? '').match(/\/s(\d)\/r(\d+)\//); if (!m) continue;
  const e = rows.get(+m[2]) ?? { upper: 0, lower: 0 };
  for (const q of p.pts) {
    const h = (q.length() - 1) * R;
    const polar = Math.acos(Math.min(1, q.y / q.length())) * R;
    if (polar < 20) e.upper = Math.max(e.upper, h); else e.lower = Math.max(e.lower, h);
  }
  rows.set(+m[2], e);
}
const out = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([r, e]) => ({ row: r + 1, upperMm: +e.upper.toFixed(2), lowerMm: +e.lower.toFixed(2) }));
console.log(JSON.stringify({ firstBuildMs: Math.round(ms), rows: out }));
