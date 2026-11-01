import { z } from "zod";

export const onboardingInterests = [
  { id: "coding", label: "Development", description: "Build better software" },
  { id: "ai", label: "AI & tools", description: "Find your next useful tool" },
  {
    id: "product_design",
    label: "Design & UX",
    description: "Make products feel better",
  },
  {
    id: "marketing",
    label: "Growth & marketing",
    description: "Reach the right people",
  },
  {
    id: "business_operations",
    label: "Building a business",
    description: "Turn ideas into progress",
  },
  {
    id: "video_editing",
    label: "Content & video",
    description: "Create things worth sharing",
  },
] as const;
export const interestId = z.enum(onboardingInterests.map((item) => item.id));
export const onboardingDraft = z
  .object({
    version: z.literal(1),
    interests: z
      .array(interestId)
      .min(1)
      .max(3)
      .refine((values) => new Set(values).size === values.length),
    goal: z.enum([
      "improve_product",
      "grow_business",
      "build_faster",
      "find_ideas",
    ]),
    team: z.boolean().optional(),
    importRequested: z.boolean().optional(),
    selectedFamilyId: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{8,100}$/)
      .optional(),
  })
  .strict();
export type OnboardingDraft = z.infer<typeof onboardingDraft>;
export const draftStorageKey = "vibescroll.onboarding.v1";
export const starterSelection = z
  .array(
    z.object({
      familyId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
      interests: z.array(interestId).min(1).max(6),
      reviewReference: z.string().min(8).max(300),
    }),
  )
  .max(18);

// Used by both the Next adapter and Convex. Tokens never contain provider credentials.
export async function signOnboardingValue(value: unknown, secret: string) {
  if (secret.length < 32) throw Error("Onboarding signing is not configured.");
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const body = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  return `${body}.${Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
export async function readOnboardingValue(
  token: string,
  secret: string,
): Promise<unknown> {
  if (secret.length < 32 || token.length > 6000) return null;
  try {
    const [body, signature, extra] = token.split(".");
    if (extra || !body || !/^[a-f0-9]{64}$/.test(signature ?? "")) return null;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      Uint8Array.from(signature.match(/../g)!, (part) => parseInt(part, 16)),
      new TextEncoder().encode(body),
    );
    if (!valid) return null;
    return JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(body.replaceAll("-", "+").replaceAll("_", "/")),
          (char) => char.charCodeAt(0),
        ),
      ),
    );
  } catch {
    return null;
  }
}
export const previewClaim = z
  .object({
    version: z.literal(1),
    familyId: z.string().min(8).max(100),
    kind: z.enum(["detail", "thumbnail"]),
    session: z.string().uuid(),
    expiresAt: z.number().int().positive(),
  })
  .strict();
export function starterScore(interests: string[], selected: string[]) {
  return interests.filter((interest) => selected.includes(interest)).length;
}
