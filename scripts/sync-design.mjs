import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// These legacy mirrors are already tracked. Pages builds from public/;
// keep the mirrors synchronized until retired, without rebuilding the game.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
if (!["--check", "--write"].includes(mode) || process.argv.length !== 3) {
  throw new Error("Usage: node scripts/sync-design.mjs --check|--write");
}

const groups = [
  { source: "public/design.html", targets: ["design.html", "docs/design.html", "dist-pages/design.html"] },
  { source: "public/design/index.html", targets: ["design/index.html", "docs/design/index.html"] },
];
let stale = false;
for (const { source, targets } of groups) {
  const expected = await readFile(resolve(root, source), "utf8");
  for (const target of targets) {
    let current;
    try {
      current = await readFile(resolve(root, target), "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (current === expected) continue;
    if (mode === "--check") {
      console.error(`${target} differs from ${source}`);
      stale = true;
    } else {
      await mkdir(dirname(resolve(root, target)), { recursive: true });
      await writeFile(resolve(root, target), expected);
      console.log(`Updated ${target}`);
    }
  }
}
if (stale) {
  console.error("Run node scripts/sync-design.mjs --write and commit the mirrors with the source.");
  process.exitCode = 1;
} else {
  console.log("Design documentation is synchronized.");
}
