"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { signOut } from "@workos-inc/authkit-nextjs";
import { ConvexError } from "convex/values";
import { backend, api } from "@/lib/backend";
import type { Id } from "../../../convex/_generated/dataModel";
import type { FormState } from "@/components/action-form";
import { publicContinuation } from "@/lib/public-knowledge-display";
function continuation(d: FormData) {
  const result = publicContinuation({
    draft: String(d.get("draft") ?? ""),
    publicEdition: String(d.get("publicEdition") ?? ""),
    publicVersion: String(d.get("publicVersion") ?? ""),
  });
  return result ? `?${result}` : "";
}
const val = (d: FormData, key: string) => String(d.get(key) ?? "");
const org = (d: FormData) => val(d, "organizationId") as Id<"organizations">;
export async function recordInvoiceReceipt(_: FormState, d: FormData) {
  return run(async () => {
    await (
      await backend()
    ).mutation(api.commerce.submitReceipt, {
      id: val(d, "invoiceTaskId") as Id<"invoiceTasks">,
      receipt: val(d, "receipt"),
    });
    revalidatePath("/account/invoices");
    return {
      message:
        "Submission reference recorded. Its authenticity is not automatically verified.",
    };
  });
}
export async function quoteV1Change(_: FormState, d: FormData) {
  return run(async () => {
    const id = await (
      await backend()
    ).action(api.billingV1.quoteChange, {
      organizationId: org(d),
      tier: val(d, "tier") as "starter" | "pro",
    });
    return { path: `/app/${org(d)}/billing/change/${id}` };
  });
}
export async function applyV1Change(_: FormState, d: FormData) {
  return run(async () =>
    (await backend()).action(api.billingV1.applyChange, {
      id: val(d, "quoteId") as Id<"billingChanges">,
    }),
  );
}
export async function startV1Checkout(_: FormState, d: FormData) {
  let url;
  try {
    url = await (
      await backend()
    ).action(api.billingV1.checkout, {
      organizationId: org(d),
      tier: val(d, "tier") as "starter" | "pro",
      interval: val(d, "interval") as "weekly" | "monthly" | "annual",
      country: val(d, "country") || undefined,
      termsAccepted: d.get("terms") === "on",
      immediateService: d.get("immediate") === "on",
    });
  } catch (error) {
    const data = error instanceof ConvexError ? error.data : null;
    const messages: Record<string, string> = {
      CHECKOUT_OPEN:
        "A different checkout is already open. Return to the previous selection or wait 31 minutes before changing it.",
      COUNTRY_DISABLED:
        "Checkout is unavailable in this country. Choose an enabled billing country.",
      SUBSCRIPTION_EXISTS:
        "You already have a subscription. Use the billing portal to manage it.",
      TERMS_REQUIRED: "Accept the service terms before opening checkout.",
    };
    const code =
      typeof data === "string"
        ? data.split(":", 1)[0]
        : data && typeof data === "object" && "code" in data
          ? String(data.code)
          : "";
    return {
      error:
        messages[code] ??
        "Checkout unavailable. Verify the catalogue, environment, terms and tax configuration.",
    };
  }
  redirect(url);
}
export async function cancelV1Subscription(_: FormState, d: FormData) {
  return run(async () => {
    await (
      await backend()
    ).action(api.billingV1.cancel, { organizationId: org(d) });
    return {
      message:
        "Cancellation requested for the paid period end. Refresh provider status to verify.",
    };
  });
}
export async function buyV1Credits(_: FormState, d: FormData) {
  let url;
  try {
    url = await (
      await backend()
    ).action(api.billingV1.topup, {
      organizationId: org(d),
      pack: val(d, "pack") as "200" | "550",
      country: val(d, "country") || undefined,
      termsAccepted: d.get("terms") === "on",
      immediateService: d.get("immediate") === "on",
    });
  } catch {
    return {
      error:
        "Top-up unavailable. Check the billing account and approved environment.",
    };
  }
  redirect(url);
}
export async function requestV1Refund(_: FormState, d: FormData) {
  return run(async () => {
    const result = await (
      await backend()
    ).action(api.billingV1.requestRefund, {
      organizationId: org(d),
      invoiceId: val(d, "invoiceId"),
    });
    return { message: result.message };
  });
}
const signOutUrl = () =>
  new URL(process.env.APP_URL || "http://localhost:3001").origin;
async function run(
  work: () => Promise<FormState & { path?: string }>,
): Promise<FormState> {
  let result;
  try {
    result = await work();
  } catch (e) {
    return {
      error:
        e instanceof ConvexError
          ? String(e.data)
          : "The action could not be completed. Check the input and integration setup, then try again.",
    };
  }
  revalidatePath("/app", "layout");
  if (result.path) redirect(result.path);
  return result;
}
export async function createOrganization(_: FormState, d: FormData) {
  return run(async () => {
    const c = await backend();
    const id = await c.mutation(api.organizations.create, {
      name: val(d, "name"),
    });
    return { path: `/app/${id}${continuation(d)}` };
  });
}
export async function createPrivateLibrary(_: FormState, d: FormData) {
  return run(async () => {
    const id = await (
      await backend()
    ).mutation(api.organizations.createPrivate, {});
    return {
      path: `/app/${id}${continuation(d)}`,
    };
  });
}
export async function saveProject(_: FormState, d: FormData) {
  return run(async () => {
    const c = await backend();
    await c.mutation(api.projects.save, {
      organizationId: org(d),
      id: val(d, "id") ? (val(d, "id") as Id<"projects">) : undefined,
      name: val(d, "name"),
      description: val(d, "description"),
    });
    return { path: `/app/${org(d)}` };
  });
}
export async function removeProject(_: FormState, d: FormData) {
  return run(async () => {
    const c = await backend();
    if (val(d, "confirmation") !== "DELETE")
      return { error: "Type DELETE to confirm." };
    await c.mutation(api.projects.remove, {
      organizationId: org(d),
      id: val(d, "id") as Id<"projects">,
    });
    return { path: `/app/${org(d)}` };
  });
}
export async function renameOrganization(_: FormState, d: FormData) {
  return run(async () => {
    await (
      await backend()
    ).mutation(api.organizations.rename, {
      organizationId: org(d),
      name: val(d, "name"),
    });
    return { message: "Organization name updated." };
  });
}
export async function changeMember(_: FormState, d: FormData) {
  return run(async () => {
    const role = val(d, "role");
    if (!["owner", "admin", "member", "viewer", "remove"].includes(role))
      return { error: "Choose a role." };
    await (
      await backend()
    ).mutation(api.organizations.changeMember, {
      organizationId: org(d),
      membershipId: val(d, "membershipId") as Id<"memberships">,
      role: role as "owner" | "admin" | "member" | "viewer" | "remove",
    });
    return { message: "Membership updated." };
  });
}
export async function inviteMember(_: FormState, d: FormData) {
  return run(async () => {
    const role = val(d, "role");
    if (role !== "admin" && role !== "member" && role !== "viewer")
      return { error: "Choose a role." };
    const token = randomBytes(32).toString("hex");
    await (
      await backend()
    ).mutation(api.organizations.invite, {
      organizationId: org(d),
      email: val(d, "email"),
      role,
      tokenHash: createHash("sha256").update(token).digest("hex"),
    });
    const origin = process.env.APP_URL || "http://localhost:3001";
    return {
      message:
        "Invitation created. Share this link privately with the invited person. No email was sent.",
      link: `${origin}/join/${token}`,
    };
  });
}
export async function revokeInvite(_: FormState, d: FormData) {
  return run(async () => {
    await (
      await backend()
    ).mutation(api.organizations.revokeInvite, {
      organizationId: org(d),
      id: val(d, "invitationId") as Id<"invitations">,
    });
    return { message: "Invitation revoked." };
  });
}
export async function acceptInvite(_: FormState, d: FormData) {
  return run(async () => {
    const token = val(d, "token");
    if (!/^[a-f0-9]{64}$/.test(token)) return { error: "Invalid invitation." };
    const id = await (
      await backend()
    ).mutation(api.organizations.acceptInvite, {
      tokenHash: createHash("sha256").update(token).digest("hex"),
    });
    return { path: `/app/${id}` };
  });
}
export async function startCheckout(_: FormState, d: FormData) {
  return run(async () => {
    const url = await (
      await backend()
    ).action(api.payments.checkout, { organizationId: org(d) });
    return { path: url };
  });
}
export async function billingPortal(_: FormState, d: FormData) {
  return run(async () => ({
    path: await (
      await backend()
    ).action(api.payments.portal, { organizationId: org(d) }),
  }));
}
export async function refreshBilling(_: FormState, d: FormData) {
  return run(async () => {
    await (
      await backend()
    ).action(api.payments.refreshBilling, { organizationId: org(d) });
    return { message: "Billing refreshed from Stripe." };
  });
}
export async function deleteOrganization(_: FormState, d: FormData) {
  return run(async () => {
    await (
      await backend()
    ).mutation(api.organizations.remove, {
      organizationId: org(d),
      confirmation: val(d, "confirmation"),
    });
    // /app provisions a default workspace. Stay in management after deletion
    // so removing the last workspace does not create another one immediately.
    return { path: "/app/workspaces" };
  });
}
export async function deleteAccount(_: FormState, d: FormData) {
  const result = await run(async () => {
    await (
      await backend()
    ).mutation(api.accounts.deleteAccount, {
      confirmation: val(d, "confirmation"),
    });
    return {
      message: "Account access is locked. Identity deletion is processing.",
    };
  });
  if (!result.error) {
    // Identity deletion also revokes provider sessions. Do not send the user
    // to a provider logout endpoint for a session that may already be gone.
    (await cookies()).delete(process.env.WORKOS_COOKIE_NAME || "wos-session");
    redirect("/");
  }
  return result;
}
export async function logout() {
  await signOut({ returnTo: signOutUrl() });
}
