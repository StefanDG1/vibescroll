import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList } from "node:net";
import { publicPreviewAddress, previewUrl } from "./source-preview";
import { SourceAdapterError } from "../sources/limits";
import type { SourceTransport } from "../sources/types";
const deniedSourceV6 = new BlockList();
for (const [address, prefix] of [
  ["2002::", 16],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["3fff::", 20],
] as const)
  deniedSourceV6.addSubnet(address, prefix, "ipv6");
export function publicSourceAddress(address: string) {
  return (
    publicPreviewAddress(address) && !deniedSourceV6.check(address, "ipv6")
  );
}
// This connection-bound transport is suitable for the dedicated public-source
// reader. It never accepts destination installation credentials.
export function createPublicSourceTransport(options: {
  redditOAuth?: () => Promise<string>;
  userAgent: string;
}): SourceTransport {
  if (!/^[\x20-\x7e]{1,200}$/.test(options.userAgent))
    throw Error("INVALID_USER_AGENT");
  return async ({ provider, url: raw, signal }) => {
    const host = provider === "github" ? "api.github.com" : "oauth.reddit.com";
    const url = previewUrl(raw, [host]);
    const addresses = await lookup(url.hostname, { all: true });
    if (
      !addresses.length ||
      addresses.length > 16 ||
      !addresses.every((a) => publicSourceAddress(a.address)) ||
      signal.aborted
    )
      throw new SourceAdapterError("unavailable", "provider_address_denied");
    const headers: Record<string, string> = {
      "User-Agent": options.userAgent,
      Accept: "application/json",
      "Accept-Encoding": "identity",
    };
    if (provider === "github") headers["X-GitHub-Api-Version"] = "2022-11-28";
    else {
      const token = await options.redditOAuth?.();
      if (!token || !/^[A-Za-z0-9._~-]{1,4096}$/.test(token))
        throw new SourceAdapterError(
          "needs_supplied_text",
          "reddit_oauth_unavailable",
        );
      headers.Authorization = `Bearer ${token}`;
    }
    return new Promise((resolve, reject) => {
      const req = request(
        url,
        {
          method: "GET",
          agent: false,
          signal,
          maxHeaderSize: 16384,
          headers,
          lookup: (_hostname, opts, callback) => {
            if (opts.all) callback(null, addresses);
            else callback(null, addresses[0].address, addresses[0].family);
          },
        },
        (response) => {
          // No redirect carries credentials or reaches an unaudited destination.
          if (
            response.statusCode &&
            response.statusCode >= 300 &&
            response.statusCode < 400
          ) {
            response.destroy();
            reject(
              new SourceAdapterError("unavailable", "provider_redirect_denied"),
            );
            return;
          }
          const normalized: Record<string, string | undefined> = {};
          for (const key of [
            "content-type",
            "content-length",
            "content-encoding",
            "retry-after",
            "x-ratelimit-reset",
            "x-ratelimit-remaining",
          ])
            normalized[key] =
              typeof response.headers[key] === "string"
                ? response.headers[key]
                : undefined;
          // Destroy on non-success so an unread error body cannot hold a socket.
          if (response.statusCode !== 200) response.destroy();
          resolve({
            status: response.statusCode ?? 0,
            headers: normalized,
            body: response,
          });
        },
      );
      req.on("error", () =>
        reject(
          new SourceAdapterError("unavailable", "provider_transport_failed"),
        ),
      );
      req.end();
    });
  };
}
