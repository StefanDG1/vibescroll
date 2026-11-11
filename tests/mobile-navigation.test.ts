import { expect, it } from "vitest";
import { mobileNavigationGroup } from "../apps/starter/lib/mobile-navigation";
it("keeps detail and settings routes associated with their stable bottom destination", () => {
  for (const view of ["library", "posts", "source", "shared"])
    expect(mobileNavigationGroup(view)).toBe("library");
  for (const view of [
    "projects",
    "proposals",
    "proposal",
    "improvements",
    "runs",
  ])
    expect(mobileNavigationGroup(view)).toBe("projects");
  for (const view of [
    "menu",
    "privacy",
    "usage",
    "inbox",
    "connections",
    "runners",
    "billing",
  ])
    expect(mobileNavigationGroup(view)).toBe("account");
  expect(mobileNavigationGroup("home")).toBe("home");
});
