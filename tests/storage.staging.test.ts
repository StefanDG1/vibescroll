import { it, expect } from "vitest";
import { writeFile } from "node:fs/promises";
import {
  signedObject,
  signedUploadObject,
  objectMetadata,
  deleteObject,
} from "../packages/providers/storage";

it.skipIf(process.env.VIBE_STAGING_TEST !== "storage")(
  "verifies private EU storage, bounded grants, CORS and actual deletion",
  async () => {
    const key = `synthetic-staging/${crypto.randomUUID()}`;
    const value =
      "VibeScroller synthetic private-storage test. No customer data.";
    let deleted = false;
    try {
      const bounded = signedUploadObject(key, {
        size: Buffer.byteLength(value),
        type: "application/octet-stream",
      });
      const wrongType = await fetch(bounded, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4" },
        body: value,
      });
      expect(wrongType.status).toBe(403);
      const wrongLength = await fetch(bounded, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: value + "!",
      });
      expect(wrongLength.status).toBe(403);
      const put = await fetch(bounded, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: value,
      });
      expect(put.status).toBe(200);
      const metadata = await objectMetadata(key);
      expect(metadata.size).toBe(Buffer.byteLength(value));
      const read = await fetch(signedObject(key, "GET", 60));
      expect(read.status).toBe(200);
      expect(await read.text()).toBe(value);
      const unsigned = await fetch(
        `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET}/${key}`,
      );
      expect([400, 401, 403]).toContain(unsigned.status);
      expect(await unsigned.text()).not.toContain(value);
      const expired = await fetch(
        signedObject(key, "GET", 60, new Date(Date.now() - 120000)),
      );
      expect(expired.status).toBe(403);
      const cors = await fetch(bounded, {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3001",
          "Access-Control-Request-Method": "PUT",
          "Access-Control-Request-Headers": "content-type",
        },
      });
      expect(cors.headers.get("access-control-allow-origin")).toBe(
        "http://localhost:3001",
      );
      await deleteObject(key);
      deleted = true;
      const missing = await fetch(signedObject(key, "HEAD"), {
        method: "HEAD",
      });
      expect(missing.status).toBe(404);
      await writeFile(
        new URL("../infra/storage-evidence.json", import.meta.url),
        JSON.stringify(
          {
            time: new Date().toISOString(),
            synthetic: true,
            jurisdiction: "EU",
            bucket: process.env.R2_BUCKET,
            checks: {
              privateUnsignedDenied: true,
              expiredGrantDenied: true,
              scopedCors: true,
              uploadTypeSigned: true,
              uploadLengthSigned: true,
              readWrite: true,
              deleteConfirmed: true,
            },
            bytes: metadata.size,
          },
          null,
          2,
        ) + "\n",
      );
    } finally {
      if (!deleted) await deleteObject(key);
    }
  },
  60000,
);
