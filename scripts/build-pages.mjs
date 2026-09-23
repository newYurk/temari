import { build } from "vite";
import { copyFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

// The artifact is built from source; old checked-in bundles are never copied.
// A passport must not silently quote a stale model summary after geometry changes.
execFileSync(process.execPath, ["--import", "tsx", "scripts/build-passport-model.mts", "--check"], { stdio: "inherit" });
await build({ configFile: "vite.pages.config.ts" });
for (const file of ["favicon.svg", "og.jpg", "x-banner.jpg"]) {
  await copyFile(file, `dist/${file}`);
}
await copyFile("dist/index.html", "dist/pages.html");
const revision =
  process.env.GITHUB_SHA ??
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const sourceModified =
  execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()
    .length > 0;
await writeFile(
  "dist/build.json",
  JSON.stringify({ revision, sourceModified }) + "\n",
);
