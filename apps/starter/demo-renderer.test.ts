import { expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
import { Console } from "./components/console";
const initial = {
  sources: [],
  repositories: [],
  proposals: [],
  runs: [],
  notifications: [],
  usage: null,
};
function saveButtons(html: string) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].filter(
    (match) => match[2].replace(/<[^>]*>/g, "").trim() === "Save",
  );
}
it("renders a reachable Save entry in the synthetic demo without mislabelling it viewer access", () => {
  const html = renderToStaticMarkup(
    createElement(Console, {
      initial,
      organizationId: "demo",
      demo: true,
      readOnly: true,
    }),
  );
  const buttons = saveButtons(html);
  expect(buttons.length).toBeGreaterThan(0);
  expect(buttons.some((match) => !match[1].includes("disabled"))).toBe(true);
  expect(html).toContain("Synthetic data only");
  expect(html).not.toContain("Viewer access.");
});
it("preserves viewer read-only Save restrictions in an actual workspace", () => {
  const html = renderToStaticMarkup(
    createElement(Console, {
      initial,
      organizationId: "synthetic-workspace",
      readOnly: true,
    }),
  );
  const buttons = saveButtons(html);
  expect(buttons.length).toBeGreaterThan(0);
  expect(buttons.every((match) => match[1].includes("disabled"))).toBe(true);
  expect(html).toContain("Viewer access.");
});
