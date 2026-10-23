import { readFile, writeFile } from "node:fs/promises";
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
const ordered = await readFile(
  new URL("../packages/media/decode-ordered.py", import.meta.url),
  "utf8",
);
await writeFile(
  new URL("../packages/media/decoder-ordered.ts", import.meta.url),
  "// Generated from decode-ordered.py. Regenerate with scripts/sync-decoder.mjs.\nexport const orderedDecoder = " +
    JSON.stringify(ordered.replaceAll("\r\n", "\n")) +
    ";\n",
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
