import "server-only";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { publicSlug } from "./public-knowledge-display";

export function publicWebClient() {
  if (process.env.PUBLIC_KNOWLEDGE_WEB_ENABLED !== "true") return null;
  const value = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".convex.cloud") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    // Deliberately anonymous: no cookie, WorkOS session or bearer credential.
    return new ConvexHttpClient(value, {
      logger: false,
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    });
  } catch {
    return null;
  }
}
export async function readPublicEdition(slug: string) {
  if (!publicSlug(slug)) return { state: "missing" as const, data: null };
  const client = publicWebClient();
  if (!client) return { state: "pending" as const, data: null };
  try {
    const data = await client.query(api.publicKnowledge.readEdition, { slug });
    return { state: data ? ("ready" as const) : ("missing" as const), data };
  } catch {
    return { state: "unavailable" as const, data: null };
  }
}
export async function readPublicCollection(slug: string) {
  if (!publicSlug(slug)) return { state: "missing" as const, data: null };
  const client = publicWebClient();
  if (!client) return { state: "pending" as const, data: null };
  try {
    const data = await client.query(api.publicKnowledge.readCollection, {
      slug,
    });
    return { state: data ? ("ready" as const) : ("missing" as const), data };
  } catch {
    return { state: "unavailable" as const, data: null };
  }
}
export async function discoverPublic(topic: string, cursor: string | null) {
  const client = publicWebClient();
  if (!client) return { state: "pending" as const, data: null };
  if (topic.length > 48 || (cursor && cursor.length > 2048))
    return { state: "unavailable" as const, data: null };
  try {
    const data = await client.query(api.publicKnowledge.discover, {
      ...(topic ? { topic } : {}),
      cursor,
    });
    return { state: "ready" as const, data };
  } catch {
    return { state: "unavailable" as const, data: null };
  }
}
