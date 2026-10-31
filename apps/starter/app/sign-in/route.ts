import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { authenticationReturnTo } from "../../../../packages/policy/reauthentication";
export async function GET(request: NextRequest) {
  const candidate = request.nextUrl.searchParams.get("returnTo") ?? "/app";
  const returnTo = authenticationReturnTo(candidate);
  redirect(
    await getSignInUrl({
      returnTo,
      ...(request.nextUrl.searchParams.get("reauth") === "true"
        ? { maxAge: 300 }
        : {}),
    }),
  );
}
