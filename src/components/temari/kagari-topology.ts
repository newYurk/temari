import type { KagariOp } from "./kagari";

/** Recipe-local identity; a new row or a colour change does not create a new thread. */
export type KagariTrace = {
  operationId: string;
  threadId: string;
  order: number;
  previousInThread: string | null;
  /** Compiler-declared bundle targets, not an inferred pairwise crossing table. */
  overOperations: string[];
};

export function traceKagariOperations(ops: readonly KagariOp[], recipeId: string): KagariTrace[] {
  if (!recipeId.trim()) throw new RangeError("Kagari trace requires a recipe identity.");
  const seen = new Map<number, { op: KagariOp; trace: KagariTrace }>();
  const ids = new Set<string>();
  const previous = new Map<string, string>();
  let lastOrder = -1;
  return ops.map(op => {
    if (![op.i, op.pole, op.kai, op.mark.line].every(n => Number.isInteger(n) && n >= 0)
      || (op.set !== 0 && op.set !== 1) || (op.mark.t !== "inner" && op.mark.t !== "outer")
      || op.i <= lastOrder) {
      throw new RangeError("Kagari operations require valid identities and strictly increasing execution order.");
    }
    const threadId = `${recipeId}/p${op.pole}/s${op.set}`;
    const operationId = `${threadId}/r${op.kai}/${op.mark.t}-${op.mark.line}`;
    if (ids.has(operationId)) throw new RangeError(`Repeated kagari operation: ${operationId}`);
    if (new Set(op.over).size !== op.over.length) throw new RangeError(`Repeated bundle target at ${operationId}`);
    const overOperations = op.over.map(index => {
      const target = seen.get(index);
      if (!target) throw new RangeError(`${operationId}: bundle target ${index} is absent or not yet laid.`);
      if (target.trace.threadId !== threadId || target.op.mark.line !== op.mark.line
        || target.op.mark.t !== "inner" || op.mark.t !== "inner" || target.op.kai >= op.kai) {
        throw new RangeError(`${operationId}: expected an earlier upper catch of the same working thread and mark.`);
      }
      return target.trace.operationId;
    });
    const trace: KagariTrace = {
      operationId, threadId, order: op.i,
      previousInThread: previous.get(threadId) ?? null, overOperations,
    };
    lastOrder = op.i;
    ids.add(operationId);
    previous.set(threadId, operationId);
    seen.set(op.i, { op, trace });
    return trace;
  });
}
