# X post support

Implementation candidate, November 10, 2026. Production release and the four saved analyses are pending. See [ADR236](../adr/236-complete-x-post-evidence.md) and the [four-post benchmark](../strategy/X-POST-BENCHMARK-2026-11-10.md).

Submit a public `https://x.com/<handle>/status/<id>` or equivalent `twitter.com` status URL through the normal app Save flow or MCP `save_link`. Tracking parameters and selected-media suffixes normalize to `https://x.com/i/web/status/<id>`. Automatic analysis requires the existing server-preparation configuration and current assistant connection. The original connection and grant are reused.

The job uses gallery-dl first and records `post.provider`. FxTwitter v2 is a single fallback for transport/parser failures. A provider refusal, identity change or incomplete fallback manifest fails without trying another account or bypass. A post that only links to another website remains a text post; linked pages and quoted posts are not attached media.

The app retains the complete caption and a manifest of all acquired direct attachments. Still images and sampled video frames have separate attachment labels and citations. Each video's speech timestamps restart at that video's beginning. Silent or speech-free media may have an empty transcript. Original videos, temporary media URLs and raw audio are removed with the ephemeral sandbox; retained JPEGs and immutable text evidence follow the existing until-deleted result policy.

Do not accept partial attachment success as ready. Inspect the preparation failure phase and exact original job before retrying. An unknown outcome keeps its hold. Do not switch a subscription analysis to API reasoning as recovery. Reanalysis of retained evidence does not reacquire the post or repeat transcription.

Relevant implementation files are `packages/media/x-gallery.lock.json`, `packages/media/x-post-worker.py`, `packages/providers/x-post-preparation.ts` and `packages/contracts/prepared-evidence.ts`. Run `node scripts/sync-decoder.mjs` after changing worker Python. The validator checks generated source equality. Focused verification covers URL identity, provider parsing and fallback boundaries, long captions, missing attachments, mixed media, null-time citations, zero-duration billing and retained context. Production acceptance must additionally inspect real retained JPEG bytes and the exact saved analysis/version for each owner post.

The four-post acceptance set contains two text-only posts and two videos. Keep URLs, full captions, private result IDs and operational receipts in ignored operator output. The committed benchmark documents report aggregate results without private chat context.
