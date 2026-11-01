import { NextRequest, NextResponse } from "next/server";
import { api } from "@/lib/backend";
import { allowedRequestOrigin } from "@/lib/request-origin";
import {
  onboardingSecret,
  previewCookie,
  starterClient,
  starterMetadata,
} from "@/lib/onboarding-server";
import {
  previewClaim,
  readOnboardingValue,
  signOnboardingValue,
} from "../../../../../../packages/onboarding/journey";
import { signedObject } from "../../../../../../packages/providers/storage";
import { createHash } from "node:crypto";
import { jpegDimensions } from "../../../../../../packages/media/jpeg";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
};
async function current(req: NextRequest) {
  const token = req.cookies.get(previewCookie)?.value;
  const claim = previewClaim.safeParse(
    token && (await readOnboardingValue(token, onboardingSecret())),
  );
  return token &&
    claim.success &&
    claim.data.kind === "detail" &&
    claim.data.expiresAt > Date.now()
    ? { token, claim: claim.data }
    : null;
}
export async function POST(req: NextRequest) {
  const deployment = process.env.VERCEL_URL;
  const stagedOrigin =
    deployment &&
    /^[a-z0-9.-]+\.vercel\.app$/.test(deployment) &&
    req.headers.get("origin") === `https://${deployment}`;
  if (!allowedRequestOrigin(req) && !stagedOrigin)
    return NextResponse.json(
      { error: "Reload this page to continue." },
      { status: 403, headers },
    );
  try {
    if (Number(req.headers.get("content-length") ?? 0) > 2000)
      throw Error("Body limit");
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 2000) throw Error("Body limit");
    const { familyId } = JSON.parse(raw);
    if (typeof familyId !== "string" || familyId.length > 100)
      throw Error("Invalid post");
    const previous = await current(req);
    if (previous && previous.claim.familyId !== familyId)
      return NextResponse.json(
        {
          error:
            "Your complete preview is ready. Create an account to keep exploring.",
          code: "PREVIEW_USED",
        },
        { status: 403, headers },
      );
    const token =
      previous?.token ??
      (await signOnboardingValue(
        {
          version: 1,
          kind: "detail",
          familyId,
          session: crypto.randomUUID(),
          expiresAt: Date.now() + 30 * 86400000,
        },
        onboardingSecret(),
      ));
    const detail = await starterClient().mutation(
      api.onboardingStarter.detail,
      { token },
    );
    const response = NextResponse.json(detail, { headers });
    response.cookies.set(previewCookie, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 30 * 86400,
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: "This post is unavailable. Choose another ready post." },
      { status: 400, headers },
    );
  }
}
export async function GET(req: NextRequest) {
  try {
    const familyId = req.nextUrl.searchParams.get("familyId"),
      frameId = req.nextUrl.searchParams.get("frameId");
    if (!frameId)
      return NextResponse.json(
        await starterMetadata(
          (req.nextUrl.searchParams.get("interests") ?? "")
            .split(",")
            .filter(Boolean)
            .slice(0, 3),
        ),
        { headers },
      );
    let token: string;
    if (req.nextUrl.searchParams.get("thumbnail") === "1" && familyId) {
      token = await signOnboardingValue(
        {
          version: 1,
          kind: "thumbnail",
          familyId,
          session: crypto.randomUUID(),
          expiresAt: Date.now() + 60000,
        },
        onboardingSecret(),
      );
    } else {
      const previous = await current(req);
      if (!previous || previous.claim.familyId !== familyId)
        throw Error("Unavailable");
      token = previous.token;
    }
    const client = starterClient();
    const load = () =>
      client.mutation(api.onboardingStarter.frame, { token, frameId });
    const frame = await load();
    const response = await fetch(signedObject(frame.key, "GET", 15), {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (
      !response.ok ||
      response.headers.get("content-type")?.split(";")[0] !== "image/jpeg" ||
      !response.body
    )
      throw Error("Unavailable");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let count = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        count += part.value.length;
        if (count > frame.size || count > 150000) throw Error("Frame limit");
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const bytes = Buffer.concat(chunks),
      dimensions = jpegDimensions(bytes);
    if (
      bytes.length !== frame.size ||
      createHash("sha256").update(bytes).digest("hex") !== frame.sha256 ||
      dimensions.width !== frame.width ||
      dimensions.height !== frame.height
    )
      throw Error("Changed frame");
    if (JSON.stringify(await load()) !== JSON.stringify(frame))
      throw Error("Changed authority");
    return new Response(bytes, {
      headers: { ...headers, "Content-Type": "image/jpeg" },
    });
  } catch {
    return new Response("This screenshot is unavailable.", {
      status: 404,
      headers,
    });
  }
}
