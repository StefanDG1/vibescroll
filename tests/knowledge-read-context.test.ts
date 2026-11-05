import { expect, it, vi } from "vitest";
import type { QueryCtx } from "../convex/_generated/server";
import { knowledgeReadContext } from "../convex/lib/knowledgeReadContext";

it("keeps repeated large snapshot reads within the query budget and starts fresh next request", async () => {
  let bytes = 0;
  let current: { context: string } | null = { context: "x".repeat(800000) };
  const get = vi.fn(async () => {
    bytes += current ? current.context.length : 1;
    if (bytes > 16 * 1024 * 1024) throw Error("Too many bytes read");
    return current;
  });
  const reader = {
    get,
    query() {
      return this === reader;
    },
  };
  const base = { db: reader } as unknown as QueryCtx;
  const first = knowledgeReadContext(base);
  expect(knowledgeReadContext(first)).toBe(first);
  const id = "repository" as Parameters<QueryCtx["db"]["get"]>[0];
  const rows = await Promise.all(
    Array.from({ length: 30 }, () => first.db.get(id)),
  );
  expect(rows).toHaveLength(30);
  expect(rows.every((r) => r === current)).toBe(true);
  expect(bytes).toBe(800000);
  expect(get).toHaveBeenCalledTimes(1);
  expect(Reflect.apply(first.db.query, first.db, [])).toBe(true);
  current = null;
  const next = knowledgeReadContext(base);
  expect(await next.db.get(id)).toBeNull();
  expect(await next.db.get(id)).toBeNull();
  expect(get).toHaveBeenCalledTimes(2);
  expect(await first.db.get(id)).toEqual(rows[0]);
});

it("does not share workspace documents between concurrent query contexts", async () => {
  const id = "shared-id" as Parameters<QueryCtx["db"]["get"]>[0];
  const first = knowledgeReadContext({
    db: { get: async () => ({ organizationId: "one" }) },
  } as unknown as QueryCtx);
  const second = knowledgeReadContext({
    db: { get: async () => null },
  } as unknown as QueryCtx);
  expect(await first.db.get(id)).toEqual({ organizationId: "one" });
  expect(await second.db.get(id)).toBeNull();
});
