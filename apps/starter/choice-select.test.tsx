import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ChoiceSelect } from "./components/choice-select";

it("shows the selected repository when native option IDs are numeric", () => {
  const html = renderToStaticMarkup(
    <ChoiceSelect name="repositoryId" defaultValue="1396686369">
      <option value={613586725}>Another project</option>
      <option value={1396686369}>StefanDG1/vibescroll</option>
    </ChoiceSelect>,
  );
  expect(html).toContain("StefanDG1/vibescroll");
  expect(html).toContain('value="1396686369"');
  expect(html).not.toContain(">Choose<");
});

it("preserves string-valued model choices", () => {
  const html = renderToStaticMarkup(
    <ChoiceSelect name="model" defaultValue="selected">
      <option value="selected">Selected model</option>
    </ChoiceSelect>,
  );
  expect(html).toContain("Selected model");
  expect(html).toContain('value="selected"');
});
