import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance as realPerformance } from "node:perf_hooks";
import { api, internal } from "../convex/_generated/api";
import { getProfile, fetch as fetchKnowledge } from "../convex/assistant";
import { prepared, scopes } from "./chat-proposal-fixture";
import {
  knowledgeFetchLegacyOutput,
  knowledgeFetchOutput,
  knowledgeFetchMcpOutput,
  knowledgeFetchStructuredOutput,
  knowledgeReadCitationOutput,
  knowledgeSearchOutput,
  profileReadOutput,
} from "../packages/contracts/knowledge-read";
import {
  chatProposalListOutput,
  chatProposalReadOutput,
  chatProposalSaveOutput,
} from "../packages/contracts/chat-proposals";
import { preparedStatusOutput } from "../packages/contracts/prepared-service";
import { typedCitationSummary } from "../packages/sources/citations";
import { socialCitation } from "../packages/social/analysis";
import type { EvidenceRecord } from "../packages/sources/types";
import type { SocialEvidence } from "../packages/social/contracts";
import { createKnowledgeHandler } from "../packages/mcp/server";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error(
        "Read contract fixtures must not contact a network or provider.",
      );
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

it("checks list, detail, discovery, search, write and status fixtures against their actual authorized serializers", async () => {
  const f = await prepared();
  const saved = await f.save();
  expect(chatProposalSaveOutput.parse(saved)).toEqual(saved);
  const detail = await f.assistant.query(internal.assistantProposals.read, {
    proposalId: saved.proposalId,
  });
  expect(chatProposalReadOutput.parse(detail)).toEqual(detail);
  const examples: Record<string, unknown> = {
    proposalSave: saved,
    proposalDetail: detail,
  };
  for (const mode of ["summary", "full"] as const) {
    const profile = await f.assistant.query(internal.assistant.getProfile, {
      profileId: f.org,
      detail: mode,
    });
    expect(profileReadOutput.parse(profile)).toEqual(profile);
    examples[`profile_${mode}`] = profile;
    const list = await f.assistant.query(internal.assistantProposals.list, {
      profileId: f.org,
      detail: mode,
    });
    expect(chatProposalListOutput.parse(list)).toEqual(list);
    examples[`proposalList_${mode}`] = list;
  }
  const legacy = await f.assistant.query(internal.assistant.fetch, {
    profileId: f.org,
    id: f.sourceId,
  });
  const structured = await f.assistant.query(internal.assistant.fetch, {
    profileId: f.org,
    id: f.sourceId,
    format: "structured_v1",
  });
  if (structured.format === "post_context_v1")
    throw Error("Expected structured_v1");
  expect(knowledgeFetchLegacyOutput.parse(legacy)).toEqual(legacy);
  expect(knowledgeFetchStructuredOutput.parse(structured)).toEqual(structured);
  expect(knowledgeFetchOutput.parse(legacy)).toEqual(legacy);
  expect(knowledgeFetchOutput.parse(structured)).toEqual(structured);
  expect(knowledgeFetchMcpOutput.parse(legacy)).toEqual(legacy);
  expect(knowledgeFetchMcpOutput.parse(structured)).toEqual(structured);
  expect(
    knowledgeFetchMcpOutput.safeParse({ ...legacy, format: "structured_v1" })
      .success,
  ).toBe(false);
  expect(
    knowledgeFetchMcpOutput.safeParse({
      ...legacy,
      analysis: structured.analysis,
    }).success,
  ).toBe(false);
  expect(structured.analysis).toEqual(JSON.parse(legacy.text));
  examples.fetchLegacy = legacy;
  examples.fetchStructured = structured;
  for (const query of ["evidence", "no-matching-idea"]) {
    const search = await f.assistant.query(internal.assistant.search, {
      profileId: f.org,
      query,
    });
    expect(knowledgeSearchOutput.parse(search)).toEqual(search);
    examples[query === "evidence" ? "searchMatch" : "searchEmpty"] = search;
  }
  const status = await f.owner.query(api.preparedService.status, {
    sourceId: f.sourceId,
  });
  expect(preparedStatusOutput.parse(status)).toEqual(status);
  expect(status).toMatchObject({
    state: "ready",
    chargedCredits: null,
    billingState: "not_applicable",
  });
  examples.preparedStatus = status;
  expect(
    knowledgeFetchStructuredOutput.safeParse({
      ...structured,
      transcript: "PRIVATE",
    }).success,
  ).toBe(false);
  expect(
    chatProposalListOutput.safeParse({
      items: [],
      next_cursor: null,
      examined: 0,
      has_more: false,
      exhausted: true,
      coverage: "fixture",
      bearer: "PRIVATE",
    }).success,
  ).toBe(false);
  const substitutions = [
    [f.org, "synthetic_profile"],
    [f.projectId, "synthetic_project"],
    [f.sourceId, "synthetic_source"],
    [f.versionId, "synthetic_analysis_version"],
    [saved.proposalId, "synthetic_proposal"],
    [saved.contextHash, "c".repeat(64)],
  ];
  const publicExamples = JSON.parse(
    JSON.stringify(
      {
        schemaVersion: "mcp-public-output-examples-v1",
        notice:
          "Synthetic authorized serializer fixtures. IDs and context hashes are placeholders, not usable records or authority. A nullable charge must be interpreted with billingState.",
        examples,
      },
      (_key, value) =>
        typeof value === "string"
          ? substitutions.reduce(
              (text, [from, to]) => text.replaceAll(from, to),
              value,
            )
          : value,
    ),
  );
  const examplePath = resolve("docs/developers/examples.json");
  if (process.env.VIBE_WRITE_READ_EXAMPLES === "1")
    writeFileSync(
      examplePath,
      JSON.stringify(publicExamples, null, 2) + "\n",
      "utf8",
    );
  expect(JSON.parse(readFileSync(examplePath, "utf8"))).toEqual(publicExamples);
});

it("checks each typed citation serializer variant and rejects raw evidence or asset capabilities", () => {
  const common = {
    id: "citation",
    excerpt: "PRIVATE EXCERPT",
    excerptHash: "a".repeat(64),
    canonicalUrl: "https://example.test/source",
    observedAt: Date.now(),
  };
  const records: EvidenceRecord[] = [
    {
      ...common,
      kind: "github_file",
      repositoryId: 42,
      repository: "example/project",
      commitSha: "b".repeat(40),
      path: "README.md",
      startLine: 1,
      endLine: 2,
    },
    {
      ...common,
      kind: "supplied_text",
      originalUrl: null,
      startOffset: 0,
      endOffset: 10,
      provenance: "user_supplied_unverified",
    },
    ...(["reddit_post", "reddit_comment"] as const).map((kind) => ({
      ...common,
      kind,
      postId: "post",
      itemId: "item",
      parentId: null,
      author: "synthetic",
      role: "commenter" as const,
      availability: "available" as const,
      createdAt: null,
      editedAt: null,
    })),
  ];
  const media = {
    id: "citation",
    assetId: "asset",
    assetIndex: 0,
    postRevisionHash: "a".repeat(64),
    text: "PRIVATE TRANSCRIPT",
    textHash: "b".repeat(64),
    uncertainty: "",
  };
  const observations: SocialEvidence[] = [
    {
      ...media,
      kind: "image_observation",
      basis: "visible",
      crop: { x: 0, y: 0, width: 1, height: 1 },
    },
    {
      ...media,
      kind: "video_observation",
      basis: "transcript",
      startMs: 0,
      endMs: 1000,
    },
  ];
  const citations = [
    ...records.map((record) =>
      typedCitationSummary(
        { id: record.id, kind: record.kind, startMs: null, endMs: null },
        [record],
      ),
    ),
    ...observations.map((record) =>
      socialCitation(
        {
          id: record.id,
          kind: record.kind,
          startMs: record.kind === "video_observation" ? record.startMs : null,
          endMs: record.kind === "video_observation" ? record.endMs : null,
        },
        [record],
      ),
    ),
    { kind: "legacy_frame", startMs: 0, endMs: 1000 },
  ];
  for (const citation of citations) {
    expect(knowledgeReadCitationOutput.parse(citation)).toEqual(citation);
    expect(JSON.stringify(citation)).not.toContain("PRIVATE");
    for (const extra of [
      { excerpt: "PRIVATE" },
      { text: "PRIVATE" },
      { objectKey: "PRIVATE" },
      { url: "https://example.test/private-asset" },
    ])
      expect(
        knowledgeReadCitationOutput.safeParse({ ...citation, ...extra })
          .success,
      ).toBe(false);
  }
});

type Fixture = Awaited<ReturnType<typeof prepared>>;
async function countedRead(f: Fixture, definition: unknown, args: unknown) {
  const counters = {
    getInvocations: 0,
    queryInvocations: 0,
    queriedTables: {} as Record<string, number>,
  };
  const started = realPerformance.now();
  const result = await f.assistant.run(async (ctx) => {
    const db = new Proxy(ctx.db, {
      get(target, property) {
        if (property === "get")
          return (...values: unknown[]) => {
            counters.getInvocations++;
            return Reflect.apply(target.get, target, values);
          };
        if (property === "query")
          return (table: string) => {
            counters.queryInvocations++;
            counters.queriedTables[table] =
              (counters.queriedTables[table] ?? 0) + 1;
            return target.query(table as never);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    return (
      definition as {
        _handler: (
          ctx: unknown,
          args: unknown,
        ) => Promise<Record<string, unknown>>;
      }
    )._handler({ ...ctx, db }, args);
  });
  return {
    result,
    counters,
    syntheticDurationMs: realPerformance.now() - started,
  };
}

async function presentationBytes(
  name: string,
  args: Record<string, unknown>,
  value: Record<string, unknown>,
) {
  const handler = createKnowledgeHandler(async () => ({
    ok: true,
    status: 200,
    value,
  }));
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name,
      arguments: args,
      _meta: {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": {
          name: "Synthetic baseline",
          version: "1",
        },
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    },
  };
  const response = await handler.fetch(
    new Request("https://example.test/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": "tools/call",
        "mcp-name": name,
      },
      body: JSON.stringify(body),
    }),
    {
      parsedBody: body,
      authInfo: {
        token: "synthetic-fixture-only",
        clientId: "synthetic",
        scopes,
        resource: new URL("https://example.test/mcp"),
      },
    },
  );
  const text = await response.text();
  const packet = JSON.parse(text);
  expect(packet.result.isError).not.toBe(true);
  expect(packet.result.structuredContent).toEqual(value);
  return {
    mcpToolResultBytes: bytes(packet.result),
    mcpHttpBodyBytes: new TextEncoder().encode(text).byteLength,
  };
}

it("measures exact UTF-8 synthetic response bytes and bounded query invocations without claiming database bandwidth or host tokens", async () => {
  const f = await prepared();
  await f.t.run((ctx) =>
    ctx.db.patch(f.projectId, {
      profile: "A synthetic software project with a testing workflow. ".repeat(
        100,
      ),
    }),
  );
  const fullProfile = await countedRead(f, getProfile, {
    profileId: f.org,
    detail: "full",
  });
  const summaryProfile = await countedRead(f, getProfile, {
    profileId: f.org,
    detail: "summary",
  });
  profileReadOutput.parse(fullProfile.result);
  profileReadOutput.parse(summaryProfile.result);
  expect(summaryProfile.counters.queriedTables.knowledgeEvaluations ?? 0).toBe(
    0,
  );
  expect(fullProfile.counters.queriedTables.knowledgeEvaluations).toBe(1);
  const legacy = await countedRead(f, fetchKnowledge, {
    profileId: f.org,
    id: f.sourceId,
    format: "legacy",
  });
  const structured = await countedRead(f, fetchKnowledge, {
    profileId: f.org,
    id: f.sourceId,
    format: "structured_v1",
  });
  knowledgeFetchOutput.parse(legacy.result);
  knowledgeFetchOutput.parse(structured.result);
  expect(structured.counters).toEqual(legacy.counters);
  const measurements = await Promise.all(
    [
      [
        "profile_full",
        "get_profile",
        { profileId: f.org, detail: "full" },
        fullProfile,
      ],
      [
        "profile_summary",
        "get_profile",
        { profileId: f.org, detail: "summary" },
        summaryProfile,
      ],
      [
        "fetch_legacy",
        "fetch",
        { profileId: f.org, id: f.sourceId, format: "legacy" },
        legacy,
      ],
      [
        "fetch_structured_v1",
        "fetch",
        { profileId: f.org, id: f.sourceId, format: "structured_v1" },
        structured,
      ],
    ].map(async ([scenario, operation, args, read]) => {
      const measured = read as typeof fullProfile;
      return {
        scenario,
        backendResponseBytes: bytes(measured.result),
        ...(await presentationBytes(
          operation as string,
          args as Record<string, unknown>,
          measured.result,
        )),
        counters: measured.counters,
        syntheticDurationMs: measured.syntheticDurationMs,
      };
    }),
  );
  expect(bytes(summaryProfile.result)).toBeLessThan(bytes(fullProfile.result));
  const receipt = {
    schemaVersion: "mcp-read-synthetic-baseline-v1",
    measuredAt: "2026-11-01",
    environment:
      "local convex-test and synthetic MCP handler; no provider/model/network calls",
    fixture: `One authorized profile and project, a ${"A synthetic software project with a testing workflow. ".repeat(100).length}-character synthetic profile, one retained insight and metadata-only citations.`,
    units: {
      responseBytes:
        "Exact UTF-8 serialized bytes. Backend excludes HTTP framing; MCP tool result excludes JSON-RPC; MCP HTTP body includes JSON-RPC.",
      counters:
        "Instrumented db.get/db.query invocations, not returned rows, database read bytes or billed usage.",
      timing:
        "Single local synthetic query duration; import/cache/hardware effects apply. No production latency or percentile claim.",
    },
    databaseBandwidth: "unmeasured",
    billedPlatformUsage: "unmeasured",
    providerCost: "no provider dispatch",
    hostModelTokens: "unavailable",
    measurements,
  };
  if (process.env.VIBE_WRITE_READ_BASELINE === "1") {
    const directory = resolve("outputs");
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      resolve(directory, "mcp-read-baseline-20261101.json"),
      JSON.stringify(receipt, null, 2) + "\n",
      "utf8",
    );
  }
});
