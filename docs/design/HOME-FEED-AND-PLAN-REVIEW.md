# Home feed and plan review

Mode: implementation plan. Owner requirements R115-R122, October30,2026.

## Direction and current scope

Home becomes the place to revisit the user's own saved, analyzed posts and turn useful insights into project plans. Desktop uses three columns: source, insights, project plans. A post occupies roughly a viewport, with room to expand when content needs it. Keep the five destinations Home, Explore, Save, Work and Account, and preserve Explore's Library Tree/Folders. Explore can gain a separate Trends tab later. Standalone post/proposal URLs remain valid.

The owner authorizes implementation in R122 and selects only the [latest four desktop/mobile light/dark renders](references/home-feed-2026-10-30/README.md) as durable visual references. Earlier A/B/C concepts are excluded. The composite direction in R121 combines: A's typography/spacing, source and insights columns and expanding proposal cards; B's inline plan conversation without tabs; C's full-height mobile thumbnail/profile overlay. The selected refined light/dark renders are saved with SHA-256 hashes. Implementation may proceed. No feed, likes, analytics, generated-plan service or new publishing action is deployed by this document. Existing production remains the CURRENT-STATE baseline. Do not replace DESIGN.md from a stale skill context or interpret a generated preview as an implementation test.

The source screenshots show the current Home list and the current source-plus-insights reader on desktop1600×1000 and mobile430×932. They are retained privately in ignored operator output. Generated mockups use fictional content and illustrative counts. They are not customer analytics, real model scores or completed plans.

## The minimum useful experience

1. Read a saved post and its insights.
2. Choose a project and generate one plan using all insights from the post.
3. Read or edit the plan; request changes in its own small discussion.
4. Approve the exact current version and create its GitHub issue in one action.
5. Open the issue or copy a work prompt into the user's coding chat.

Keep recommendations, likes and analytics helpful to these steps. Home does not need summary KPI cards, a global assistant chat, repeated setup banners or a graph of every connection.

## Desktop and mobile

Desktop uses the available width, with a narrow or collapsible navigation rail. The source column contains creator/title, thumbnail or supported playback, categories/subcategories, a short description, like and share-to-VibeScroll actions/counts. R123/R124 supersede the earlier natural-height layout: on desktop, source, insights and plans fit into one viewport, with long insight/plan content scrolling inside its column. The page snaps smoothly between posts and exposes roughly 32–48px of the next post below the current card. Insights reuse the existing expandable controls. Evidence remains behind an action. Show a connector only for the selected insight and selected project; focus/selection must convey the same relationship without relying on the line or color.

The plan column shows at most two or three project/plan entries initially. One plan is active; other entries are compact. Expanding its document and discussion uses the available plan-column height. Keep its composer and approval action visible, with long document/discussion text scrolling above them. A ready proposal shows its own topic-fit score in its own header, including while collapsed. Pending/no-plan entries do not masquerade as ready scored proposals. Show useful context and the topic-fit breakdown without presenting it as a predicted outcome. Do not generate every candidate automatically.

Mobile is independently composed. Use C's full-height thumbnail with creator/profile overlay as the starting view, then A's natural vertical transition into the same post's metadata/insights. A subsequent explicit review action opens B's readable plan followed directly by its conversation and composer. No Plan/Discussion tabs or other tab switch is needed for these screens. A post may therefore occupy successive screen sections before the next post; do not let one vertical swipe ambiguously mean both open insights and skip to another post. Remove the repeated VibeScroll header/banner, top Save button and large page heading from feed/review surfaces. Start with the post/creator or the selected plan. Keep the existing five destination controls reachable, without a second app-wide toolbar. Use a contextual Review plan action and an accessible sheet/full-screen review state. A small back/context row identifies the post while reviewing a plan. Account retains sign-out, credits and connections.

Avoid three narrow columns on phones. Preserve a useful media/insight balance rather than forcing all full text onto one screen. Long plans, enlarged text, translated labels and the software keyboard may grow beyond a viewport. Prefer readable content over an absolute screen-height constraint.

## Feed loading and navigation

- Feed eligibility follows durable personal requested-post associations and current access, not the entire shared corpus. Only ready analyzed posts enter the default feed. Preparing/failed posts remain reachable through Posts/Work and a compact relevant status, without dominating Home.
- Use stable cursor pagination over indexed authorized metadata. Deduplicate canonical post/version IDs across pages. Preserve snapshot/order boundaries when new results arrive; a New ready posts control can update the feed without moving the post being read.
- Fetch thumbnail/title/creator/category metadata first. Load full analysis, recommendations and plans for the active post; keep a bounded neighbor/detail cache. Prefetch the next poster/metadata, not all videos or model results. Abort obsolete reads and do not request every page from one sentinel/cursor change.
- Use native scrolling and proximity snapping where it helps. Support touch, wheel, keyboard and explicit previous/next controls. Read all of the current post before reaching the next one; desktop insight and plan content scrolls within its bounded column; mobile has source, insights and plan stages before the next post. Disable feed shortcuts while typing/editing or an overlay owns focus. Restore post position, insight selection and per-post draft state on return.
- The user's library is finite. Infinite loading must stop at a confirmed cursor end. Offer an explicit Start again/revisit control or a clearly marked repeat cycle if the owner selects looping. Do not present repeated posts as newly loaded, charge again or increment interactions because of repainting.
- Only the visible source may play. Pause when it leaves view or the tab becomes hidden. Respect autoplay/provider restrictions, reduced motion and data saving. Use retained poster/screenshots plus Open original when playback is unavailable. No expiring downloader URL becomes a permanent player or raw-video retention policy.
- Keep accessible Load more and Next post controls. Recheck source/image access on demand. Deletion, takedown and entitlement loss clear revoked content and preserve an understandable position.

## Plan generation, comments and approval

Generation uses the exact insight version and authorized project context. Reuse saved evidence instead of downloading/transcribing the post again. Use a versioned quote/reservation and the existing supported API funding route for in-app generation; supported ChatGPT/Codex chats can read/refine/write back through MCP. Do not turn the paused direct hosted subscription path into an implicit dependency.

Keep one durable proposal object across website and MCP. Generation is a durable job keyed by source version, project/profile revision, selected insights and request key. Show queued, working, partial, validating, ready, failed and unknown separately. Stream only real partial output; approval stays disabled until the complete current version is validated and persisted. Going to another post does not lose or silently duplicate the job.

R121 removes the separate Needs changes/X action. The expanded proposal displays plan text, conversation and a real composer in one continuous flow, with no Plan/Discussion tabs. Users ask questions or request changes directly in that composer. Save the conversation against the exact proposal/version; new edits create a new revision where needed. The user can edit the document or approve a later revision. Preserve pending input on failure and after re-entry. Do not replace an existing discussion with a new chat or silently discard later replies when editing an old turn.

Permanent deletion is a distinct three-dot action. Preserve existing recovery/retention behavior. Avoid a second global assistant: the small discussion is part of the expanded active proposal, and collapsing that proposal hides the discussion with its draft intact.

The owner explicitly chose **Approve & create issue** as one action. Show the repository and current plan version before the click. Do not add a second publish-confirmation screen for the normal action. Check current membership, exact version and GitHub issue-writing capability. If GitHub access needs completion, preserve the plan and return to the same action after setup; do not request a new VibeScroll OAuth app.

Persist approval plus a once-only publication request. The external issue write is not a database transaction: reconcile an unknown outcome using the frozen handoff/marker before retrying, and never create another issue just because a response timed out. Concurrent approval/edit must either bind the exact reviewed version or return a stale-version result. New edits require fresh approval. Display Creating issue, Issue created or a recoverable issue-specific failure; do not report publication before confirmed identity.

After success show Open issue and Copy work prompt. Reuse the exact frozen handoff, issue URL, repository/base and completion-report instructions. Research the actual supported coding-client interface before offering a command. A clear copyable work prompt is valid V1; do not invent a `codex --issue` command or claim delivery to the desktop app. Issue creation does not start coding or authorize an unrestricted execution job. Retain signed GitHub observations separately from model reports and measured benefit.

## Likes, share counts and analytics

Store a durable per-user like on the canonical post, with source/version attribution where useful. Optimistic UI may update immediately, but rejected writes roll back clearly. A second tap removes that user's like; request replay/concurrent taps cannot inflate counts. Do not store a new like each time the feed loops.

Track successful user-initiated shares into VibeScroll separately from retry/delivery attempts. Distinguish total intake occurrences, unique users saving and personal save state. Deduplicate aliases/redirects through existing canonical source identity. Label these as VibeScroll saves/shares, never Instagram/TikTok's external like/share counts unless that provider actually supplies them.

These signals can inform future recommendations for posts, creators and categories/subcategories. Likes/popularity are not proof of quality, useful proposals, implemented changes or model strength. Keep personal preference, aggregate popularity and downstream proposal outcomes distinct. Do not rescore the entire catalogue or call a model on every tap/scroll. Version the scoring policy and allow correction of taxonomy/creator identity.

Explore → Trends is a separate later analytics surface: compact saved/liked/applied totals, period-aware trend lines, ranked posts/creators/categories and emerging subcategories. Use time-windowed indexed rollups, sample size/denominator and a minimum-observation rule. Show clear empty/insufficient-data states, not attractive invented numbers or fabricated percentage growth. New taxonomy nodes need stable IDs/parent lineage and created-at provenance. Date ranges, scope and comparison windows must be explicit; metrics must not expose another user's private projects or proposal text.

## Loading and recovery contract

| State                          | Minimum useful presentation                                  | Recovery and retained state                             |
| ------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------- |
| Feed metadata loading          | Skeleton sized like the actual source/insight layout         | No fake post, count or score                            |
| Next page loading/fails        | Quiet trailing skeleton or inline read error                 | Keep visible post; retry the same cursor manually       |
| No analyzed posts              | One clear Save a link action                                 | Existing pending saves stay reachable                   |
| Analysis active                | Existing observed-stage display                              | Remains reactive; never fabricate percent/ETA           |
| Missing thumbnail/player       | Stable poster fallback and original link                     | Insights stay usable                                    |
| No project/context stale       | Choose/connect project or refresh context                    | Keep selected post and insight; no misleading score     |
| Quote/start pending            | Actual bounded credit estimate and disabled duplicate action | Same idempotency key after uncertain acknowledgement    |
| Plan queued/generating         | Compact status plus real partial artifact when available     | Background work keeps its stable URL/ID                 |
| Partial/stopped/invalid output | Clearly incomplete draft                                     | Preserve confirmed text; cannot approve incomplete work |
| Plan ready                     | Readable document, discussion entry, review actions          | No automatic approval or issue write                    |
| Feedback sending/offline       | User input and pending message remain visible                | Retry same request; no duplicate message/charge         |
| Plan edited elsewhere          | Explicit newer-version state                                 | Preserve local text and reconcile before approval       |
| Issue creation failed/unknown  | Plan retained; separate publication status                   | Reconcile provider identity before another write        |
| Issue created                  | Open issue + copy work prompt                                | Signed status/report feedback stays linked              |
| Access revoked/deleted         | Clear content unavailable state                              | Stop reads/playback and clear protected cached bytes    |

All interactive controls need hover, focus, active, disabled, pending, error and success behavior. Use standard keyboard/focus restoration,44px touch targets, reduced motion and data-aware loading. Restrict motion to meaningful150–250ms state changes; do not animate every card or fake a token stream for completed content.

## Components and technology

Keep Next.js/React, Convex reactive authorized state, current evidence storage and managed preparation/Gateway services. Reuse PostInsightReader, InsightCardControl, ProjectFitBreakdown, SourceProgressPanel, SettingsPanel and the existing proposal contracts. Use native overflow, IntersectionObserver and bounded caching before a carousel/virtualization dependency. Add a dedicated virtualizer only if measured long-feed behavior needs it.

The [complete assistant-ui catalogue review](ASSISTANT-UI-CATALOGUE-REVIEW-2026-10-30.md) records all151 entries, current contracts and the shortlist. Compose recommendation/artifact/document, scoped feedback/discussion and approval patterns; do not install all elements or another cloud conversation service. Use suitable shadcn/Radix sheet, tabs, dropdown, tooltip and skeleton primitives while retaining existing working accessible controls. Desktop connection lines can be small measured SVG/CSS paths; the preserved Library diagram remains separate.

## Delivery order

1. **Design choice:** current screenshots, catalogue/state review and three image concepts with desktop/mobile variants. The latest four refined light/dark desktop/mobile images are selected and saved; the owner authorizes implementation. Images are not working prototypes.
2. **Ready-post feed:** reuse indexed personal metadata, cursor/dedup/cache behavior and stable routes; implement the selected responsive shell and existing insights before new AI work. Verify manual navigation, natural whole-page scrolling into the next post, restored position and no extra charges.
3. **Project/plan lane:** reuse deterministic recommendations, bounded candidate list and existing durable proposals. Add quoted replay-safe generation from retained evidence and actual streaming/ready states, with credit and supported-chat routes kept truthful.
4. **Discussion and one-click publication:** version-bound comments/refinement, continuous tab-free conversation, accessible mobile review, exact approval/outbox and once-only GitHub issue creation, then copyable handoff and automatic feedback.
5. **Likes/intake events:** idempotent per-user feedback and efficient rollups, with optional ranking inputs and no inference on scroll.
6. **Trends and outcomes:** real analytics with honest sample sizes, then calibrated recommendation/model/outcome experiments. This follows the working feed/review journey.

Test with labeled synthetic fixtures first, then existing authorized saved results without fresh analysis. Cover empty, long-title/many-insight, streaming, offline, stale versions, duplicate events, simultaneous approvals, issue timeout, deletion and revoked image access. Test real touch/keyboard/wheel boundaries, enlarged text, mobile keyboard, desktop widths and both themes. Use staged/exact-version publication under actual budget/provider gates. No preview alone completes a milestone.

## R122 implementation checkpoint

The first working feed is implemented under [ADR212](../adr/212-metadata-first-home-feed.md). It uses the selected desktop/mobile shell, natural post-to-next-post page scrolling, indexed metadata pages, at most three retained full analyses, live version invalidation and source-access clearing. Existing saved plans expand inline with actual topic-fit disclosures; the existing replay-safe manual proposal seed is reachable for a selected insight. Library Tree/Folders and standalone routes are preserved. The first production-build visual/native pass and all eight Library layout cases passed locally.

This is delivery step2 and the saved-plan portion of step3. Website publication and independent private-data acceptance are not implied by local tests. Quoted AI plan generation, durable inline conversation/refinement, single-action issue publication, comment drafts restored across navigation, new-result discovery and richer ranking remain open. No fake conversation, engagement total, media player or generated plan substitutes for those capabilities.

Production acceptance of this first subset: cd78c9b, exact CI41140446455,46.335s fixed Basic build, same-build promotion, canonical feed/Library geometry and authenticated source/plan/thumbnail/draft-opener checks. [Receipt](../operations/evidence/launch-20261031-home-feed-production.json). The remaining generation/discussion/publication requirements above are not marked complete.

## October 31 fidelity correction (R123/R124)

The four selected renders remain the visual authority. Remove the top For your projects/All posts row. Desktop uses creator above poster, categories/description/reactions below, a small next-post card, compact proposal headers with ready-plan topic fit and a continuous document/discussion composer. Post settings open an in-place side panel. Keep unavailable engagement and discussion actions honest; synthetic counts/messages belong only in the labeled demo.

Expanding an insight is reading state only. Remove Use another insight/Choose another insight controls. Every new proposal considers the full exact retained post version, up to the analysis maximum of twenty insights, even if its plan uses only some of them. The server resolves the full authorized set so a compact preview cannot accidentally omit context. Preserve explicit narrower MCP requests where the user deliberately asks for them. Existing saved proposals remain immutable until deliberately edited.

Native vertical scroll snapping and smooth programmatic next navigation expose the next post/stage, with reduced-motion support and no global wheel/key interception. Verify viewport bounds, nested-scroll escape, next-card peek, native controls, all-insight bindings/retries and unchanged Library Tree/Folders in light/dark desktop/mobile before publication.

Implementation decision: [ADR213](../adr/213-viewport-feed-and-whole-post-proposals.md) supersedes the incompatible ADR212 height rules.

## Active short-term completion, October 31

R125 authorizes completing delivery steps3/4 through [the bounded proposal-loop plan](../launch-plan/2026-10-31/SHORT-TERM-PROPOSAL-LOOP.md). Implement real generation, durable conversation and combined issue publication before engagement/trends. The accepted viewport feed remains the presentation baseline.
