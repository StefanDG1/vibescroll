import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getFunctionName } from "convex/server";
import { saveProjectProposalInput } from "../../../packages/contracts/chat-proposals";
import { containsSecret } from "../../../packages/policy";
import { classifySourceUrl } from "../../../packages/sources/classify";
import { suggestProjects } from "./project-suggestions";
import { postDisplayTitle } from "../../../packages/sources/display";
import { notificationSourceId } from "./work-presentation";

// The browser capture keeps the existing workspace response fields. The local
// adapter projects those records through the same application read paths.
type Row = Record<string, any>;
type Snapshot = {
  organizationId: string;
  workspaceName: string;
  privateLibrary: boolean;
  capturedAt: string;
  posts: Row[];
  library: Row[];
  sources: Record<string, Row>;
  repositories: Row[];
  projects?: Row[];
  proposals: Row[];
  runs: Row[];
  notifications: Row[];
  connections: Row[];
  categories: Row[];
  evidenceCount: number;
};

async function snapshotDirectory() {
  if (!process.env.LOCALAPPDATA) throw new Error("LOCALAPPDATA is required.");
  const root = join(process.env.LOCALAPPDATA, "VibeScroll", "ui-snapshot");
  const id = (await readFile(join(root, "current.txt"), "utf8")).trim();
  if (!/^\d{8}T\d{6}Z$/.test(id))
    throw new Error("Invalid snapshot directory.");
  return join(root, id);
}

let diskSnapshot: { directory: string; value: Promise<Snapshot> } | undefined;
export async function readLocalSnapshot(): Promise<Snapshot> {
  return readSnapshot(await snapshotDirectory());
}

async function readSnapshot(dir: string): Promise<Snapshot> {
  if (diskSnapshot?.directory !== dir) {
    const value = readFile(join(dir, "data.json"), "utf8").then(
      (raw): Snapshot => JSON.parse(raw),
    );
    diskSnapshot = { directory: dir, value };
    void value.catch(() => {
      if (diskSnapshot?.value === value) diskSnapshot = undefined;
    });
  }
  const [snapshot, drafts, captures, projects] = await Promise.all([
    diskSnapshot.value,
    readLocalRows(dir, "drafts"),
    readLocalRows(dir, "captures"),
    readLocalRows(dir, "projects"),
  ]);
  return {
    ...snapshot,
    posts: [
      ...captures.map((source) => ({
        id: source._id,
        title: source.title,
        authorName: null,
        kind: source.kind,
        createdAt: source.createdAt,
        generation: source.generation,
        state: source.state,
        metadataUpdatedAt: source.updatedAt,
        thumbnailAssetIds: [],
      })),
      ...snapshot.posts,
    ],
    library: [
      ...captures.map(({ text: _text, key: _key, ...summary }) => summary),
      ...snapshot.library,
    ],
    sources: {
      ...snapshot.sources,
      ...Object.fromEntries(captures.map((source) => [source._id, source])),
    },
    proposals: [...drafts, ...snapshot.proposals],
    projects: [...projects, ...(snapshot.projects ?? [])],
  };
}

async function readLocalRows(
  dir: string,
  table: "drafts" | "captures" | "projects",
): Promise<Row[]> {
  try {
    return JSON.parse(await readFile(join(dir, `${table}.json`), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

let projectQueue = Promise.resolve();
function changeLocalProject(operation: "save" | "remove", args: Row) {
  const write = projectQueue.then(async () => {
    const dir = await snapshotDirectory();
    const [snapshot, localProjects] = await Promise.all([
      readSnapshot(dir),
      readLocalRows(dir, "projects"),
    ]);
    if (args.organizationId !== snapshot.organizationId)
      throw new Error("Workspace unavailable.");
    const projectId =
      typeof args.id === "string" ? args.id : randomUUID().replaceAll("-", "");
    const existing = localProjects.find((project) => project._id === projectId);
    if ((operation === "remove" || args.id !== undefined) && !existing)
      throw new Error("Project unavailable for editing.");
    const otherProjects = localProjects.filter((project) => project._id !== projectId);
    if (operation === "save") {
      const name = typeof args.name === "string" ? args.name.trim() : "";
      const description = args.description;
      if (!name || name.length > 80 || typeof description !== "string" || description.length > 2000)
        throw new Error("Enter a project name of up to 80 characters and a description of up to 2,000.");
      const now = Date.now();
      otherProjects.unshift({
        _id: projectId,
        organizationId: snapshot.organizationId,
        name,
        description,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
    }
    const temporary = join(dir, "projects.tmp");
    await writeFile(temporary, JSON.stringify(otherProjects), "utf8");
    await rename(temporary, join(dir, "projects.json"));
    return projectId;
  });
  projectQueue = write.then(() => {}, () => {});
  return write;
}

let draftQueue = Promise.resolve();
function localDraft(args: Row, proposal: Row) {
  const write = draftQueue.then(async () => {
    const dir = await snapshotDirectory();
    const drafts = await readLocalRows(dir, "drafts");
    const proposalId = createHash("sha256")
      .update(args.key)
      .digest("hex")
      .slice(0, 32);
    if (!drafts.some((item) => item._id === proposalId)) {
      const tmp = join(dir, "drafts.tmp");
      await writeFile(
        tmp,
        JSON.stringify([{ ...proposal, _id: proposalId }, ...drafts]),
        "utf8",
      );
      await rename(tmp, join(dir, "drafts.json"));
    }
    return { proposalId };
  });
  draftQueue = write.then(
    () => {},
    () => {},
  );
  return write;
}

let captureQueue = Promise.resolve();
function localCapture(args: Row) {
  const write = captureQueue.then(async () => {
    if (
      args.rightsAttested !== true ||
      typeof args.key !== "string" ||
      args.key.length < 8 ||
      args.key.length > 100 ||
      typeof args.title !== "string" ||
      !args.title.trim() ||
      args.title.length > 160
    )
      throw new Error("Enter a title and confirm you may submit this post.");
    if (args.kind !== "url" && args.kind !== "text")
      throw new Error("Upload is unavailable. Save a link or add a transcript.");

    const dir = await snapshotDirectory();
    const snapshot = await readSnapshot(dir);
    if (args.organizationId !== snapshot.organizationId)
      throw new Error("Workspace unavailable.");
    const text = typeof args.text === "string" ? args.text.trim() : "";
    if (args.kind === "text" && (!text || text.length > 60000 || containsSecret(text)))
      throw new Error("Enter a transcript under 60,000 characters without credentials.");
    let classified: ReturnType<typeof classifySourceUrl> | undefined;
    if (args.kind === "url") {
      try {
        classified = classifySourceUrl(String(args.url ?? "").trim());
      } catch {
        throw new Error("Enter a supported post or repository link.");
      }
    }
    const canonical =
      classified?.canonical ??
      `text:${createHash("sha256").update(text).digest("hex")}`;
    const existing = Object.values(snapshot.sources).find(
      (row) => row.key === args.key || row.canonical === canonical || row.url === canonical,
    ) ?? snapshot.library.find(
      (row) => row.canonical === canonical || row.url === canonical,
    );
    if (existing) return existing._id;
    const now = Date.now();
    const sourceId = createHash("sha256")
      .update(`${snapshot.organizationId}:${canonical}`)
      .digest("hex")
      .slice(0, 32);
    const entry = {
      _id: sourceId,
      key: args.key,
      organizationId: snapshot.organizationId,
      title: args.title.trim(),
      kind: args.kind,
      sourceType: classified?.sourceType ?? "supplied_text",
      canonical,
      rightsAttested: true,
      ...(classified ? { url: canonical } : { text }),
      coverage: classified ? "metadata_only" : "caption_only",
      state: classified?.sourceType === "media" ? "needs_upload" : "saved",
      tags: [],
      assets: [],
      thumbnailAssetIds: [],
      insightCount: 0,
      generation: 0,
      createdAt: now,
      updatedAt: now,
    };
    const previous = await readLocalRows(dir, "captures");
    const tmp = join(dir, "captures.tmp");
    await writeFile(tmp, JSON.stringify([entry, ...previous]), "utf8");
    await rename(tmp, join(dir, "captures.json"));
    return sourceId;
  });
  captureQueue = write.then(
    () => {},
    () => {},
  );
  return write;
}

function planningContext(data: Snapshot, args: Row) {
  const source = Object.hasOwn(data.sources, args.sourceId)
    ? data.sources[args.sourceId]
    : undefined;
  const project = data.repositories.find(
    (p) =>
      p._id === args.projectId &&
      p.enabled &&
      p.confirmed &&
      p.status === "connected",
  );
  const insights = source?.analysis?.insights;
  if (
    !source ||
    !project ||
    source.analysisVersion?.id !== args.analysisVersionId ||
    !insights?.length
  )
    throw new Error("Choose a saved post and a confirmed project.");
  const contextHash = createHash("sha256")
    .update(
      JSON.stringify([
        source._id,
        args.analysisVersionId,
        project._id,
        project.profileVersion,
      ]),
    )
    .digest("hex");
  return { source: { insights }, project, contextHash };
}

export async function readLocalEvidence(reference: string) {
  const name = createHash("sha256").update(reference).digest("hex") + ".jpg";
  return readFile(join(await snapshotDirectory(), "evidence", name));
}

function page(items: Row[], args: Row, size: number) {
  const offset = args.cursor ? Number(args.cursor) : 0;
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new Error("Invalid cursor.");
  return {
    items: items.slice(offset, offset + size),
    next: offset + size < items.length ? String(offset + size) : null,
  };
}

const likes = new Map<string, { liked: boolean; revision: number }>();

function engagement(id: string) {
  const reaction = likes.get(id) ?? { liked: false, revision: 0 };
  return {
    ...reaction,
    scopeKey: id,
    likes: Number(reaction.liked),
    shares: 0,
  };
}

export async function localSnapshotClient() {
  const data = await readLocalSnapshot();
  const belongs = (id: string) => Object.hasOwn(data.sources, id);
  const source = (id: string): Row => {
    const summary = data.library.find((post) => post._id === id);
    if (!summary && !belongs(id)) throw new Error("Post unavailable.");
    return {
      ...summary,
      ...(belongs(id) ? data.sources[id] : null),
      proposals: data.proposals.filter((proposal) => proposal.sourceId === id),
    };
  };
  const workspace = {
    name: data.workspaceName,
    role: "owner",
    private: data.privateLibrary,
  };
  const basic = {
    role: workspace.role,
    workspaceName: workspace.name,
    privateLibrary: workspace.private,
  };
  const checkScope = (args: Row) => {
    if (
      args.organizationId !== undefined &&
      args.organizationId !== data.organizationId
    )
      throw new Error("Workspace unavailable.");
  };

  function library(args: Row) {
    const query = String(args.query ?? "")
      .trim()
      .toLowerCase();
    const terms = query.split(/\s+/).filter(Boolean);
    const filtered = data.library.filter((post) => {
      const haystack = [
        post.title,
        post.summary,
        post.linkPreview?.authorName,
        ...(post.tags ?? []),
        ...(post.mainPoints ?? []),
        ...(data.sources[post._id]?.analysis?.insights ?? []).flatMap(
          (i: Row) => [i.title, i.claim],
        ),
      ]
        .join(" ")
        .toLowerCase();
      return (
        terms.every((term) => haystack.includes(term)) &&
        (!args.category || (post.categoryKeys ?? []).includes(args.category)) &&
        (!args.state ||
          post.state === args.state ||
          (args.state === "not_analyzed" &&
            ["new", "saved", "needs_upload"].includes(post.state)) ||
          (args.state === "in_progress" &&
            ["queued", "processing"].includes(post.state)))
      );
    });
    if (args.sort === "title")
      filtered.sort((a, b) => String(a.title).localeCompare(String(b.title)));
    const sortField = {
      oldest: "createdAt",
      updated: "updatedAt",
      saved: "originalSavedAt",
      published: "publishedAt",
    }[args.sort as string];
    if (sortField)
      filtered.sort((a, b) =>
        args.sort === "oldest"
          ? a[sortField] - b[sortField]
          : (b[sortField] ?? 0) - (a[sortField] ?? 0),
      );
    return { ...page(filtered, args, 30), total: filtered.length };
  }

  const read = (
    reference: Parameters<typeof getFunctionName>[0],
    args: Row = {},
  ) => {
    checkScope(args);
    const name = getFunctionName(reference);
    switch (name) {
      case "onboarding:status":
        return { legacy: true };
      case "organizations:details":
        return workspace;
      case "accounts:current":
        return {
          user: { name: "Local preview" },
          organizations: [{ id: data.organizationId, ...workspace }],
        };
      case "dashboard:home":
        return {
          ...basic,
          ready: true,
          compact: true,
          sources: [],
          repositories: [],
          proposals: [],
          runs: [],
          notifications: [],
          usage: null,
        };
      case "posts:recent":
        return page(data.posts, args, 20);
      case "product:libraryContext":
        return {
          ...basic,
          repositories: data.repositories,
          proposals: data.proposals,
          notifications: data.notifications,
        };
      case "product:library":
      case "workspaceSearchActions:library":
        return library(args);
      case "product:detail":
        return source(args.id);
      case "product:repositories":
        return data.repositories;
      case "projects:list":
        return data.projects ?? [];
      case "projects:get": {
        const project = data.projects?.find((row) => row._id === args.id);
        if (!project) throw new Error("Project unavailable.");
        return project;
      }
      case "product:proposals":
        return data.proposals;
      case "product:proposal": {
        const proposal = data.proposals.find((p) => p._id === args.id);
        const repo = data.repositories.find((r) => r._id === proposal?.repositoryId);
        if (!proposal || !repo) throw new Error("Proposal unavailable.");
        return { ...proposal, repo };
      }
      case "product:overview": {
        const postsById = new Map(
          [...data.posts, ...data.library].map((post) => [
            post._id ?? post.id,
            post,
          ]),
        );
        return {
          runs: data.runs,
          notifications: data.notifications.map((notification) => {
            const id = notificationSourceId(notification.key);
            const post = id && (data.sources[id] ?? postsById.get(id));
            return post && post.state !== "deleted"
              ? { ...notification, postTitle: postDisplayTitle(post) }
              : notification;
          }),
          measured: 0,
        };
      }
      case "product:usage":
        return { wallet: null, pools: [], usage: [], entries: [] };
      case "categories:list":
        return data.categories;
      case "aiPreferences:read":
        return {
          preferChatGPTPlan: false,
          hostedStatus: "unavailable",
          active: false,
          processingRoute: "save_only",
        };
      case "jobs:customerRoutes":
        return { status: "disconnected", models: [] };
      case "jobs:connections":
        return data.connections;
      case "projectRecommendations:read":
        return suggestProjects(
          source(args.sourceId),
          data.repositories as Parameters<typeof suggestProjects>[1],
        );
      case "devices:list":
      case "githubLinks:choices":
        return [];
      case "knowledgeGrants:shared":
        return { items: [], next: null };
      default:
        throw new Error("This operation is unavailable in the local snapshot.");
    }
  };

  const query = async (...args: Parameters<typeof read>) => read(...args);
  const mutation = async (
    reference: Parameters<typeof getFunctionName>[0],
    args: Row = {},
  ) => {
    const name = getFunctionName(reference);
    if (name === "projects:save" || name === "projects:remove")
      return changeLocalProject(name === "projects:save" ? "save" : "remove", args);
    return query(reference, args);
  };
  return { query, action: query, mutation };
}

export async function localProductOperation(operation: string, args: Row) {
  if (!args || typeof args !== "object")
    throw new Error("Invalid local request.");
  const data = await readLocalSnapshot();
  if (
    args.organizationId !== undefined &&
    args.organizationId !== data.organizationId
  )
    throw new Error("Workspace unavailable.");
  switch (operation) {
    case "capture":
      return localCapture(args);
    case "setPostLike": {
      if (
        !data.posts.some((post) => post.id === args.sourceId) ||
        typeof args.liked !== "boolean"
      )
        throw new Error("Post unavailable.");
      const prior = engagement(args.sourceId);
      if (args.expectedRevision !== prior.revision) return prior;
      likes.set(args.sourceId, {
        liked: args.liked,
        revision: prior.revision + 1,
      });
      return engagement(args.sourceId);
    }
    case "postEngagementRead":
      return (Array.isArray(args.sourceIds) ? args.sourceIds : [])
        .slice(0, 3)
        .map((id: string) => ({ ...engagement(id), sourceId: id }));
    case "projectPlanningContext": {
      const { source, contextHash } = planningContext(data, args);
      return { source, contextHash };
    }
    case "projectProposalSave": {
      const draft = saveProjectProposalInput.parse(args);
      const context = planningContext(data, draft);
      if (
        draft.proposalId ||
        draft.contextHash !== context.contextHash ||
        draft.insightIds.some(
          (id) =>
            !context.source.insights.some((insight: Row) => insight.id === id),
        )
      )
        throw new Error("The post or project changed. Reopen the local draft.");
      const now = Date.now();
      return localDraft(draft, {
        organizationId: data.organizationId,
        sourceId: draft.sourceId,
        repositoryId: draft.projectId,
        title: draft.body.title,
        version: 1,
        review: "unreviewed",
        disposition: draft.body.disposition,
        createdAt: now,
        updatedAt: now,
        baseSha: context.project.sha,
        profileVersion: context.project.profileVersion,
        detail: {
          ...draft.body,
          schemaVersion: "chat-project-proposal-v1",
          insightIds: draft.insightIds,
        },
      });
    }
    default:
      throw new Error("This action is unavailable right now.");
  }
}

export function localFeedEngagement(sourceId: string) {
  return engagement(sourceId);
}
