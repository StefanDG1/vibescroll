import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsPanel } from "./components/settings-panel";

it("keeps settings contents unmounted until opening, while exposing a named trigger", () => {
  const props = {
    title: "Post settings",
    triggerLabel: "Post settings",
    children: "Retained source transcript",
  };
  const closed = renderToStaticMarkup(createElement(SettingsPanel, props));
  expect(closed).toContain('aria-label="Post settings"');
  expect(closed).toContain("<dialog");
  expect(closed).not.toContain("Retained source transcript");
  const opened = renderToStaticMarkup(
    createElement(SettingsPanel, { ...props, open: true }),
  );
  expect(opened).toContain("Retained source transcript");
});
