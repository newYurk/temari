import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { matchesRuntimeModelSource, modelSource, runtimeModelSource } from "../../../scripts/lib/stitch-diagram-data.ts";

describe("numerical snapshot runtime provenance", () => {
  it("ignores type-only dependencies without rewriting historical evidence", () => {
    const root = mkdtempSync(join(tmpdir(), "temari-model-source-"));
    try {
      writeFileSync(join(root, "entry.ts"), 'import type { Shape } from "./types";\nimport { value } from "./runtime";\nexport const result: Shape = value;');
      writeFileSync(join(root, "types.ts"), "export type Shape = number;");
      writeFileSync(join(root, "runtime.ts"), "export const value = 1;");
      const recorded = modelSource(root, "entry.ts");
      assert.equal(recorded.files.length, 3);
      assert.deepEqual(runtimeModelSource(root, "entry.ts").files.map(f => f.path), ["entry.ts", "runtime.ts"]);
      const frozen = JSON.stringify(recorded);
      writeFileSync(join(root, "types.ts"), "export type Shape = number | string;");
      assert.notEqual(modelSource(root, "entry.ts").digest, recorded.digest);
      assert.equal(matchesRuntimeModelSource(recorded, root, "entry.ts"), true);
      assert.equal(JSON.stringify(recorded), frozen);
      writeFileSync(join(root, "runtime.ts"), "export const value = 2;");
      assert.equal(matchesRuntimeModelSource(recorded, root, "entry.ts"), false);
      assert.equal(matchesRuntimeModelSource({ ...recorded, digest: "stale" }, root, "entry.ts"), false);
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  it("tracks mixed, re-exported, side-effect and dynamic runtime dependencies", () => {
    const root = mkdtempSync(join(tmpdir(), "temari-model-source-"));
    try {
      writeFileSync(join(root, "entry.ts"), [
        'import { type A } from "./type-only";',
        'import { type B, value } from "./mixed";',
        'export type { C } from "./export-type";',
        'export { type D } from "./export-type";',
        'export { value } from "./export-value";',
        'import "./effect";',
        'export const load = () => import("./dynamic");',
      ].join("\n"));
      for (const name of ["type-only", "mixed", "export-type", "export-value", "effect", "dynamic"]) {
        writeFileSync(join(root, `${name}.ts`), "export const value = 1;");
      }
      assert.deepEqual(runtimeModelSource(root, "entry.ts").files.map(f => f.path),
        ["dynamic.ts", "effect.ts", "entry.ts", "export-value.ts", "mixed.ts"]);
      const recorded = runtimeModelSource(root, "entry.ts");
      writeFileSync(join(root, "dynamic.ts"), "export const value = 2;");
      assert.equal(matchesRuntimeModelSource(recorded, root, "entry.ts"), false);
      writeFileSync(join(root, "entry.ts"), 'export const load = (path: string) => import(path);');
      assert.throws(() => runtimeModelSource(root, "entry.ts"), /Nonliteral model import/);
    } finally {
      rmSync(root, { recursive: true });
    }
  });
});
