import net from "node:net";
import http from "node:http";
if (
  process.env.OPENAI_API_KEY ||
  process.env.CONVEX_DEPLOY_KEY ||
  process.env.VIBE_STAGING_TEST
)
  throw Error("Credentials inherited");
for (const action of [
  () => fetch("https://example.com"),
  () => http.get("http://example.com"),
  () => net.connect(443, "example.com"),
]) {
  let blocked = false;
  try {
    await action();
  } catch (error) {
    blocked = error.message === "OFFLINE_NETWORK_BLOCKED";
  }
  if (!blocked) throw Error("Public network was not blocked");
}
console.log("offline controls verified");
