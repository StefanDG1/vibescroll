# Proposal issue canary for review

Target: StefanDG1/vibescroll. This is prepared text, not a published issue. The final frozen handoff also appends its exact proposal/source-version references and authenticated completion instructions. It does not authorize coding, merging or paid advertising.

## Title

Give the public demo a synthetic saved-post-to-plan social preview

## Problem

The app's root metadata uses the same static social-card.png for every page. The public demo labels its workflow but does not provide its own OpenGraph/Twitter result preview. The existing landing-hero task in issue196 is already implemented and must not be duplicated.

## Proposed change

Add a dedicated social preview for the public synthetic demo, reusing the existing post, insight and plan design. Show the transformation from saved post to insight to reviewed plan. Keep the content authored and explicitly synthetic. Do not expose real users' post titles, media, transcripts, projects or discussion, and do not add a public route for private results.

## Steps

1. Inspect the current demo, root metadata, social-card asset and shared result components at the reviewed repository revision.
2. Create a1200×630 synthetic result preview using existing design tokens and a supported Next.js image/static-asset path.
3. Override only the public demo's OpenGraph/Twitter metadata with the preview and accurate accessible text.
4. Verify image dimensions, metadata URLs, synthetic labeling, light/dark legibility and absence of private data. Keep the reader and Library layout unchanged.
5. Report the actual PR/commit, validation and any remaining uncertainty through the proposal's authenticated VibeScroll completion tool.

## Acceptance criteria

- The public demo returns its own absolute preview-image metadata and a decodable1200×630 image.
- The visual shows one synthetic post, a cited insight concept and a project plan without claiming measured results.
- Private app routes, evidence URLs, account data and real media are absent from public output.
- Issue196's implemented hero is preserved; no second hero rebuild, paid campaign, new provider or AI call is introduced.
- The linked VibeScroll proposal retains actual issue/PR feedback, with model reports separate from signed provider observations.

## Benefit hypothesis

A concrete product-result preview may explain the demo better when shared. This has not been validated with users and claims no conversion increase.

## Inspection record

At the current implementation branch, apps/starter/app/layout.tsx declares a static social-card.png for OpenGraph/Twitter. apps/starter/app/demo/page.tsx supplies a demo title/robots metadata only and renders authored synthetic fixtures. apps/starter/lib/home-feed-demo.ts contains reusable synthetic result content. The selected project's saved main snapshot95f4265 is stale relative to remote maincf19602 at inspection. Refresh and re-read the actual project context before binding the handoff; branch inspection is not evidence that the whole implementation branch is merged into main.
