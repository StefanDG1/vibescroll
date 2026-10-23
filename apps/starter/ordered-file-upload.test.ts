import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { isValidElement, type ReactElement } from "react";
const hooks = vi.hoisted(() => ({ cells: [] as any[], index: 0 }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: () => {},
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    return (hooks.cells[index] ??= { current: initial });
  },
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.cells))
      hooks.cells[index] = typeof initial === "function" ? initial() : initial;
    return [
      hooks.cells[index],
      (value: any) => {
        hooks.cells[index] =
          typeof value === "function" ? value(hooks.cells[index]) : value;
      },
    ];
  },
}));
import {
  OrderedFileUpload,
  validateOrderedFiles,
} from "./components/ordered-file-upload";
type Node = ReactElement<Record<string, any>>;
afterEach(() => {
  hooks.cells = [];
  hooks.index = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function render(props: Parameters<typeof OrderedFileUpload>[0]) {
  hooks.index = 0;
  return OrderedFileUpload(props);
}
function nodes(value: any): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isValidElement(value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
}
function text(value: any): string {
  if (Array.isArray(value)) return value.map(text).join(" ");
  if (isValidElement(value)) return text((value as Node).props.children);
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}
function select(tree: Node, files: File[]) {
  nodes(tree)
    .find((node) => node.props.name === "files")!
    .props.onChange({ currentTarget: { files, value: "selected" } });
}
function formData(values: Record<string, string> = {}) {
  vi.stubGlobal(
    "FormData",
    class {
      get(name: string) {
        return (
          (
            {
              rights: "on",
              title: "Private file selection",
              ...values,
            } as Record<string, string>
          )[name] || null
        );
      }
    },
  );
}
function submit(tree: Node) {
  return tree.props.onSubmit({ preventDefault: vi.fn(), currentTarget: {} });
}
it("bounds actual selected files before upload and keeps demo uploads inert", async () => {
  for (const files of [
    [],
    Array.from({ length: 36 }, () => ({ size: 1, type: "image/png" })),
    [{ size: 250000001, type: "image/png" }],
    [{ size: 1, type: "image/svg+xml" }],
    [{ size: 0, type: "image/jpeg" }],
  ])
    expect(() => validateOrderedFiles(files)).toThrow();
  expect(() =>
    validateOrderedFiles(
      Array.from({ length: 35 }, () => ({ size: 1, type: "image/png" })),
    ),
  ).not.toThrow();
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const call = vi.fn();
  const tree = render({
    organizationId: "synthetic",
    call,
    onDone: vi.fn(),
    demo: true,
  });
  await submit(tree);
  expect(fetcher).not.toHaveBeenCalled();
  expect(call).not.toHaveBeenCalled();
  expect(text(tree)).toContain("does not upload files");
});
it("reuses confirmed uploads after a failed child, respects keyboard reorder and saves hashes without inference", async () => {
  formData({
    originalUrl: "https://example.test/original",
    caption: "User supplied context",
  });
  const a = new File(["first-image"], "first.png", { type: "image/png" });
  const b = new File(["second-video"], "second.mp4", { type: "video/mp4" });
  let batch = 0,
    secondFailed = false;
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    if (url === "/api/uploads/batch-grant") {
      batch++;
      const files = JSON.parse(String(init.body)).files;
      return Response.json({
        uploads: files.map((_: unknown, index: number) => ({
          key: `synthetic/batch${batch}-${index}`,
          url: `https://storage.example.test/put${batch}-${index}`,
        })),
      });
    }
    if (url === "https://storage.example.test/put1-1" && !secondFailed) {
      secondFailed = true;
      return new Response("", { status: 503 });
    }
    return Response.json({ complete: true });
  });
  vi.stubGlobal("fetch", fetcher);
  const call = vi.fn(async () => "saved-private-source"),
    onDone = vi.fn();
  const props = { organizationId: "synthetic", call, onDone };
  select(render(props), [a, b]);
  await submit(render(props));
  expect(call).not.toHaveBeenCalled();
  expect(text(render(props))).toContain("Some files did not upload");
  nodes(render(props))
    .find((node) => node.props["aria-label"] === "Move file 2 up")!
    .props.onClick();
  await submit(render(props));
  const grants = fetcher.mock.calls.filter(
    ([url]) => url === "/api/uploads/batch-grant",
  );
  expect(JSON.parse(String(grants[1][1].body)).files).toHaveLength(1);
  expect(
    fetcher.mock.calls.filter(
      ([url]) => url === "https://storage.example.test/put1-0",
    ),
  ).toHaveLength(1);
  expect(call).toHaveBeenCalledExactlyOnceWith(
    "captureOrdered",
    expect.objectContaining({
      organizationId: "synthetic",
      rightsAttested: true,
      originalUrl: "https://example.test/original",
      caption: "User supplied context",
      assets: [
        {
          key: "synthetic/batch2-0",
          index: 0,
          sha256: createHash("sha256").update("second-video").digest("hex"),
        },
        {
          key: "synthetic/batch1-0",
          index: 1,
          sha256: createHash("sha256").update("first-image").digest("hex"),
        },
      ],
    }),
  );
  expect(onDone).toHaveBeenCalledWith("saved-private-source");
});
it("retries an unconfirmed capture with the same idempotency key and no reupload", async () => {
  formData();
  const fetcher = vi.fn(async (url: string) =>
    Response.json(
      url === "/api/uploads/batch-grant"
        ? {
            uploads: [
              {
                key: "synthetic/object",
                url: "https://storage.example.test/put",
              },
            ],
          }
        : { complete: true },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  let reject = true;
  const call = vi.fn(async () => {
    if (reject) {
      reject = false;
      throw new Error("Save response unavailable");
    }
    return "confirmed";
  });
  const props = { organizationId: "synthetic", call, onDone: vi.fn() };
  select(render(props), [
    new File(["image"], "one.webp", { type: "image/webp" }),
  ]);
  await submit(render(props));
  expect(text(render(props))).toContain("Save response unavailable");
  await submit(render(props));
  expect(
    fetcher.mock.calls.filter(([url]) => url === "/api/uploads/batch-grant"),
  ).toHaveLength(1);
  expect(call.mock.calls[0]).toEqual(call.mock.calls[1]);
});
it("requires rights and a safe optional reference before any grant", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const props = { organizationId: "synthetic", call: vi.fn(), onDone: vi.fn() };
  select(render(props), [
    new File(["image"], "one.webp", { type: "image/webp" }),
  ]);
  formData({ rights: "" });
  await submit(render(props));
  expect(text(render(props))).toContain("Confirm that you may submit");
  formData({ originalUrl: "https://user:password@example.test/" });
  await submit(render(props));
  expect(text(render(props))).toContain("without sign-in details");
  expect(fetcher).not.toHaveBeenCalled();
});
