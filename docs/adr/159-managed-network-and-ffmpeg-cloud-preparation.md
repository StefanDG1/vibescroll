# ADR 159: use the managed network and existing decoder tools

Date: October26, 2026. Status: implementation candidate.

## Observed failures

The actual Cloud host admits Instagram and its CDN patterns. It does not admit TikTok domains. Before any job or acquisition, runtime inspection found Pillow only in Python3.12, while the verified ASR runtime is Python3.13. The extraction launcher also discarded the inherited managed proxy and certificate configuration. A package hash check or `--help` does not establish preparation readiness.

## Decision

Use the existing verified FFmpeg/FFprobe for JPEG encoding, dimension checks and small pixel comparisons. Remove Pillow from the Cloud path. Keep sampling bounded to eight timestamps and use bounded quality/size attempts until every new JPEG fits81920bytes. A failure stops before preparation binding; never change an already accepted frame hash. Existing non-Cloud decoder dependencies stay intact.

Inherit only standard HTTP proxy/no-proxy and CA variable names from the trusted managed host. Source metadata cannot set them. Keep application credentials and Python search-path overrides out of the child. This preserves the existing restricted enforcement transport; it does not add destinations, disable certificate checks or grant unrestricted networking. Decoding and ASR still run under the verified OS socket-denial layer inside the admitted host.

Keep the initial v3 tool manifest so existing approved v3 leases resolve their original toolchain and policy hashes. New jobs bind the updated package. Retained v2 stays unchanged.

The existing exact-source connection opt-in accepts only the three reviewed policy hashes: retained v2, initial v3 and the current decoder patch. Their source, cost, retention, privacy and execution limits are identical; tests compare those fields. Only implementation pins/protocol labels differ. This keeps an existing bounded opt-in usable after a software patch without rewriting its grant/version or requesting repeated consent. Unknown policy hashes, missing request/execution scopes, changed source/generation, revocation, teams and expired authority still fail. This is not blanket future intake authority.

## Acceptance

Run actual synthetic video/caption preparation without any Pillow import and without ASR/model access. Verify decoded pixels/dimensions/hashes and image bounds independently, and check inherited transport configuration without returning values. Exercise retained v2/v3 lease reads and current-source consent, alongside the existing stale/revoked/unknown-policy tests. Real acquisition and app result remain separate production acceptance. No idle host wake is available from the currently exposed interface.
