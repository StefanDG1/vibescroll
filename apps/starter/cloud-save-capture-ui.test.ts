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
it.each([true, false])(
  "uses the saved Cloud handoff only when ready=%s and never falls back",
  async (available) => {
    const call = vi.fn(async () => ({
      sourceId: "saved-source",
      status: "waiting_for_cloud_setup",
    }));
    const done = vi.fn();
    const props = {
      organizationId: "workspace",
      preferredRoute: "work_cloud",
      workCloud: {
        available,
        configured: true,
        grantId: "grant",
        grantVersion: 3,
      },
      personalEnabled: true,
      cloudEnabled: true,
      linkAnalysisEnabled: true,
      call,
      onDone: done,
    };
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
    hooks.index = 0;
    const tree = CaptureForm(props);
    expect(
      elements(tree).find((n) => n.type === TaskRuntimePicker)!.props.value,
    ).toBe("work_cloud");
    await tree.props.onSubmit({ preventDefault() {}, currentTarget: {} });
    if (available) {
      expect(call).toHaveBeenCalledExactlyOnceWith(
        "captureWorkCloud",
        expect.objectContaining({
          grantId: "grant",
          grantVersion: 3,
          title: "Imported video link",
          rightsAttested: true,
        }),
      );
      expect(done).toHaveBeenCalledExactlyOnceWith("saved-source", true);
    } else {
      expect(call).not.toHaveBeenCalled();
      expect(done).not.toHaveBeenCalled();
    }
  },
);
function elements(value: any): Node[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!isValidElement(value)) return [];
  const node = value as Node;
  return [node, ...elements(node.props.children)];
}
