# MCP startup and panel repair

R157, November 8, 2026. The owner supplied an actual Codex panel screenshot showing duplicate workspace selection, internal grant-discovery text, a pending credit label and little useful content.

## Diagnosis

The older bootstrap snapshot contains profiles and coverage but lacks selected_profile_id. The client accepts it, cannot resolve a default and returns before reading workspace state or account credits. Its selector visually displays the first option while profileId is empty. The separate chooser then repeats those options, including the old catalog service organization. A fresh ordinary open_vibescroll read returns the current saved default and excludes that service organization.

Refreshing legacy discovery through the current server preserves its selection and access rules. A current response with an explicitly null selection remains a genuine user choice. Financial status starts after workspace resolution.

## Presentation

| Before | After | Purpose |
| --- | --- | --- |
| Large separate workspace row plus repeated choice buttons | One compact header switcher after selection | Open on the saved default and keep switching available |
| Raw knowledge-grant coverage in the main screen | Plain chooser copy and collapsed result details | Put technical detail behind a disclosure |
| Pending credit label without an account request | Financial status appears after a workspace resolves | Reflect the actual loading operation |
| Wrapped navigation with catalog as a sixth destination | Five destinations with catalog inside Explore | Preserve the product's existing navigation |
| Viewport-sized feed sections inside an auto-resizing iframe | Bounded embedded section heights and responsive shared columns | Prevent a tall image from pushing insights far below the panel |

Reuse the approved website post/insight/proposal components, existing dark/light tokens, typeface and icons. A genuinely ambiguous workspace list uses spaced full-width rows with one action each. Initial discovery has a short loading state with reduced-motion support.

## Verification

Both targeted regressions fail before the fix and pass afterward. The built official AppBridge harness exercises older bootstrap recovery and genuine ambiguity at desktop920px and phone390/320px in both themes. Assert useful content, one switcher after resolution, zero switchers before a required choice, readable option spacing, bounded feed sections and no horizontal overflow. Record final exact CI, production build and actual-host acceptance separately in CURRENT-STATE. No source analysis is needed for this correction.
