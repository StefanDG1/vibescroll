import { readFile, writeFile } from "node:fs/promises";
import { format } from "prettier";
for (const [file, symbol] of [
  ["decode-prepared.py", "preparedDecoder"],
  ["acquire-prepared.py", "preparedAcquirer"],
  ["cloud_extraction.py", "preparedExtraction"],
]) {
  const text = await readFile(
    new URL(`../packages/media/${file}`, import.meta.url),
    "utf8",
  );
  await writeFile(
    new URL(`../packages/media/${symbol}.ts`, import.meta.url),
    `// Generated from ${file}. Regenerate with scripts/sync-decoder.mjs.\nexport const ${symbol} = ${JSON.stringify(text.replaceAll("\r\n", "\n"))};\n`,
  );
}
const source = await readFile(
  new URL("../packages/media/decode.py", import.meta.url),
  "utf8",
);
await writeFile(
  new URL("../packages/media/decoder.ts", import.meta.url),
  "// Generated from decode.py for the Convex Node bundle. Regenerate with scripts/sync-decoder.mjs.\nexport const decoder = " +
    JSON.stringify(source.replaceAll("\r\n", "\n")) +
    ";\n",
);
const personal = await readFile(
  new URL("../packages/media/decode-personal.py", import.meta.url),
  "utf8",
);
const acquisition = await readFile(
  new URL("../packages/media/acquire.py", import.meta.url),
  "utf8",
);
await writeFile(
  new URL("../packages/media/acquirer.ts", import.meta.url),
  "// Generated from acquire.py. Regenerate with scripts/sync-decoder.mjs.\nexport const acquirer = " +
    JSON.stringify(acquisition.replaceAll("\r\n", "\n")) +
    ";\n",
);
await writeFile(
  new URL("../packages/media/decoder-personal.ts", import.meta.url),
  "// Generated from decode-personal.py. Regenerate with scripts/sync-decoder.mjs.\nexport const personalDecoder = " +
    JSON.stringify(personal.replaceAll("\r\n", "\n")) +
    ";\n",
);
for (const file of [
  "preparedDecoder",
  "preparedAcquirer",
  "preparedExtraction",
  "decoder",
  "acquirer",
  "decoder-personal",
]) {
  const path = new URL(`../packages/media/${file}.ts`, import.meta.url);
  await writeFile(
    path,
    await format(await readFile(path, "utf8"), { parser: "typescript" }),
  );
}
