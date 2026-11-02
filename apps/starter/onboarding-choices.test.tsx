import React from "react";
import { parseFragment } from "parse5";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./app/onboarding/actions", () => ({
  startOnboardingCheckout: vi.fn(),
}));
vi.mock("./components/action-form", () => ({
  ActionForm: ({ children }: { children: React.ReactNode }) => (
    <form>{children}</form>
  ),
}));
import { SearchChoices } from "./components/search-choices";
import { OnboardingPayment } from "./components/onboarding-payment";
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
it("serializes a numeric repository choice through its visible radio list", () => {
  const html = renderToStaticMarkup(
    <SearchChoices
      name="repositoryId"
      label="Find a repository"
      defaultValue="1396686369"
      options={[
        { value: 613586725, label: "Other project" },
        { value: 1396686369, label: "StefanDG1/vibescroll" },
      ]}
    />,
  );
  expect(html).toContain('name="repositoryId" value="1396686369"');
  const nodes = (node: any): any[] => [
    node,
    ...(node.childNodes ?? []).flatMap(nodes),
  ];
  const selected = nodes(parseFragment(html))
    .filter((node) => node.nodeName === "input")
    .map((node) =>
      Object.fromEntries(
        node.attrs.map((attribute: any) => [attribute.name, attribute.value]),
      ),
    )
    .find(
      (attributes) => attributes.type === "radio" && "checked" in attributes,
    );
  expect(selected?.value).toBe("1396686369");
  expect(html).not.toContain('role="combobox"');
});
it.each(["monthly", "annual", "weekly"] as const)(
  "keeps the exact %s checkout interval with all three prices visible",
  (interval) => {
    const html = renderToStaticMarkup(
      <OnboardingPayment
        organizationId="workspace"
        countries={[]}
        countryRequired={false}
        ready
        returned={false}
        initialInterval={interval}
      />,
    );
    expect(html).toContain(`name="interval" value="${interval}"`);
    for (const price of ["€35", "€350", "€17"]) expect(html).toContain(price);
    expect(html.match(/name="plan-choice"/g)).toHaveLength(3);
    expect(html).toContain('name="terms"');
    expect(html).not.toContain("<select");
  },
);
