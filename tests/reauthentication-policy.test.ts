import { afterEach, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  highRiskAuthenticationActions,
  authenticationReturnTo,
  authenticationSignInPath,
  authenticationReviewRequired,
} from "../packages/policy/reauthentication";
import {
  redirectForAuthentication,
  SignInRedirect,
} from "../apps/starter/lib/authentication";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
it("reserves fresh sign-in for the exact high-risk mutation inventory", () => {
  const calls = readdirSync("convex")
    .filter((f) => f.endsWith(".ts"))
    .flatMap((file) =>
      [
        ...readFileSync("convex/" + file, "utf8").matchAll(
          /await recentAuthentication\(ctx,\s*"([a-z_]+)"\)/g,
        ),
      ].map((m) => [file, m[1]]),
    );
  expect(calls.sort()).toEqual(
    [
      ["accounts.ts", "delete_account"],
      ["cloudCatalog.ts", "promote_catalog_recommendation"],
      ["jobs.ts", "change_provider_credential"],
      ["organizations.ts", "delete_workspace"],
      ["publicKnowledge.ts", "publish_private_edition"],
      ["publicKnowledge.ts", "publish_public_collection"],
    ].sort(),
  );
  expect(calls.map((c) => c[1]).sort()).toEqual(
    [...highRiskAuthenticationActions].sort(),
  );
});
it("blocks stale account/workspace deletion before irreversible writes and permits a separately confirmed fresh session", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const subject = "high-risk-owner",
    email = "high-risk@example.test";
  const actor = await t.mutation(internal.accounts.syncUser, {
    subject,
    email,
    name: "Synthetic",
  });
  const stale = t.withIdentity({
      subject,
      auth_time: Math.floor(Date.now() / 1000) - 301,
    }),
    fresh = t.withIdentity({
      subject,
      auth_time: Math.floor(Date.now() / 1000),
    });
  await expect(
    stale.mutation(api.accounts.deleteAccount, { confirmation: email }),
  ).rejects.toThrow("REAUTH_REQUIRED");
  expect((await t.run((ctx) => ctx.db.get(actor)))?.status).toBe("active");
  expect(
    await t.run((ctx) => ctx.db.query("deletionJobs").collect()),
  ).toHaveLength(0);
  const org = await fresh.mutation(api.organizations.create, {
    name: "Destructive test workspace",
  });
  await expect(
    stale.mutation(api.organizations.remove, {
      organizationId: org,
      confirmation: "Destructive test workspace",
    }),
  ).rejects.toThrow("REAUTH_REQUIRED");
  expect((await t.run((ctx) => ctx.db.get(org)))?.status).toBe("active");
  await fresh.mutation(api.organizations.remove, {
    organizationId: org,
    confirmation: "Destructive test workspace",
  });
  expect((await t.run((ctx) => ctx.db.get(org)))?.status).toBe("deleting");
  await fresh.mutation(api.accounts.deleteAccount, { confirmation: email });
  expect((await t.run((ctx) => ctx.db.get(actor)))?.status).toBe("deleting");
});
it("allows normal credential verification but requires freshness for a credential change", async () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const subject = "key-owner";
  await t.mutation(internal.accounts.syncUser, {
    subject,
    email: "key@example.test",
    name: "Synthetic",
  });
  const owner = t.withIdentity({ subject });
  const org = await owner.mutation(api.organizations.create, {
    name: "Key test",
  });
  expect(
    await owner.query(api.jobs.authorizeCredential, {
      organizationId: org,
      readOnly: true,
    }),
  ).toBeDefined();
  await expect(
    owner.query(api.jobs.authorizeCredential, { organizationId: org }),
  ).rejects.toThrow("REAUTH_REQUIRED");
});
it("starts direct sign-in with the current page/query and no operation replay", () => {
  const assign = vi.fn(),
    location = {
      pathname: "/app/workspace/posts/source",
      search: "?version=2",
      assign,
    };
  expect(() => redirectForAuthentication(true, location)).toThrow(
    SignInRedirect,
  );
  expect(assign).toHaveBeenCalledExactlyOnceWith(
    authenticationSignInPath(location.pathname + location.search),
  );
  expect(
    new URL(assign.mock.calls[0][0], "https://example.test").searchParams.get(
      "returnTo",
    ),
  ).toBe("/app/workspace/posts/source?version=2");
  expect(authenticationReturnTo("/account?section=privacy")).toBe(
    "/account?section=privacy",
  );
  for (const path of [
    "https://evil.test",
    "//evil.test",
    "/accounting",
    "/app\\evil",
    "/app\ninvalid",
  ])
    expect(authenticationReturnTo(path)).toBe("/app");
  expect(
    authenticationReviewRequired({ data: "REAUTH_REQUIRED: Sign in again" }),
  ).toBe(true);
  expect(authenticationReviewRequired({ code: "FORBIDDEN" })).toBe(false);
});
