# Insights, Activity, Profile, and full-screen Home

Design review for R169 and R170, November 13, 2026. The concepts use the current VibeScroll Home, Inbox and Account layouts. The supplied screenshots guide media and navigation geometry, timeline density, and profile hierarchy. The examples describe proposed app behavior.

The review gallery, generated images, and six original inspiration screenshots are in the checkout's local `outputs/insights-activity-profile-home-2026-11-13/`. The screenshots and media stay in the ignored output directory.

## Insight cards

Use a horizontal strip on Home and the full post page. Show the title below the image in the same card. On a phone, let a neighboring card peek into view so the gesture is discoverable. On desktop, show more cards at once and keep previous and next controls available. Keep native horizontal scrolling and allow keyboard users to focus each title.

Tap or click the card to expand one detail area immediately beneath the strip. Keep the selected card and its title visible, with a clear expanded state. The panel shows the explanation, a named **View source frame** or **View transcript** action, and **Resources** when there are links. Omit the advanced menu. Each resource shows its readable name, destination domain, and external link affordance.

Use the most relevant authorized retained frame for the selected analysis version. Prefer an explicit visual citation. When a frame is selected by proximity to a narrow transcript cue, label it as a nearby moment and preserve the actual transcript citation. For text-only or uncertain evidence, use a transcript/text preview. A missing or expired image keeps the explanation readable and offers evidence only if it is available. Reserve thumbnail space during loading and fetch visible frames plus a small neighbor window through the existing authorized image route.

The current Cindy Zhu Reel has eight saved frames. Liquid Glass JS cites its visible README at 35.240 s. Shader Gradient cites the editor at 44.050 s. React Three Fiber and Liquid Logo have speech references without an explicit visual citation. The React Three Fiber desktop example uses a nearby contextual frame, while Liquid Logo uses a transcript preview.

Use cited URLs or confidently matched first-party resources. Show the difference between a source link and a resource found by matching its name or visual evidence. The Liquid Glass JS frame shows the same README title and file list as the matched repository. React Three Fiber and Shader Gradient have first-party resources for the projects named in the Reel. Keep an unconfirmed Liquid Logo destination out of the link list. [Liquid Glass JS repository](https://github.com/dashersw/liquid-glass-js), [React Three Fiber documentation](https://docs.pmnd.rs/react-three-fiber/getting-started/introduction), [Shader Gradient](https://shadergradient.co/).

## Full-screen Home

The new concept keeps one post nearly viewport-height, with author, title, categories, a heart, and an explicit **Insights** action. Swipe up or scroll down to move to the next post. Swipe down or scroll up to return to the previous post. On release, settle smoothly to the nearest eligible post in the drag direction, or return to the current post when the drag is small. Use native scrolling and snapping where they support this. Desktop also exposes previous and next controls and keyboard equivalents. Use reduced-motion behavior for the same destinations.

When Insights opens, animate the current video or image upward and scale it proportionally into the upper third. Keep the same media and playback position when supported. The panel comes up underneath, with a close button and mobile drag handle. The panel holds, in order, insight cards and expanded details, recommended projects and all projects, proposals, then **Open full post**. Existing proposal actions remain available in place. The panel's vertical scroll owns the gesture while it is open, even at its boundaries. The thumbnail strip scrolls horizontally within it. Drag the handle down, use Close, or use Escape on desktop to restore the same post. Restore focus to the Insights button. The mobile panel covers the nav while open and returns it when closed. Keep the desktop rail visible.

Never duplicate the media or title when the panel opens. Use a retained poster and **Open original post** where an inline player is unavailable. Text posts and carousels keep the same order and close behavior. At the end of the feed, settle on the last post and only offer further loading when an authorized cursor exists. Opening or closing the panel preserves the selected post and its work.

## Activity

Evolve the current Inbox into **Work → Activity**. Keep Work in the compact navigation and add an unread indicator when applicable. Keep Projects, Proposals, and Tasks reachable from the same Work navigation. Activity groups new and earlier updates and filters by All, Proposals, Posts, and Integrations.

Each row shows the event, a short context line, when it happened, and one next action when needed. **Review** opens the existing proposal, **Continue setup** opens the exact integration step, and **Open post** opens the authorized saved result. Mobile opens the item and restores the Activity list on back. Desktop can keep the list beside the selected item. Keep proposal approval and issue creation inside proposal review. Notifications record and navigate to events.

The current Inbox supplies generic processing messages. Proposal and integration events, unread controls, and direct destinations in the mockups are proposed. Back them with typed events tied to actual records, scoped read status, deduplication, and current permission checks. Show only confirmed issue creation. An unknown publication result offers **Check status**, while a known setup blocker points to the missing step. Empty, filtered-empty, and unavailable-target states keep the user in context.

## Profile

Use **Account** as the nav label and show a private profile landing page. Put the display name and avatar or initial at the top beside **Manage account**. Show the current workspace and switching when relevant. Use grouped rows for Connections, Credits and usage, Billing, Appearance, Notifications, Privacy and data, Help, and Sign out. On desktop, the groups can sit side by side. Keep data export and deletion in Privacy and data or the existing account management route.

Appearance keeps the existing device, light and dark choices and interface motion preference. Connections shows each authorized provider or client with its real status and the next supported action. Use the settings destination for browser notification preferences, and keep unavailable delivery methods out of the ready-state UI. Use only the available account fields and real balances when the user opens usage. The social profile screenshot supplies the identity layout, and the account screen uses VibeScroll's existing private settings.

## Review checks

- Confirm the four insight titles are reachable with touch, mouse, and keyboard. Check directly cited, transcript-only, unavailable, and loading previews. Confirm external destinations and current evidence access.
- Check the full-screen feed in both directions, short drags, panel boundaries, rapid reversal, reduced motion, playback continuity, and restoring the same post. At enlarged text sizes, make the reading panel usable even if the lifted media needs less space.
- Verify that no-project and no-proposal states preserve insights and access to projects. Compare the same post and analysis version across Home and the full post.
- Check Activity filtering, read status, item routing, permissions, and unknown issue status. Check account navigation, appearance persistence, connection recovery, and sign-out.

The images are AI-generated. Thumbnails in the boards are visual reproductions of retained references. The app should serve the exact authorized image bytes. Activity and connection state examples are illustrative. This review makes no application or deployment change.
