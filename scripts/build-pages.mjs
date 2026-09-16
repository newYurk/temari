import { build } from "vite";
import { copyFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

// The artifact is built from source; old checked-in bundles are never copied.
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
