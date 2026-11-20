import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Tokenizer } from "@huggingface/tokenizers";
import { env, InferenceSession, Tensor } from "onnxruntime-web";

const revision = "2c4055b12046f11709e9df2c122e59ffbdc2f900";
const directory = join(tmpdir(), `vibescroll-minilm-${revision}`);
const origin = `https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/${revision}`;
const modelFile = {
  path: "onnx/model_quantized.onnx",
  bytes: 118308126,
  digest: "66fc00f5f29afcaff34092e1bdd20008ca3918265a82fb9695a551e510cc4ebc",
};
const tokenizerFile = {
  path: "tokenizer.json",
  bytes: 17082913,
  digest: "b60b6b43406a48bf3638526314f3d232d97058bc93472ff2de930d43686fa441",
};

async function getAsset(asset: typeof modelFile) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const destination = join(directory, asset.path.split("/").at(-1)!);
  const check = async () => {
    if ((await stat(destination).catch(() => null))?.size !== asset.bytes)
      return false;
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(destination)) hash.update(chunk);
    return hash.digest("hex") === asset.digest;
  };
  if (await check()) return destination;
  const temporary = `${destination}.${crypto.randomUUID()}`;
  try {
    const response = await fetch(`${origin}/${asset.path}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok || !response.body)
      throw new Error("Search model unavailable.");
    let length = 0;
    const hash = createHash("sha256");
    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          length += chunk.length;
          if (length > asset.bytes)
            return callback(new Error("Search model exceeds its size bound."));
          hash.update(chunk);
          callback(null, chunk);
        },
      }),
      createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
    );
    if (length !== asset.bytes || hash.digest("hex") !== asset.digest)
      throw new Error("Search model integrity check failed.");
    await rename(temporary, destination);
    return destination;
  } finally {
    await rm(temporary, { force: true });
  }
}

async function loadModel() {
  env.wasm.numThreads = 1;
  const [weights, tokenizer] = await Promise.all([
    getAsset(modelFile),
    getAsset(tokenizerFile),
  ]);
  const encoder = new Tokenizer(
    JSON.parse(await readFile(tokenizer, "utf8")),
    {},
  );
  const model = await InferenceSession.create(weights, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "basic",
  });
  return { encoder, model };
}

let loaded: ReturnType<typeof loadModel> | undefined;

export async function searchEmbeddings(texts: readonly string[]) {
  loaded ??= loadModel().catch((error) => {
    loaded = undefined;
    throw error;
  });
  const { encoder, model } = await loaded;
  const vectors: number[][] = [];
  for (const text of texts) {
    const { ids } = encoder.encode(text.slice(0, 2400), {
      add_special_tokens: true,
    });
    const tokens =
      ids.length <= 128 ? ids : [...ids.slice(0, 127), ids.at(-1)!];
    const shape = [1, tokens.length];
    const values = await model.run({
      input_ids: new Tensor("int64", tokens.map(BigInt), shape),
      attention_mask: new Tensor(
        "int64",
        tokens.map(() => BigInt(1)),
        shape,
      ),
      token_type_ids: new Tensor(
        "int64",
        tokens.map(() => BigInt(0)),
        shape,
      ),
    });
    const vector = Array<number>(384).fill(0);
    const data = values.last_hidden_state.data as Float32Array;
    if (data.length !== 384 * tokens.length)
      throw new Error("Invalid search model output.");
    for (let index = 0; index < data.length; index++)
      vector[index % 384] += data[index];
    const norm = Math.hypot(...vector);
    if (!Number.isFinite(norm) || norm <= 0)
      throw new Error("Invalid search embedding.");
    vectors.push(vector.map((value) => value / norm));
  }
  return vectors;
}
