import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";

// Resolve the actual production Sandbox dependency. A child process makes an
// unhandled stream error fail the test instead of killing the test runner.
const fromSandbox = createRequire(import.meta.resolve("@vercel/sandbox"));
const { fetch, Client } = fromSandbox("undici");
const compressed = gzipSync("ordinary compressed response");
const sockets = new Set();
let requests = 0;
const server = createServer((socket) => {
  sockets.add(socket);
  socket.once("close", () => sockets.delete(socket));
  socket.once("data", () => {
    requests++;
    if (requests === 1) {
      // Upstream GHSA-xjj6-f33q-929c reproducer: reject the sixth coding,
      // then receive an early close with a deliberately missing body byte.
      socket.end(
        "HTTP/1.1 200 OK\r\n" +
          `Content-Encoding: ${Array(6).fill("gzip").join(", ")}\r\n` +
          "Content-Length: 1\r\nConnection: close\r\n\r\n",
      );
    } else {
      socket.end(
        Buffer.concat([
          Buffer.from(
            "HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\n" +
              `Content-Length: ${compressed.length}\r\nConnection: close\r\n\r\n`,
          ),
          compressed,
        ]),
      );
    }
  });
});
let client;
const deadline = setTimeout(() => {
  throw Error("Encoding probe timed out");
}, 2000);
try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  client = new Client(url);
  await assert.rejects(fetch(url, { dispatcher: client }), (error) => {
    assert.match(error.cause?.message ?? "", /too many content-encodings/);
    return true;
  });
  // Allow the rejected response's asynchronous stream error to surface.
  await new Promise((resolve) => setTimeout(resolve, 50));
  const response = await fetch(url, { dispatcher: client });
  assert.equal(await response.text(), "ordinary compressed response");
  assert.equal(requests, 2);
  console.log(
    JSON.stringify({ rejectedExcessiveEncoding: true, gzip: "passed" }),
  );
} finally {
  clearTimeout(deadline);
  await client?.close();
  for (const socket of sockets) socket.destroy();
  await new Promise((resolve) => server.close(resolve));
}
