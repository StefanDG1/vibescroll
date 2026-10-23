// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createRequire } from "node:module";
const requireApp = createRequire(
  new URL("../apps/starter/package.json", import.meta.url),
);
const { createElement } = requireApp("react");
const { renderToStaticMarkup } = requireApp("react-dom/server");
const followingModule = "../apps/starter/components/creator-following.tsx";
const digestModule = "../apps/starter/components/creator-digest.tsx";
it("server-renders the actual Following form with bounded defaults and no discovery calls", async () => {
  const { CreatorFollowing } = await import(followingModule);
  const call = vi.fn();
  const html = renderToStaticMarkup(
    createElement(CreatorFollowing, {
      organizationId: "synthetic-workspace",
      call,
    }),
  );
  expect(html).toContain('aria-label="Following"');
  expect(html).toContain('name="maxAssets"');
  expect(html).toContain('max="350"');
  expect(html).toContain('name="rights"');
  expect(html).toContain('id="creator-follow-mode"');
  expect(html).toContain('for="creator-follow-mode"');
  expect(html).toContain("Save follow preference");
  expect(html).toContain(
    "rights, a budget and your processing approval are still required",
  );
  expect(call).not.toHaveBeenCalled();
});
it("server-renders the actual digest without invented posts or first-result success", async () => {
  const { CreatorDigest } = await import(digestModule);
  const call = vi.fn();
  const html = renderToStaticMarkup(
    createElement(CreatorDigest, {
      organizationId: "synthetic-workspace",
      call,
      onOpenSource: vi.fn(),
    }),
  );
  expect(html).toContain("Refresh creator digest");
  expect(html).toContain("Loading your creator digest");
  expect(html).not.toContain("Save post metadata");
  expect(call).not.toHaveBeenCalled();
});
