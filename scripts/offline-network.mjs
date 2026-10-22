import http from "node:http";
import https from "node:https";
import net from "node:net";
import { syncBuiltinESMExports } from "node:module";

const local = (host) =>
  ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
function refuse(host) {
  if (!local(host)) throw Error("OFFLINE_NETWORK_BLOCKED");
}
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, init) {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  refuse(url.hostname);
  return originalFetch(input, init);
};
for (const transport of [http, https]) {
  const request = transport.request;
  transport.request = function (input, ...args) {
    const options =
      typeof input === "string" || input instanceof URL
        ? new URL(input)
        : input;
    refuse(options.hostname ?? options.host ?? "localhost");
    return request.call(this, input, ...args);
  };
  transport.get = function (...args) {
    const request = transport.request(...args);
    request.end();
    return request;
  };
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const values = Array.isArray(args[0]) ? args[0] : args;
  const options = values[0];
  if (typeof options === "object" && options !== null) {
    if (!options.path) refuse(options.host ?? "localhost");
  } else if (typeof options === "number") {
    refuse(typeof values[1] === "string" ? values[1] : "localhost");
  } else if (typeof options === "string" && /^\d+$/.test(options)) {
    refuse(typeof values[1] === "string" ? values[1] : "localhost");
  }
  return connect.apply(this, args);
};
syncBuiltinESMExports();
