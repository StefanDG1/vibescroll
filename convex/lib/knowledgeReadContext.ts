import type { QueryCtx } from "../_generated/server";

const snapshots = new WeakMap<QueryCtx, Map<string, Promise<unknown>>>();

/** Memoize additional reads only in an explicitly immutable query context. */
export function queryRead<T>(
  ctx: QueryCtx,
  key: string,
  read: () => Promise<T>,
): Promise<T> {
  const snapshot = snapshots.get(ctx);
  if (!snapshot) return read();
  let pending = snapshot.get(key);
  if (!pending) {
    pending = read();
    snapshot.set(key, pending);
  }
  return pending as Promise<T>;
}

/** Reuse document reads only within one immutable query snapshot. */
export function knowledgeReadContext(ctx: QueryCtx): QueryCtx {
  const reads = new Map<string, Promise<unknown>>();
  const db = new Proxy(ctx.db, {
    get(target, property) {
      if (property === "get")
        return (...args: unknown[]) => {
          const key = JSON.stringify(args);
          let read = reads.get(key);
          if (!read) {
            read = Reflect.apply(target.get, target, args);
            reads.set(key, read!);
          }
          return read;
        };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const snapshot = { ...ctx, db };
  snapshots.set(snapshot, reads);
  return snapshot;
}
