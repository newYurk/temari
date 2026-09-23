// Glue the page template and the model data into one self-contained HTML file.
//   node tools/build-page.mjs            (from prototypes/temari-day or the scratchpad copy)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const meta = readFileSync(join(here, 'data/rows.json'), 'utf8');
const b64 = readFileSync(join(here, 'data/kiku-s8.b64'), 'utf8');
const page = readFileSync(join(here, 'src/page.html'), 'utf8').replace('__META__', () => meta).replace('__B64__', () => b64);
mkdirSync(join(here, 'out'), { recursive: true });
writeFileSync(join(here, 'out/temari-day.html'), page);
console.log(`out/temari-day.html ${(page.length / 1024).toFixed(0)} KB`);
