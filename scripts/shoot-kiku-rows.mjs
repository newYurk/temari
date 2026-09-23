/**
 * Kiku frames in row colours — the owner's standard way to look at stitching
 * (AGENTS.project.md, «Кадры для владелицы»). Every row gets its own colour
 * (1 gold, 2 blue, 3 green, 4 magenta, 5 orange, 6 teal, 7 violet, 8 lime,
 * 9 red, 10 grey), set B the same colour darker, with a legend in the frame.
 * Material colour only: the geometry is what the workshop draws.
 *
 * Needs your own dev server (never the owner's 8860/8861):
 *   npx vite --config vite.pages.config.ts --port 8874 --strictPort --host 127.0.0.1
 *   node scripts/shoot-kiku-rows.mjs --base=http://127.0.0.1:8874/ --rows=all --out=screenshots/rows
 *   ... --rows=4 --set=A   one set, four rows;   --pile=0   the old render path
 *
 * Headless Chrome (channel "chrome"); no window opens on the owner's screen.
 * Views: whole flower from above, the pole close, 45° and near-equator side
 * views, and one upper point from above and at 40°.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const base = arg('base', 'http://127.0.0.1:8874/');
const rowsArg = arg('rows', 'all');
const rows = rowsArg === 'all' ? 'all' : Number(rowsArg);
const set = arg('set', 'AB');
const pile = arg('pile', '');
const out = arg('out', 'screenshots/kiku-rows');
mkdirSync(out, { recursive: true });

const url = `${base}${base.includes('?') ? '&' : '?'}kiku=1${pile ? `&pile=${pile}` : ''}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// The first load compiles the whole app on the dev server: give it time.
await page.goto(url, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__temari?.kagari && window.__temari.kagari().n > 0, null, { timeout: 60000 });
await page.waitForTimeout(600);

// Sew through the app's own store, then stop the animation where it is.
const info = await page.evaluate(async ({ rows, set }) => {
  const { useTemari: U } = await import('/src/components/temari/store.ts');
  const t = window.__temari;
  if (U.getState().motif !== 'kiku') { U.getState().showExample(); await new Promise((r) => setTimeout(r, 2500)); }
  const freeze = () => t.freezeKagari(U.getState().kagariPlan.length);
  freeze();
  if (set === 'A') {
    U.setState({ kagariSet: 0, kikuLayers: rows === 'all' ? 10 : rows });
    U.getState().startKagari();
  } else {
    U.getState().setMotif('kiku');
    freeze();
    if (rows === 'all') U.getState().sewKikuRows('all');
    else if (rows > 1) U.getState().sewKikuRows(rows - 1);
  }
  freeze();
  U.setState({ pins: [] });
  const s = U.getState();
  const all = [...s.kagariKept, ...s.kagariPlan.slice(0, s.kagariLaid)].filter((x) => x.kind === 'arc');
  const upper = all.find((x) => /\/s0\/r0\/inner-\d$/.test(x.operation?.operationId ?? ''));
  return { stitches: all.length, layers: s.kikuLayers, upper: upper ? upper.b : null };
}, { rows, set });
await page.waitForTimeout(2500);

// Recolour every tube by its row; add the legend.
const legend = await page.evaluate(async () => {
  const { useTemari: U } = await import('/src/components/temari/store.ts');
  const { arcPath } = await import('/src/components/temari/stitches.ts');
  const r3f = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('@react-three_fiber'));
  const { _roots } = await import(r3f);
  const scene = _roots.get(document.querySelector('canvas')).store.getState().scene;
  const s = U.getState();
  const all = [...s.kagariKept, ...s.kagariPlan.slice(0, s.kagariLaid)].filter((x) => x.kind === 'arc');
  const paths = all.map((st) => ({ op: st.operation?.operationId ?? '', pts: arcPath(st, 'pearl5') }));
  const hue = [0xe8b020, 0x2f7fe0, 0x2fb050, 0xd03fb0, 0xff6a00, 0x00c0c0, 0x8050ff, 0x80ff40, 0xff3050, 0x606060];
  const rows = new Set();
  scene.traverse((o) => {
    const c = o.isMesh && o.geometry?.userData?.centerline;
    if (!c?.length) return;
    const mid = c[Math.floor(c.length / 2)];
    let best = null;
    for (const p of paths) for (const q of p.pts) { const d = q.distanceTo(mid); if (!best || d < best.d) best = { d, op: p.op }; }
    const m = best?.op.match(/\/s(\d)\/r(\d+)\//);
    if (!m) return;
    const row = +m[2];
    rows.add(row);
    o.material = o.material.clone();
    o.material.map = null;
    o.material.color.setHex(hue[row % hue.length]);
    if (+m[1] === 1) o.material.color.multiplyScalar(0.55);
    o.material.needsUpdate = true;
  });
  const hex = (h) => `#${h.toString(16).padStart(6, '0')}`;
  const box = document.createElement('div');
  box.id = 'rows-legend';
  box.style.cssText = 'position:fixed;left:16px;top:16px;z-index:99;background:rgba(20,12,10,.85);color:#eee;font:16px/1.5 system-ui;padding:10px 14px;border-radius:8px';
  box.innerHTML = '<b>Ряды</b> · светлее — набор A, темнее — B<br>' + [...rows].sort((a, b) => a - b)
    .map((r) => `<span style="display:inline-block;width:14px;height:14px;background:${hex(hue[r % 10])};margin-right:6px;vertical-align:-2px"></span>ряд ${r + 1}`).join('<br>');
  document.body.appendChild(box);
  const style = document.createElement('style');
  style.textContent = 'html.rows-only body * { visibility: hidden !important; } html.rows-only canvas, html.rows-only #rows-legend, html.rows-only #rows-legend * { visibility: visible !important; }';
  document.head.appendChild(style);
  return [...rows].sort((a, b) => a - b);
});

// Camera: turn the ball so `tip` faces the default eye, then stand `d` units
// off it, tilted `phi` toward the equator.
async function view(tip, d, phi = 0) {
  await page.evaluate(async ({ tip, d, phi }) => {
    const r3f = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('@react-three_fiber'));
    const { _roots } = await import(r3f);
    const st = _roots.get(document.querySelector('canvas')).store.getState();
    const { camera: cam, controls } = st;
    const V = cam.position.constructor;
    const Q = cam.quaternion.constructor;
    if (controls) controls.enabled = false;
    const C0 = new V(0, 0.08, 1).normalize();
    const T = new V(...tip).normalize();
    window.__temari.face(T.x, T.y, T.z);
    const q = new Q().setFromUnitVectors(T.clone(), C0.clone());
    const pole = new V(0, 1, 0).applyQuaternion(q);
    const up = pole.clone().sub(C0.clone().multiplyScalar(C0.dot(pole)));
    const toward = up.lengthSq() > 1e-8 ? up.normalize().negate() : new V(0, -1, 0);
    const dir = C0.clone().multiplyScalar(Math.cos(phi)).add(toward.clone().multiplyScalar(Math.sin(phi)));
    cam.position.copy(C0).add(dir.multiplyScalar(d));
    cam.up.copy(phi > 0.01 ? C0 : (up.lengthSq() > 1e-8 ? up : new V(0, 1, 0)));
    cam.near = 0.005;
    cam.updateProjectionMatrix();
    cam.lookAt(C0);
    document.documentElement.classList.add('rows-only');
    for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(() => r()));
  }, { tip, d, phi });
  await page.waitForTimeout(250);
}

const shots = [
  ['01-top-whole', [0, 1, 0], 2.3, 0],
  ['02-top-pole', [0, 1, 0], 1.6, 0],
  ['03-side-45', [0, 0.7071, 0.7071], 2.3, 0],
  ['04-side-equator', [0, 0.34, 0.94], 2.3, 0],
];
if (info.upper) {
  shots.push(['05-upper-point-top', info.upper, 0.3, 0]);
  shots.push(['06-upper-point-40deg', info.upper, 0.3, 0.7]);
}
const files = [];
for (const [name, tip, d, phi] of shots) {
  await view(tip, d, phi);
  const file = `${out}/${name}.png`;
  await page.screenshot({ path: file });
  files.push(file);
}
console.log(JSON.stringify({ url, stitches: info.stitches, layers: info.layers, rows: legend.map((r) => r + 1), errors, files }, null, 1));
await browser.close();
