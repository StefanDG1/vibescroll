import { spawn } from "node:child_process";
import { checkCodexCache } from "./codex-connection.mjs";

const authFile = "/home/node/auth/auth.json";

// Only the trusted controller transfers its own app cache. No shell, host
// mounts, command-line tokens, inherited provider keys or diagnostic output.
async function transfer(worker, script, input) {
  if (!/^vibe-trial-[a-f0-9-]+-codex$/.test(worker))
    throw Error("CHATGPT_CACHE_TRANSFER_FAILED");
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["exec", "-i", worker, "node", "-e", script],
      {
        windowsHide: true,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let output = "";
    const fail = () => {
      child.kill();
      reject(Error("CHATGPT_CACHE_TRANSFER_FAILED"));
    };
    const timer = setTimeout(fail, 10000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
      if (Buffer.byteLength(output) > 100000) fail();
    });
    child.stderr.resume();
    child.on("error", fail);
    child.stdin.on("error", fail);
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(Error("CHATGPT_CACHE_TRANSFER_FAILED"));
    });
    child.stdin.end(input);
  });
}

export async function captureCodexCache(worker) {
  const raw = await transfer(
    worker,
    `const fs=require('fs');const p=${JSON.stringify(authFile)};const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.size>100000)process.exit(1);process.stdout.write(fs.readFileSync(p,'utf8'));`,
  );
  checkCodexCache(raw);
  return raw;
}

export async function restoreCodexCache(worker, raw) {
  checkCodexCache(raw);
  await transfer(
    worker,
    `const fs=require('fs');let b='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>{b+=x;if(Buffer.byteLength(b)>100000)process.exit(1)});process.stdin.on('end',()=>{const p=${JSON.stringify(authFile)};fs.writeFileSync(p,b,{mode:0o600,flag:'wx'});});`,
    raw,
  );
}
