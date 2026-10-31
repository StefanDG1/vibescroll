import { expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useId: () => "runtime-choice",
}));
import { TaskRuntimePicker } from "./components/task-runtime-picker";

type Node = ReactElement<Record<string, any>>;
function elements(value: any): Node[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!isValidElement(value)) return [];
  const node = value as Node;
  return [node, ...elements(node.props.children)];
}
function text(value: any): string {
  if (Array.isArray(value)) return value.map(text).join(" ");
  if (isValidElement(value)) return text((value as Node).props.children);
  return typeof value === "string" ? value : "";
}

it("keeps all three locations visible and setup accessible without enabling unverified processing", () => {
  const onChange = vi.fn();
  const tree = TaskRuntimePicker({ organizationId: "workspace", onChange });
  const nodes = elements(tree);
  const radios = nodes.filter((node) => node.props.type === "radio");
  expect(radios.map((node) => node.props.value)).toEqual([
    "work_cloud",
    "cloud",
    "local",
  ]);
  expect(radios.every((node) => node.props.disabled)).toBe(true);
  for (const radio of radios) radio.props.onChange();
  expect(onChange).not.toHaveBeenCalled();
  const copy = text(tree);
  expect(copy).toContain("Recommended");
  expect(copy).toContain("ChatGPT subscription");
  expect(copy).toContain("credits bought separately");
  expect(copy).toContain("Keep it on");
  expect(
    nodes
      .filter((node) => node.props.href?.startsWith("/app/workspace/"))
      .map((node) => node.props.href),
  ).toEqual([
    "/app/workspace/connections",
    "/app/workspace/usage",
    "/app/workspace/runners",
  ]);
  expect(nodes.filter((node) => node.type === "details")).toHaveLength(3);
});

it("changes only the explicitly chosen available location and disables changes during a save", () => {
  const onChange = vi.fn();
  const props = {
    organizationId: "workspace",
    onChange,
    serverAvailable: true,
    localAvailable: true,
    localConfigured: true,
    value: "local" as const,
  };
  const radios = elements(TaskRuntimePicker(props)).filter(
    (node) => node.props.type === "radio",
  );
  expect(radios[2].props.checked).toBe(true);
  radios[0].props.onChange();
  expect(onChange).not.toHaveBeenCalled();
  radios[1].props.onChange();
  expect(onChange).toHaveBeenCalledExactlyOnceWith("cloud");
  onChange.mockClear();
  const busy = elements(TaskRuntimePicker({ ...props, disabled: true })).filter(
    (node) => node.props.type === "radio",
  );
  for (const radio of busy) radio.props.onChange();
  expect(onChange).not.toHaveBeenCalled();
});

it("does not mistake a paired offline computer for a ready runtime", () => {
  const tree = TaskRuntimePicker({
    organizationId: "workspace",
    onChange: vi.fn(),
    localAvailable: true,
    localConfigured: true,
    localStatus: "offline",
  });
  expect(text(tree)).toContain("Computer offline");
  expect(text(tree)).not.toContain("Available");
});
it("allows only a current Cloud handoff and preserves its unavailable preference", () => {
  const onChange = vi.fn();
  const props = {
    organizationId: "workspace",
    onChange,
    value: "work_cloud" as const,
    workCloudConfigured: true,
  };
  const stopped = TaskRuntimePicker(props);
  expect(text(stopped)).toContain("Check ChatGPT setup");
  const disabled = elements(stopped).find(
    (n) => n.props.type === "radio" && n.props.value === "work_cloud",
  )!;
  expect(disabled.props.checked).toBe(true);
  expect(disabled.props.disabled).toBe(true);
  disabled.props.onChange();
  expect(onChange).not.toHaveBeenCalled();
  const ready = TaskRuntimePicker({ ...props, workCloudAvailable: true });
  expect(text(ready)).toContain("Ready to send to ChatGPT");
  elements(ready)
    .find((n) => n.props.type === "radio" && n.props.value === "work_cloud")!
    .props.onChange();
  expect(onChange).toHaveBeenCalledExactlyOnceWith("work_cloud");
});
