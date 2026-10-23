import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import http from "node:http";
import { deflateSync, gzipSync } from "node:zlib";

// Exercise the real Repomix -> MCP SDK -> Express parser in a child process:
// an uncaught decoder error must fail the probe, not terminate the test runner.
const fromRepomix = createRequire(import.meta.resolve("repomix"));
const fromSdk = createRequire(
  fromRepomix.resolve("@modelcontextprotocol/sdk/client/index.js"),
);
const fromExpress = createRequire(fromSdk.resolve("express"));
const parser = fromExpress(process.argv[3] ?? "body-parser");
const mode = process.argv[2];
if (!["late-deflate", "gzip", "gzip-trailing", "charset"].includes(mode))
  throw Error("Unknown probe mode");

const json = Buffer.from('{"a":1}');
const late = mode === "late-deflate";
const first = late
  ? Buffer.concat([deflateSync(json), Buffer.from([0])])
  : mode === "gzip-trailing"
    ? Buffer.concat([
        gzipSync(json),
        Buffer.from([0]),
        Buffer.alloc(100 * 1024, 0x58),
      ])
    : gzipSync(json);
const trailing = Buffer.alloc(1024, 0x58);
const bodyParser = parser.json(
  mode === "charset" ? { verify() {} } : undefined,
);
let client;
let deadline;
const server = http.createServer((req, res) => {
  // Downstream consumers must still receive all bytes when the decoder ends.
  const hash = createHash("sha256");
  req.pipe(hash);
  bodyParser(req, res, (error) => {
    if (error) {
      res.writeHead(error.status ?? 500);
      res.end(error.type);
      return;
    }
    const respond = () => {
      if (!hash.writableFinished) {
        hash.once("finish", respond);
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({ parsed: req.body, hash: hash.read().toString("hex") }),
      );
    };
    if (late) {
      req.once("end", respond);
      // Send the second part only after parsing completes. This reproduces the
      // vulnerable late decoder error rather than merely testing invalid JSON.
      client.end(trailing);
    } else {
      respond();
    }
  });
});

try {
  const result = await new Promise((resolve, reject) => {
    deadline = setTimeout(() => reject(Error("Probe timed out")), 2000);
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      client = http.request(
        {
          hostname: "127.0.0.1",
          port: server.address().port,
          method: "POST",
          agent: false,
          headers: {
            "Content-Type":
              mode === "charset"
                ? "application/json; charset=utf-999"
                : "application/json",
            "Content-Encoding": late ? "deflate" : "gzip",
            "Content-Length": first.length + (late ? trailing.length : 0),
          },
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => (body += chunk));
          res.once("error", reject);
          res.once("end", () => {
            // Leave time for a late stream error before declaring survival.
            setTimeout(() => resolve({ status: res.statusCode, body }), 30);
          });
        },
      );
      client.once("error", reject);
      if (late) client.write(first);
      else client.end(first);
    });
  });
  console.log(
    JSON.stringify({
      ...result,
      expectedHash: createHash("sha256")
        .update(first)
        .update(late ? trailing : Buffer.alloc(0))
        .digest("hex"),
    }),
  );
} finally {
  clearTimeout(deadline);
  client?.destroy();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
