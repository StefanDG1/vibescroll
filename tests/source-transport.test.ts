import { beforeEach, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import {
  createPublicSourceTransport,
  publicSourceAddress,
} from "../packages/providers/source-transport";
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("node:https", () => ({ request: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
it("denies private, mapped, transition and documentation source addresses", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "2002:7f00:1::",
    "2001:db8::1",
    "3fff::1",
    "2001:20::1",
  ])
    expect(publicSourceAddress(address), address).toBe(false);
  expect(publicSourceAddress("1.1.1.1")).toBe(true);
  expect(publicSourceAddress("2606:4700:4700::1111")).toBe(true);
});
it("checks every resolved address before credentials and never follows redirects", async () => {
  vi.mocked(lookup).mockResolvedValue([
    { address: "1.1.1.1", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ] as never);
  const oauth = vi.fn(async () => "fixture-oauth");
  const transport = createPublicSourceTransport({
    userAgent: "VibeScroll fixture",
    redditOAuth: oauth,
  });
  await expect(
    transport({
      provider: "reddit",
      url: "https://oauth.reddit.com/r/example/comments/abc123",
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow("provider_address_denied");
  expect(oauth).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
  vi.mocked(lookup).mockResolvedValue([
    { address: "1.1.1.1", family: 4 },
  ] as never);
  const destroy = vi.fn();
  vi.mocked(request).mockImplementation(((...args: unknown[]) => {
    const callback = args[2] as (response: unknown) => void;
    return {
      on: vi.fn(),
      end: () =>
        callback({
          statusCode: 302,
          headers: { location: "https://127.0.0.1/" },
          destroy,
        }),
    };
  }) as unknown as typeof request);
  await expect(
    transport({
      provider: "github",
      url: "https://api.github.com/repos/example/project",
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow("provider_redirect_denied");
  expect(destroy).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledOnce();
});
it("pins the checked DNS addresses and confines OAuth to the Reddit host", async () => {
  const addresses = [{ address: "1.1.1.1", family: 4 }];
  vi.mocked(lookup).mockResolvedValue(addresses as never);
  vi.mocked(request).mockImplementation(((...args: unknown[]) => {
    const callback = args[2] as (response: unknown) => void;
    return {
      on: vi.fn(),
      end: () =>
        callback({
          statusCode: 200,
          headers: { "content-type": "application/json" },
          destroy: vi.fn(),
          [Symbol.asyncIterator]: async function* () {
            yield new TextEncoder().encode("{}");
          },
        }),
    };
  }) as unknown as typeof request);
  const oauth = vi.fn(async () => "fixture-oauth");
  const transport = createPublicSourceTransport({
    userAgent: "VibeScroll fixture",
    redditOAuth: oauth,
  });
  await transport({
    provider: "github",
    url: "https://api.github.com/repos/example/project",
    signal: new AbortController().signal,
  });
  const options = vi.mocked(request).mock.calls[0][1] as {
    headers: Record<string, string>;
    lookup: (
      hostname: string,
      options: { all: boolean },
      callback: (error: unknown, value: unknown) => void,
    ) => void;
  };
  expect(options.headers.Authorization).toBeUndefined();
  const resolved = vi.fn();
  options.lookup("api.github.com", { all: true }, resolved);
  expect(resolved).toHaveBeenCalledWith(null, addresses);
  expect(oauth).not.toHaveBeenCalled();
  await transport({
    provider: "reddit",
    url: "https://oauth.reddit.com/r/example/comments/abc123",
    signal: new AbortController().signal,
  });
  expect(
    (vi.mocked(request).mock.calls[1][1] as { headers: Record<string, string> })
      .headers.Authorization,
  ).toBe("Bearer fixture-oauth");
  await expect(
    transport({
      provider: "reddit",
      url: "https://api.github.com/repos/example/project",
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow();
  expect(oauth).toHaveBeenCalledOnce();
});
