# Home comparison and workspace entry

R172 · November 13, 2026 · Design and release plan

Build all three Home options on mobile and desktop in the approved implementation phase. Release them together to production for the owner's comparison. Keep the permanent default open until the owner has tried all three. See the [screen and loading ledger](APP-SCREEN-AND-LOADING-LEDGER.md) for the rest of the website.

## Compare all three on production

| Option | Browse | Read and act | Recovery |
| --- | --- | --- | --- |
| 1. Like or pass | Swipe left to pass or right to like. Also show labeled Pass and Like controls. Advance after an intentional vote. | Scroll down to the current post's insights, projects and proposals. Keep the vote controls out of links and video controls. | Undo the last vote and return to that post. A pass only changes the review queue. The post stays saved and reachable in Explore. |
| 2. Browse and open | Scroll vertically through posts. Swipe right from the post body or tap a shortcut. | View insights and View projects open the same details reader at the chosen section. | Back restores the post, scroll position and trigger focus. Preserve browser edge gestures. |
| 3. Full-screen snap | Swipe up for next and down for previous. The nearest eligible post settles on release. A short drag returns to the current post. Desktop has labeled previous and next controls and keyboard equivalents. | Insights lifts and shrinks the same media. One scrollable panel underneath shows insights, projects and proposals. | Keep the current post and playback position where supported. The panel owns vertical scrolling until closed. Close, drag the handle or use Escape where available. |

- Keep one Home route and one post identity. Use an allowlisted mode parameter such as `?mode=review`, `?mode=browse` or `?mode=snap` for direct comparison links. A mode change stays on Home. On phones, put the selector behind a small labeled control beside the Home controls or in Account. Desktop can show it beside the feed controls. During the comparison, give the owner a direct link to each mode and a way to switch among them inside production.
- Recommended rollout is to keep the comparison selector available to the owner and any explicitly chosen testers while existing customers retain their default. The owner can open any of the three modes on production. Option 3 is the proposed first selection for the comparison. Confirm general exposure and the provisional default in design review.
- Keep shared evidence, proposal actions, recommendations, all projects, links, scoped permissions and stable source IDs in all modes. Use the same ordered eligible posts as the starting point. Preserve position and any open draft when switching. A scoped preference can remember the last mode, and the comparison links can override it for that visit.
- Only Like changes the existing Like state. A pass records a reversible review disposition, without editing categories, access, saved status, or proposal data. Any effect on ranking needs a separate design decision. Implement idempotent writes, scoped pass storage and bounded Undo. Double tap can set Like in options 2 and 3, with a visible heart equivalent. Protect playback controls, scroll, browser zoom and interactive card content from accidental votes.
- Return to the same post if a mode can't immediately restore the exact offset. If access changes, show a scoped unavailable state and move to an accessible neighbor or list. Support text-only posts, image carousels, retained posters, and real inline media when allowed. Only the active item can play.

## Workspace is a scope, not a step in normal navigation

The current `/app` entry checks onboarding, then resolves the workspace with `ensureDefault` before redirecting. For implicit entry, that mutation reads the membership list and its workspaces to find an accessible default, even when a default exists. Existing scoped product pages call their own authentication, onboarding and view data path. The parent loading boundary can replace the entire route content with “Loading your workspace…”. The scoped layout is currently a fragment, so it doesn't supply a persistent fallback frame. This is a code-path diagnosis. Measure the contribution of each request in implementation. [Entry route](../../apps/starter/app/app/page.tsx), [workspace lookup](../../convex/organizations.ts), [product page](../../apps/starter/components/product-page.tsx), [loading boundary](../../apps/starter/app/app/loading.tsx).

### Proposed flow

| Situation | What the user sees | Implementation direction |
| --- | --- | --- |
| Already in an authorized workspace | Home, Explore, Work and Account keep the same layout during navigation | Link directly to scoped routes. Keep the authenticated shell mounted across sibling screens. Use route-local content boundaries. |
| Open `/app` with a readable default | Go directly to that workspace's Home or authorized continuation | Use a bounded read of the stored default and its membership first. Preserve onboarding, invite, billing and share precedence. Keep writes to explicit switching or a genuinely required fallback or first-time creation. |
| Cold entry, session still resolving | A neutral shell with navigation positions and a Home-shaped skeleton if visible | Avoid a full-page workspace message. Render protected identity or content only after authorization. Start signed-in data reads after required gates, and parallelize independent reads. |
| Switch workspace | An Account picker shows the pending selection while the shell stays put | Authorize and persist the selection once. Clear prior scoped content at the switch boundary. Restore the same destination family where allowed, or go to Home when an item belongs to the old workspace. |
| One accessible workspace | Go straight to it | Hide the switch control when no choice is useful. Keep management, team membership and invitation actions where authorized. |
| Default removed or access revoked | A concise recovery state in the same shell, with an authorized choice or recovery action | Recheck access and re-resolve. Never reuse old cached data or re-create a deleted workspace on ordinary navigation. If a deep link is unavailable, preserve a safe return path. |
| Need to create, join or manage workspaces | Open workspace management or the invite's own page | Keep `/app/workspaces` for deliberate management and recovery. A team or private workspace changes data scope and permission-specific actions while the main layout stays familiar. |

### Before and after measurements

Record four separate journeys with a trace and a screen recording. Use ordinary sign-in, cold `/app`, scoped navigation, and explicit switching. Include a user with multiple memberships and one with revoked access. Compare redirect count, authentication and membership reads, fallback visibility, time to first usable screen, and time to the first real post. Set device and network targets after capturing the baseline. Keep public and authenticated caches separate and scope private results to the verified actor and workspace.

Verify that Home → Explore → Work → Account → Back can happen without a routine full-page workspace fallback. Slow and failed scoped reads keep navigation and display the relevant content placeholder, error, or recovery action. Auth expiry, revoked access and switching never show data from an unauthorized scope.

## Comparison release checklist

1. After design approval and a start instruction, build and stage the three modes against the same fixtures, plus representative authorized saved posts. Check touch, trackpad and keyboard on the same tasks in every mode.
2. Publish the approved comparison access and mode links together using the normal release process. Run read-only production checks for each mode on phone and desktop. Check optional writes with authorized test data and the existing funding and provider limits.
3. Record exact release version, links, screenshots, media fallbacks, a gesture recording, route status, and recovery checks. Include what the owner can safely try with real data.
4. The owner chooses the permanent default after comparison. Promotion to the permanent default and any later retirement are separate decisions. Keep a reversible selector and a way to disable a faulty mode while fixing it.
