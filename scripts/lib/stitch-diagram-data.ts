import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import type { LowerKagariFixture } from '../../src/components/temari/lower-kagari.ts';
import type { C8ThreadCoupon } from '../../src/components/temari/thread-path.ts';

export type DiagramSnapshot = {
  version: 1;
  kind: 'computed-isolated-lower-kagari';
  source: { revision: string; digest: string; files: { path: string; sha256: string }[] };
  status: 'accepted';
  fixture: Pick<LowerKagariFixture, 'dimensions' | 'frame' | 'incomingStart' | 'entry' | 'exit' | 'next'>;
  coupon: C8ThreadCoupon;
  acceptance: {
    seed: string;
    candidate: string;
    resolutions: {
      controls: number; resolved: boolean; solve: string; path: string;
      curvature: string; curvatureUpper: number; restarts: number; settleMoveMm: number;
    }[];
    refinements: { from: number; to: number; lengthDifferenceMm: number; shapeDifferenceMm: number }[];
    metrics: {
      numericalClearanceMm: number; seedLengthMm: number; minBendRadiusMm: number;
      minimumSpans: number; lengthDifferenceMm: number; maxShapeDifferenceMm: number;
      lengthToleranceMm: number; shapeToleranceMm: number;
    };
    outgoingLengthMm: number;
    diagnostics: string[];
  };
};

const hash = (text: string) => createHash('sha256').update(text).digest('hex');

/** Fingerprint the actual model dependency closure, not a hand-maintained list. */
export function modelSource(root: string, entry = 'src/components/temari/computed-lower-kagari.ts', ...additionalEntries: string[]) {
  const seen = new Set<string>();
  const walk = (path: string) => {
    if (seen.has(path)) return;
    seen.add(path);
    const text = readFileSync(path, 'utf8');
    for (const match of text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const raw = resolve(dirname(path), match[1]);
      const bare = raw.replace(/\.(ts|tsx)$/, '');
      const target = [`${bare}.ts`, `${bare}.tsx`, join(bare, 'index.ts')].find(existsSync);
      if (!target) throw new Error(`Missing model dependency ${match[1]} in ${path}`);
      walk(target);
    }

  };
  for (const source of [entry, ...additionalEntries]) walk(join(root, source));
  const files = [...seen].map((path) => ({
    path: relative(root, path).replaceAll('\\', '/'),
    sha256: hash(readFileSync(path, 'utf8')),
  })).sort((a, b) => a.path.localeCompare(b.path));
  return { files, digest: hash(JSON.stringify(files)) };
}

/** Type-only imports cannot affect numerical paths; retain all runtime imports. */
export function runtimeModelSource(root: string, entry: string, ...additionalEntries: string[]) {
  const seen = new Set<string>();
  const walk = (path: string) => {
    if (seen.has(path)) return;
    seen.add(path);
    const text = readFileSync(path, 'utf8');
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const follow = (name: string) => {
      if (!name.startsWith('.')) return;
      const raw = resolve(dirname(path), name).replace(/\.(ts|tsx)$/, '');
      const target = [`${raw}.ts`, `${raw}.tsx`, join(raw, 'index.ts')].find(existsSync);
      if (!target) throw new Error(`Missing runtime model dependency ${name} in ${path}`);
      walk(target);
    };
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        const bindings = clause?.namedBindings;
        const onlyTypes = clause?.isTypeOnly || (!clause?.name && bindings
          && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every(e => e.isTypeOnly));
        if (!onlyTypes && ts.isStringLiteral(node.moduleSpecifier)) follow(node.moduleSpecifier.text);
      } else if (ts.isExportDeclaration(node)) {
        const clause = node.exportClause;
        const onlyTypes = node.isTypeOnly || (clause && ts.isNamedExports(clause)
          && clause.elements.length > 0 && clause.elements.every(e => e.isTypeOnly));
        if (!onlyTypes && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) follow(node.moduleSpecifier.text);
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const argument = node.arguments[0];
        if (!argument || !ts.isStringLiteral(argument)) throw new Error(`Nonliteral model import in ${path}`);
        follow(argument.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  };
  for (const source of [entry, ...additionalEntries]) walk(join(root, source));
  const files = [...seen].map(path => ({
    path: relative(root, path).replaceAll('\\', '/'), sha256: hash(readFileSync(path, 'utf8')),
  })).sort((a, b) => a.path.localeCompare(b.path));
  return { files, digest: hash(JSON.stringify(files)) };
}

export function matchesRuntimeModelSource(
  recorded: { digest: string; files: { path: string; sha256: string }[] },
  root: string,
  entry: string,
  ...additionalEntries: string[]
): boolean {
  if (recorded.digest !== hash(JSON.stringify(recorded.files))) return false;
  const hashes = new Map(recorded.files.map(file => [file.path, file.sha256]));
  if (hashes.size !== recorded.files.length) return false;
  return runtimeModelSource(root, entry, ...additionalEntries).files.every(file => hashes.get(file.path) === file.sha256);
}

/** Refuse a stale or diagnostic solve before generating any current illustration. */
export function assertDiagramSnapshot(snapshot: DiagramSnapshot, root?: string) {
  if (snapshot.version !== 1 || snapshot.kind !== 'computed-isolated-lower-kagari'
    || snapshot.status !== 'accepted' || snapshot.acceptance.diagnostics.length) {
    throw new Error('Stitch illustrations require an accepted, non-diagnostic control snapshot.');
  }
  const a = snapshot.acceptance;
  if (Object.values(a.metrics).some(n => !Number.isFinite(n) || n < 0)
    || !(snapshot.coupon.bodyRadiusMm > 0) || !(snapshot.coupon.threadRadiusMm > 0)
    || !Number.isFinite(a.outgoingLengthMm) || a.outgoingLengthMm <= 0
    || a.metrics.minimumSpans !== Math.ceil(a.metrics.seedLengthMm/a.metrics.minBendRadiusMm)
    || a.metrics.lengthToleranceMm <= 0 || a.metrics.shapeToleranceMm <= 0) {
    throw new Error('Invalid numerical evidence in the control snapshot.');
  }
  if (a.seed !== 'passed' || a.candidate !== 'passed' || a.resolutions.length !== 3
    || a.refinements.length !== 2 || a.metrics.lengthDifferenceMm > a.metrics.lengthToleranceMm
    || a.metrics.maxShapeDifferenceMm > a.metrics.shapeToleranceMm) {
    throw new Error('Control snapshot failed full-path or refinement acceptance.');
  }
  const expected = [1, 1.5, 2].map(f => Math.ceil(a.metrics.minimumSpans * f) + 3);
  a.resolutions.forEach((r, i) => {
    if (r.controls !== expected[i] || !r.resolved || r.solve !== 'converged' || r.path !== 'passed'
      || r.curvature !== 'certified' || !Number.isFinite(r.curvatureUpper) || r.curvatureUpper >= 1
      || r.restarts < 1 || !Number.isFinite(r.settleMoveMm) || r.settleMoveMm > .0001) {
      throw new Error(`Control snapshot resolution ${r.controls} is not accepted.`);
    }
  });
  if (root && modelSource(root).digest !== snapshot.source.digest) {
    throw new Error('Model sources changed. Recompute the canonical snapshot before updating illustrations.');
  }
}
