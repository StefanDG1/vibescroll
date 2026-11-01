"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { discoverRepositories } from "../packages/providers/github-discovery";
import { github } from "../packages/providers/github";
import { decrypt, encrypt } from "../packages/providers/secrets";
import { ensure } from "../packages/policy";
import {
  decodeGitHubCredential,
  githubRefreshRequired,
  refreshGitHubCredential,
  githubCredential,
  type GitHubUserCredential,
} from "../packages/providers/github-user";
export const complete = action({
  args: {
    organizationId: v.id("organizations"),
    state: v.string(),
    code: v.string(),
  },
  handler: async (ctx, a): Promise<void> => {
    const { actor } = await ctx.runQuery(api.onboarding.authorizeGitHub, {
      organizationId: a.organizationId,
    });
    await ctx.runMutation(internal.githubLinks.consume, {
      organizationId: a.organizationId,
      state: a.state,
      actor: actor._id,
    });
    ensure(
      process.env.GITHUB_APP_CLIENT_ID &&
        process.env.GITHUB_APP_CLIENT_SECRET &&
        /^\d+$/.test(process.env.GITHUB_APP_ID ?? ""),
      "SETUP_REQUIRED",
      "Configure GitHub OAuth.",
    );
    const issuedAt = Date.now();
    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_APP_CLIENT_ID,
          client_secret: process.env.GITHUB_APP_CLIENT_SECRET,
          code: a.code,
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    const token = await response.json();
    ensure(
      response.ok && token.access_token,
      "FORBIDDEN",
      "GitHub authorization was not completed.",
    );
    const user = await github("/user", token.access_token);
    const installations = await discoverRepositories(token.access_token);
    await ctx.runMutation(internal.jobs.storeSecret, {
      organizationId: a.organizationId,
      provider: "github",
      ...encrypt(
        JSON.stringify(githubCredential(token, user.id, issuedAt)),
        a.organizationId,
        "github",
      ),
    });
    await ctx.runMutation(internal.githubLinks.save, {
      organizationId: a.organizationId,
      githubUserId: user.id,
      installations,
    });
  },
});

export const refreshChoices = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, a): Promise<void> => {
    await ctx.runQuery(api.onboarding.authorizeGitHub, a);
    let row = await ctx.runQuery(internal.jobs.secret, {
      ...a,
      provider: "github",
    });
    ensure(row?.status === "connected", "FORBIDDEN", "Reconnect GitHub.");
    let credential = decodeGitHubCredential(
      decrypt(row.ciphertext, row.keyVersion, a.organizationId, "github"),
    );
    if (githubRefreshRequired(credential)) {
      const leaseKey = crypto.randomUUID();
      await ctx.runMutation(internal.githubLinks.claimRefresh, {
        id: row._id,
        previous: row.ciphertext,
        leaseKey,
      });
      try {
        const renewed = await refreshGitHubCredential(
          credential as GitHubUserCredential,
        );
        const user = await github("/user", renewed.accessToken);
        ensure(
          user.id === renewed.githubUserId,
          "FORBIDDEN",
          "GitHub identity changed.",
        );
        const saved = await ctx.runMutation(
          internal.githubLinks.finishRefresh,
          {
            id: row._id,
            previous: row.ciphertext,
            leaseKey,
            ...encrypt(JSON.stringify(renewed), a.organizationId, "github"),
          },
        );
        ensure(saved, "FORBIDDEN", "GitHub connection changed.");
        credential = renewed;
      } catch (error) {
        await ctx.runMutation(internal.githubLinks.failRefresh, {
          id: row._id,
          previous: row.ciphertext,
          leaseKey,
        });
        throw error;
      }
    }
    const user = await github("/user", credential.accessToken);
    const installations = await discoverRepositories(credential.accessToken);
    await ctx.runMutation(internal.githubLinks.save, {
      ...a,
      githubUserId: user.id,
      installations,
    });
  },
});
