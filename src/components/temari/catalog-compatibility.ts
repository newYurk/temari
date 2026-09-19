import { DIVISION_CATALOG, MOTIF_CATALOG, type MotifEntry } from "./library.ts";
import { runtimeDivisionFor, type DivisionId } from "./division-config.ts";
import { motifSupport, type MotifId } from "./patterns.ts";

/** One projection supplies BOTH outgoing claims and reverse division lists. */
export function declaredDivisions(motif: MotifEntry): readonly DivisionId[] {
  return motif.compatibility.state === "unknown" ? [] : motif.compatibility.divisionIds;
}

export function confirmedDivisions(motif: MotifEntry): readonly DivisionId[] {
  return motif.compatibility.state === "documented" ? motif.compatibility.divisionIds : [];
}

export function motifsForDivision(
  divisionId: DivisionId, motifs: readonly MotifEntry[] = MOTIF_CATALOG,
): MotifEntry[] {
  return motifs.filter((m) => declaredDivisions(m).includes(divisionId));
}

export function craftCompatibility(motif: MotifEntry, divisionId: DivisionId) {
  return declaredDivisions(motif).includes(divisionId) ? motif.compatibility.state : "unknown";
}

export type CatalogImplementation = { implemented: boolean; reason: string };

/** A family's fallback can never count as implementation of another variant. */
export function catalogImplementation(motif: MotifEntry, divisionId: DivisionId): CatalogImplementation {
  if (!motif.recipe) return { implemented: false, reason: "у этой строки нет своего рецепта" };
  if (motif.recipe.id !== motif.id || motif.recipe.divisionId !== divisionId) {
    return { implemented: false, reason: "рецепт относится к другой строке или точной разметке" };
  }
  const runtime = runtimeDivisionFor(divisionId);
  if (!runtime || motif.recipe.requires !== runtime) {
    return { implemented: false, reason: "для этой точной разметки нет подходящего адаптера" };
  }
  if (!["kiku", "hoshi", "hishi", "obi"].includes(motif.family)) {
    return { implemented: false, reason: "семья вне компилятора узоров" };
  }
  const support = motifSupport(runtime, motif.family as MotifId);
  if (!support.supported || support.kind !== "recipe" || support.recipe !== motif.recipe) {
    return { implemented: false, reason: "мастерская не исполняет рецепт этой строки" };
  }
  return { implemented: true, reason: "точный рецепт подключён; это не приёмка полного узора" };
}

/** Fail generation before writing a misleading vault, even if its files match. */
export function validateCatalogCompatibility(motifs: readonly MotifEntry[] = MOTIF_CATALOG): void {
  const ids = new Set(DIVISION_CATALOG.map((d) => d.id));
  const motifIds = new Set<string>();
  for (const m of motifs) {
    if (motifIds.has(m.id)) throw new Error(`duplicate motif: ${m.id}`);
    motifIds.add(m.id);
    const declared = declaredDivisions(m);
    if (m.compatibility.state !== "unknown" && declared.length === 0) {
      throw new Error(`${m.id}: exact division claim is empty`);
    }
    if (new Set(declared).size !== declared.length || declared.some((id) => !ids.has(id))) {
      throw new Error(`${m.id}: invalid or duplicate division claim`);
    }
    if (m.compatibility.state === "documented"
      && (!m.compatibility.sourceUrls.length || m.compatibility.sourceUrls.some((url) => !/^https?:\/\//.test(url)))) {
      throw new Error(`${m.id}: documented compatibility requires source URLs`);
    }
    if (!m.recipe) continue;
    if (m.recipe.id !== m.id || !confirmedDivisions(m).includes(m.recipe.divisionId)) {
      throw new Error(`${m.id}: recipe must match an evidence-backed exact division`);
    }
    const implementation = catalogImplementation(m, m.recipe.divisionId);
    if (!implementation.implemented) throw new Error(`${m.id}: ${implementation.reason}`);
  }
}
