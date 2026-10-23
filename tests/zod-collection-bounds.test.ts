import { expect, it, vi } from "vitest";
import { z } from "zod";

it.each(["array", "set", "map"] as const)(
  "rejects an oversized %s before validating attacker-controlled elements",
  (kind) => {
    const inspect = vi.fn(() => true);
    const element = z.unknown().refine(inspect);
    const schema =
      kind === "array"
        ? z.array(element).max(2)
        : kind === "set"
          ? z.set(element).max(2)
          : z.map(z.string(), element).max(2);
    const values = Array.from({ length: 10000 }, (_, index) => index);
    const input =
      kind === "array"
        ? values
        : kind === "set"
          ? new Set(values)
          : new Map(values.map((value) => [String(value), value]));

    const result = schema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0]?.code).toBe("too_big");
    }
    expect(inspect).not.toHaveBeenCalled();
  },
);

it("still validates bounded collections normally", () => {
  expect(z.array(z.string()).max(2).safeParse([1]).success).toBe(false);
  expect(
    z
      .set(z.number())
      .max(2)
      .parse(new Set([1, 2])),
  ).toEqual(new Set([1, 2]));
  expect(
    z
      .map(z.string(), z.number())
      .max(2)
      .parse(new Map([["a", 1]])),
  ).toEqual(new Map([["a", 1]]));
});
