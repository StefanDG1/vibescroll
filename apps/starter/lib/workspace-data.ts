import "server-only";
import { backend, api } from "./backend";
import type { Id } from "../../../convex/_generated/dataModel";
import { usageOverview } from "../../../packages/billing/usage-overview";

export async function workspaceData({
  org,
  view = "",
  search = "",
  filter = "",
  category = "",
  sort = "newest",
  sourceId,
  proposalId,
  compactHome = false,
  sharedSourceId,
  sharedGrantId,
}: {
  org: string;
  view?: string;
  search?: string;
  filter?: string;
  category?: string;
  sort?: string;
  sourceId?: string;
  proposalId?: string;
  compactHome?: boolean;
  sharedSourceId?: string;
  sharedGrantId?: string;
}) {
  const c = await backend(),
    organizationId = org as Id<"organizations">;
  if (view === "account" || view === "menu") {
    const organization = await c.query(api.organizations.details, {
      organizationId,
    });
    return {
      workspaceSlice: "usage" as const,
      compact: false,
      workspaceName: organization.name,
      privateLibrary: organization.private,
      role: organization.role,
      sources: [],
      repositories: [],
      proposals: [],
      runs: [],
      notifications: [],
      usage: null,
    };
  }
  if (view === "usage") {
    const [organization, usage] = await Promise.all([
      c.query(api.organizations.details, { organizationId }),
      c.query(api.product.usage, { organizationId }),
    ]);
    return {
      workspaceSlice: "usage" as const,
      compact: false,
      workspaceName: organization.name,
      privateLibrary: organization.private,
      role: organization.role,
      sources: [],
      repositories: [],
      proposals: [],
      runs: [],
      notifications: [],
      usage: usageOverview(usage),
    };
  }
  if (view === "shared") {
    const [organization, sharedKnowledge] = await Promise.all([
      c.query(api.organizations.details, { organizationId }),
      c.query(api.knowledgeGrants.shared, { organizationId }),
    ]);
    let selectedSharedKnowledge;
    let sharedKnowledgeError;
    if (sharedSourceId && sharedGrantId) {
      try {
        selectedSharedKnowledge = await c.query(
          api.knowledgeGrants.fetchShared,
          {
            organizationId,
            sourceId: sharedSourceId as Id<"sources">,
            grantId: sharedGrantId as Id<"teamKnowledgeGrants">,
          },
        );
      } catch {
        sharedKnowledgeError =
          "This shared source is unavailable or changed. Check the current sharing list.";
      }
    }
    return {
      selectedSharedKnowledge,
      sharedKnowledgeError,
      role: organization.role,
      workspaceName: organization.name,
      privateLibrary: organization.private,
      compact: false,
      sources: [],
      repositories: [],
      proposals: [],
      runs: [],
      notifications: [],
      usage: null,
      sharedKnowledge,
    };
  }
  if (!view || view === "home") {
    const home = await c.query(api.dashboard.home, {
      organizationId,
      preview: compactHome,
    });
    if (home.ready) return home;
  }
  if (view === "library") {
    const [context, categories, aiPreference] = await Promise.all([
      c.query(api.product.libraryContext, { organizationId }),
      c.query(api.categories.list, { organizationId }),
      c.query(api.aiPreferences.read, { organizationId }),
    ]);
    return {
      ...context,
      workspaceSlice: "library" as const,
      compact: false,
      categories,
      aiPreference,
      sources: [],
      runs: [],
      usage: null,
    };
  }
  if (view === "connections") {
    const [organization, customerRoutes, connections, aiPreference] =
      await Promise.all([
        c.query(api.organizations.details, { organizationId }),
        c.query(api.jobs.customerRoutes, { organizationId }),
        c.query(api.jobs.connections, { organizationId }),
        c.query(api.aiPreferences.read, { organizationId }),
      ]);
    return {
      workspaceSlice: "connections" as const,
      compact: false,
      workspaceName: organization.name,
      privateLibrary: organization.private,
      role: organization.role,
      sources: [],
      repositories: [],
      proposals: [],
      runs: [],
      notifications: [],
      usage: null,
      customerRoutes,
      connections,
      aiPreference,
    };
  }
  if (view === "projects" || view === "plans" || view === "proposals") {
    const [organization, proposals, repositories, devices, githubChoices] =
      await Promise.all([
        c.query(api.organizations.details, { organizationId }),
        c.query(api.product.proposals, { organizationId }),
        view === "projects"
          ? c.query(api.product.repositories, { organizationId })
          : Promise.resolve([]),
        view === "projects"
          ? c.query(api.devices.list, { organizationId })
          : Promise.resolve([]),
        view === "projects"
          ? c.query(api.githubLinks.choices, { organizationId })
          : Promise.resolve([]),
      ]);
    return {
      workspaceSlice:
        view === "projects" ? ("projects" as const) : ("plans" as const),
      compact: false,
      workspaceName: organization.name,
      privateLibrary: organization.private,
      role: organization.role,
      sources: [],
      repositories,
      proposals,
      devices,
      githubChoices,
      runs: [],
      notifications: [],
      usage: null,
    };
  }
  const [
    library,
    repositories,
    proposals,
    overview,
    usage,
    devices,
    githubChoices,
    organization,
    customerRoutes,
    connections,
    aiPreference,
    categories,
    selectedSource,
  ] = await Promise.all([
    c.query(api.product.library, {
      organizationId,
      search: search || undefined,
      state: filter || undefined,
      category: category || undefined,
      sort,
    }),
    c.query(api.product.repositories, { organizationId }),
    c.query(api.product.proposals, { organizationId }),
    c.query(api.product.overview, { organizationId, includeCounts: false }),
    c.query(api.product.usage, { organizationId }),
    c.query(api.devices.list, { organizationId }),
    c.query(api.githubLinks.choices, { organizationId }),
    c.query(api.organizations.details, { organizationId }),
    c.query(api.jobs.customerRoutes, { organizationId }),
    c.query(api.jobs.connections, { organizationId }),
    c.query(api.aiPreferences.read, { organizationId }),
    c.query(api.categories.list, { organizationId }),
    sourceId
      ? c
          .query(api.product.detail, {
            id: sourceId as Id<"sources">,
            organizationId,
          })
          .catch(() => null)
      : Promise.resolve(null),
  ]);
  const selectedProposal = proposalId
    ? await c
        .query(api.product.proposal, { id: proposalId as Id<"proposals"> })
        .catch(() => null)
    : null;
  if (selectedProposal && selectedProposal.organizationId !== organizationId)
    throw new Error("Proposal unavailable.");
  return {
    workspaceName: organization.name,
    privateLibrary: organization.private,
    role: organization.role,
    compact: false,
    sources: library.items,
    categories,
    libraryNext: library.next,
    repositories,
    proposals,
    runs: overview.runs,
    notifications: overview.notifications,
    usage,
    devices,
    githubChoices,
    customerRoutes,
    connections,
    aiPreference,
    selectedSource,
    selectedProposal,
    measured: overview.measured,
  };
}
