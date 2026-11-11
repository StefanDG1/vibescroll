import { afterEach, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";
const hooks = vi.hoisted(() => ({ values: [] as any[], index: 0 }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: () => {},
  useId: () => "synthetic-personal-control",
  useRef: (value: unknown) => {
    const index = hooks.index++;
    return (hooks.values[index] ??= { current: value });
  },
  useState: (value: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values))
      hooks.values[index] =
        typeof value === "function" ? (value as () => unknown)() : value;
    return [
      hooks.values[index],
      (next: any) => {
        hooks.values[index] =
          typeof next === "function" ? next(hooks.values[index]) : next;
      },
    ];
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
import { CaptureForm } from "./components/console";
import { TaskRuntimePicker } from "./components/task-runtime-picker";
type Node = ReactElement<Record<string, any>>;
afterEach(() => {
  hooks.values = [];
  hooks.index = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each(["save_only", "cloud"])(
  "preserves the saved %s route without falling back to local processing",
  async (preferredRoute) => {
    const call = vi.fn(async (_operation: string) => "saved-source");
    hooks.index = 0;
    const tree = CaptureForm({
      organizationId: "workspace",
      preferredRoute,
      personalEnabled: true,
      cloudEnabled: false,
      linkAnalysisEnabled: true,
      call,
      onDone: vi.fn(),
    });
    const picker = elements(tree).find(
      (node) => node.type === TaskRuntimePicker,
    )!;
    expect(picker.props.value).toBe(
      preferredRoute === "cloud" ? "cloud" : undefined,
    );
    vi.stubGlobal("crypto", { randomUUID: () => "synthetic-save" });
    vi.stubGlobal(
      "FormData",
      class {
        get(name: string) {
          return (
            {
              url: "https://www.instagram.com/reel/Example/",
              rights: "on",
            } as Record<string, string>
          )[name];
        }
      },
    );
    await tree.props.onSubmit({
      preventDefault() {},
      currentTarget: { reset() {} },
    });
    expect(call.mock.calls.map(([operation]) => operation)).toEqual([
      "capture",
    ]);
  },
);
function elements(value: any): Node[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!isValidElement(value)) return [];
  const node = value as Node;
  return [node, ...elements(node.props.children)];
}
