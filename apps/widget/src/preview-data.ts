import type { ToolRecord } from "../../../packages/widget/contracts";
import {
  feedbackRequest,
  type FeedbackState,
} from "../../../packages/widget/feedback";
import { categoryName } from "../../../packages/categories";
import {
  libraryEditInput,
  libraryEditVersion,
  type LibraryEditReceipt,
} from "../../../packages/widget/library-edits";
import {
  filingInput,
  filingVersion,
  sameFilingReference,
  type FilingReceipt,
} from "../../../packages/widget/evidence-filing";
const profile = "demo-private-workspace";
const demoTopics = [
  {
    id: "sample-topic",
    name: "Product design",
    parent_id: null as string | null,
    version: 1,
    layout_version: 0,
    pinned: true,
    aliases: ["User experience"],
  },
  {
    id: "sample-folder",
    name: "Saved methods",
    parent_id: null as string | null,
    version: 1,
    layout_version: 0,
    pinned: false,
    aliases: [] as string[],
  },
];
const demoEdits = new Map<
  string,
  { input: string; receipt: LibraryEditReceipt }
>();
export const demoCardPayload = {
  route: { view: "insight", profileId: profile, sourceId: "sample-onboarding" },
};
const sources = [
  [
    "sample-onboarding",
    "Designing a useful first experience",
    "Let people try the useful part first",
    "Show a useful result before asking people to connect every part of their workflow.",
  ],
  [
    "sample-evidence",
    "Building tools people trust",
    "Keep the evidence next to the idea",
    "A claim is easier to assess when its original source and context are close by.",
  ],
  [
    "sample-actions",
    "From saved content to useful work",
    "Give every insight a clear next step",
    "Let the next action follow from the insight and its evidence.",
  ],
].map(([id, title, insightTitle, claim], index) => ({
  id,
  title,
  state: "ready",
  kind: "youtube",
  generation: 1,
  revision: 100 + index,
  url: `https://scroll.companynerve.com/app/${profile}/library/${id}`,
  insights: [
    {
      id: `idea-${index}`,
      fetch_id: `${id}~0`,
      title: insightTitle,
      claim,
      reference: {
        sourceId: id,
        generation: 1,
        revision: 100 + index,
        insightId: `idea-${index}`,
      },
      evidence: [{ kind: "speech", startMs: 102000, endMs: 138000 }],
    },
  ],
}));
const demoFilings = sources.map((source, index) => ({
  memberId: `sample-filing-${index}`,
  topicId: "sample-topic",
  excluded: false,
  reference: { ...source.insights[0].reference },
}));
const demoFilingReceipts = new Map<
  string,
  { input: string; receipt: FilingReceipt }
>();
const links = Object.fromEntries(
  ["home", "connections", "projects", "usage", "privacy", "account"].map(
    (key) => [
      key,
      `https://scroll.companynerve.com/app/${profile}/${key === "home" ? "" : key}`,
    ],
  ),
);
type DemoFeedback = NonNullable<FeedbackState["feedback"]> & {
  sourceId: string;
  generation: number;
  revision: number;
  order: number;
};
const judgments = new Map<string, DemoFeedback>();
let judgmentOrder = 0;
export function seedDemoFeedback() {
  judgments.set("sample-onboarding:saved-feedback-key", {
    feedback_id: "sample-saved-judgment",
    key: "saved-feedback-key",
    version: 1,
    action: "later",
    note: "A saved note from this connection.",
    grant_version: 1,
    sourceId: "sample-onboarding",
    generation: 1,
    revision: 100,
    order: ++judgmentOrder,
  });
}
export async function demoCall(
  name: string,
  args: ToolRecord,
): Promise<ToolRecord> {
  if (name === "widget_evidence_state") {
    const reference = args.reference as FilingReceipt["reference"];
    return {
      schema_version: filingVersion,
      profile_id: profile,
      grant_version: 1,
      reference,
      items: demoFilings
        .filter((row) => sameFilingReference(row.reference, reference))
        .map((row) => {
          const topic = demoTopics.find((topic) => topic.id === row.topicId)!;
          return {
            member_id: row.memberId,
            topic_id: row.topicId,
            excluded: row.excluded,
            name: topic.name,
            version: topic.version,
          };
        }),
      next_cursor: null,
      coverage:
        "Illustrative exact-idea topic filings. No production record is changed.",
    };
  }
  if (name === "widget_evidence_receipt")
    return {
      profile_id: profile,
      grant_version: 1,
      reference: args.reference,
      receipt: demoFilingReceipts.get(String(args.key))?.receipt ?? null,
    };
  if (name === "widget_evidence_edit") {
    const input = filingInput.parse(args);
    const old = demoFilingReceipts.get(input.key);
    if (old) {
      if (old.input !== JSON.stringify(input))
        throw new Error("Synthetic filing key changed");
      return old.receipt;
    }
    const origin = demoFilings.find(
      (row) =>
        row.memberId === input.origin.memberId &&
        sameFilingReference(row.reference, input.reference),
    );
    const topic = demoTopics.find((row) => row.id === input.origin.topicId);
    if (
      !origin ||
      !topic ||
      topic.version !== input.origin.version ||
      origin.excluded !== input.origin.excluded
    )
      throw new Error("Synthetic filing changed");
    let destination: FilingReceipt["destination"] = null;
    if (input.change.kind === "move") {
      const selected = input.change.destination;
      const target = demoTopics.find((row) => row.id === selected.topicId);
      if (
        !target ||
        target.id === topic.id ||
        target.version !== selected.version
      )
        throw new Error("Synthetic destination changed");
      let member = demoFilings.find(
        (row) =>
          row.topicId === target.id &&
          sameFilingReference(row.reference, input.reference),
      );
      if (!member) {
        member = {
          memberId: `sample-filing-${crypto.randomUUID()}`,
          topicId: target.id,
          excluded: false,
          reference: { ...input.reference },
        };
        demoFilings.push(member);
      }
      member.excluded = false;
      target.version++;
      destination = {
        topic_id: target.id,
        member_id: member.memberId,
        version: target.version,
      };
    }
    origin.excluded = input.change.kind !== "restore";
    topic.version++;
    const receipt: FilingReceipt = {
      schema_version: filingVersion,
      profile_id: profile,
      grant_version: 1,
      reference: input.reference,
      request_key: input.key,
      operation: input.change.kind,
      origin_topic_id: topic.id,
      origin_member_id: origin.memberId,
      origin_version: topic.version,
      excluded: origin.excluded,
      destination,
      applied: true,
      processing_started: false,
    };
    demoFilingReceipts.set(input.key, {
      input: JSON.stringify(input),
      receipt,
    });
    return receipt;
  }
  if (name === "widget_library_state") {
    const topic = demoTopics.find((topic) => topic.id === args.topicId);
    if (!topic) throw new Error("Synthetic topic unavailable");
    return {
      schema_version: libraryEditVersion,
      profile_id: profile,
      grant_version: 1,
      topic: { ...topic, aliases: [...topic.aliases] },
    };
  }
  if (name === "widget_library_receipt") {
    const found = demoEdits.get(String(args.key));
    if (found && found.receipt.topic_id !== args.topicId)
      throw new Error("Synthetic key belongs to another topic");
    return {
      profile_id: profile,
      grant_version: 1,
      receipt: found?.receipt ?? null,
    };
  }
  if (name === "widget_library_edit") {
    const input = libraryEditInput.parse(args);
    const previous = demoEdits.get(input.key);
    if (previous) {
      if (previous.input !== JSON.stringify(input))
        throw new Error("Synthetic key changed");
      return previous.receipt;
    }
    const topic = demoTopics.find((topic) => topic.id === input.topicId);
    if (
      !topic ||
      topic.version !== input.expectedVersion ||
      topic.layout_version !== input.expectedLayoutVersion
    )
      throw new Error("Synthetic topic version changed");
    if (input.change.kind === "rename") {
      topic.name = categoryName(input.change.name);
      topic.version++;
    } else if (input.change.kind === "pin") {
      topic.pinned = input.change.pinned;
      topic.version++;
    } else {
      topic.parent_id = input.change.parentId;
      topic.aliases = [...new Set(input.change.aliases.map(categoryName))];
      topic.layout_version++;
    }
    const receipt: LibraryEditReceipt = {
      schema_version: libraryEditVersion,
      profile_id: profile,
      grant_version: 1,
      topic_id: topic.id,
      topic_version: topic.version,
      layout_version: topic.layout_version,
      request_key: input.key,
      operation: input.change.kind,
      applied: true,
      processing_started: false,
    };
    demoEdits.set(input.key, { input: JSON.stringify(input), receipt });
    return receipt;
  }
  if (name === "get_profile" || name === "widget_profiles")
    return {
      profiles: [
        {
          profile_id: profile,
          name: "Sample personal workspace",
          grant_version: 1,
          expires_at: null,
          projects: [
            {
              repository_id: "demo-project",
              name: "VibeScroll",
              context:
                "Turn saved knowledge into reviewed project improvements.",
              evaluations: [
                {
                  evaluation_id: "sample-evaluation",
                  evaluation_hash: "sample-hash",
                  disposition: "review_fit",
                  title: "Make the first insight useful before more setup",
                  summary:
                    "Offer an evidence-backed result before asking a new user to connect a repository.",
                },
              ],
            },
          ],
          automatic_analysis: true,
          cloud_request_policy: "explicit_per_source_v1",
        },
      ],
      next_cursor: null,
    };
  if (name === "widget_state")
    return {
      profile_id: profile,
      name: "Sample personal workspace",
      role: "owner",
      grant_version: 1,
      expires_at: null,
      scope: "all",
      automatic_analysis: true,
      cloud_request_policy: "explicit_per_source_v1",
      actions: {
        context: true,
        jobs: true,
        save: true,
        feedback: true,
        analysis: true,
        cloud: true,
        draft: true,
        events: true,
        organize: true,
      },
      links,
      notice:
        "Illustrative data only. This preview makes no live VibeScroll requests.",
    };
  if (name === "widget_browse")
    return {
      profile_id: profile,
      grant_version: 1,
      items:
        args.kind === "topics"
          ? demoTopics.map(({ id, name, parent_id, version, pinned }) => ({
              id,
              name,
              parent_id,
              version,
              pinned,
            }))
          : args.kind === "proposals"
            ? [
                {
                  id: "sample-proposal",
                  title: "Keep source evidence beside the first useful result",
                  version: 1,
                  state: "draft",
                  url: `${links.projects}?proposal=sample-proposal`,
                },
              ]
            : args.kind === "jobs"
              ? sources.map((source) => ({ ...source, status: "ready" }))
              : sources,
      next_cursor: null,
      next_offset: null,
      coverage:
        "Illustrative sample records. No production account or analysis is used.",
    };
  if (name === "widget_proposal")
    return {
      id: "sample-proposal",
      title: "Keep source evidence beside the first useful result",
      version: 1,
      state: "draft",
      body: "Why this fits\nThe selected source recommends letting people inspect a useful result before completing every setup step.\n\nProposed change\nShow the first insight and its evidence together. Offer project setup when the person is ready to apply the idea.\n\nReview needed\nConfirm the source, scope and current project context before planning implementation.",
      review_url: `${links.projects}?proposal=sample-proposal`,
    };
  if (name === "widget_topic")
    return {
      topic: { id: "sample-topic", name: "Product design" },
      items: sources,
      next_cursor: null,
    };
  if (name === "fetch") {
    const source =
      sources.find((item) => item.id === String(args.id).split("~")[0]) ??
      sources[0];
    return {
      id: args.id,
      title: source.title,
      url: source.url,
      profile_id: profile,
      grant_version: 1,
      text: JSON.stringify({
        state: source.state,
        coverage: "audio_only",
        insights: source.insights,
      }),
      more_ideas: false,
    };
  }
  if (name === "get_job_status")
    return {
      title:
        sources.find((source) => source.id === args.sourceId)?.title ??
        "Saved sample source",
      source_id: args.sourceId,
      status: "ready",
      generation: 1,
      revision: 100,
      grant_version: 1,
      processing: {
        executor: "work_cloud",
        state: "completed",
        stage: "completed",
      },
    };
  if (name === "save_link")
    return {
      source_id: "sample-onboarding",
      profile_id: profile,
      status: "saved",
      url: sources[0].url,
      note: "Illustrative save receipt. No real source was saved.",
    };
  if (name === "widget_feedback_state") {
    const matching = [...judgments.values()]
      .filter(
        (row) =>
          row.sourceId === args.sourceId &&
          row.generation === args.generation &&
          row.revision === args.revision &&
          (!args.key || row.key === args.key),
      )
      .sort((a, b) => b.order - a.order)[0];
    return {
      schema_version: "vibescroll-feedback-v1",
      profile_id: profile,
      grant_version: 1,
      authority_id: "sample-feedback-grant",
      request_key:
        args.key ??
        matching?.key ??
        `review-${args.sourceId}-${args.generation}-${args.revision}`,
      source_id: args.sourceId,
      generation: args.generation,
      revision: args.revision,
      lookup_complete: true,
      feedback: matching
        ? {
            feedback_id: matching.feedback_id,
            key: matching.key,
            version: matching.version,
            action: matching.action,
            note: matching.note,
            grant_version: matching.grant_version,
          }
        : null,
    };
  }
  if (name === "record_feedback") {
    const input = feedbackRequest.parse(args);
    const lookup = `${input.sourceId}:${input.key}`;
    const old = judgments.get(lookup);
    if (
      old &&
      old.action === input.action &&
      old.note === input.note.trim() &&
      [old.version, old.version - 1].includes(input.expectedVersion)
    )
      return {
        feedback_id: old.feedback_id,
        version: old.version,
        status: "recorded",
        benefit: "not_measured",
      };
    if ((old?.version ?? 0) !== input.expectedVersion)
      throw new Error("Synthetic judgment version changed");
    const row: DemoFeedback = {
      feedback_id: `sample-judgment-${++judgmentOrder}`,
      key: input.key,
      version: input.expectedVersion + 1,
      action: input.action,
      note: input.note.trim(),
      grant_version: input.grantVersion,
      sourceId: input.sourceId,
      generation: input.generation,
      revision: input.revision,
      order: judgmentOrder,
    };
    judgments.set(lookup, row);
    return {
      feedback_id: row.feedback_id,
      version: row.version,
      status: "recorded",
      benefit: "not_measured",
    };
  }
  if (name === "search")
    return {
      results: sources.flatMap((source) =>
        source.insights
          .filter((idea) =>
            `${idea.title} ${idea.claim} ${source.title}`
              .toLowerCase()
              .includes(String(args.query).toLowerCase()),
          )
          .map((idea) => ({
            id: idea.fetch_id,
            title: idea.title,
            excerpt: idea.claim,
            url: source.url,
            reference: idea.reference,
          })),
      ),
      next_cursor: null,
      next_offset: null,
      coverage: "Sample search only.",
    };
  throw new Error(
    "This action needs the connected plugin. The preview does not create live work.",
  );
}
