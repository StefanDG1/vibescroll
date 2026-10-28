# ADR 188: choose the existing app workspace for implicit MCP saves

Date: October 29, 2026. Status: local candidate, not yet deployed.

## Problem

A bare TikTok link in a phone chat failed with a generic authorization response. The same original OAuth connection could read its current profile and save the same link when its profile ID was explicit. A bounded production log read established the actual exception: `FORBIDDEN: Choose one current approved profile with get_profile`. The implicit selector counted every active grant, including ones irrelevant to link saving, and refused multiple approved workspace records. The generic MCP error then incorrectly suggested reconnecting.

## Decision

For implicit link saves, consider only currently active grants with links:save, a readable workspace and a current write-capable membership. Prefer the user's existing authorized app default workspace. If that default is not eligible, use the sole eligible workspace. Honor an explicitly supplied profile and retain the normal downstream grant check. Do not create or widen a grant, revive revoked access, change library filing policy or select an arbitrary workspace.

If the choice remains genuinely ambiguous or absent, return the allowlisted PROFILE_SELECTION_REQUIRED result with a get_profile next action. Keep raw backend errors, foreign workspace data and authorization details private. This result is distinct from expired-token authentication, so it must not request a new login, Cloud setup or OAuth app. Other operations preserve their existing selection behavior. Bound candidate reads to fifty approved grants and fail closed on overflow.

Keep an inactive background monitor separate too: an already-configured grant returns cloud_monitor_inactive, preserving the saved post and explaining that its existing task needs to resume when execution allowance is available. It must not ask the user to recreate OAuth or repeat Cloud setup. Actual missing setup or expired/revoked authorization retains its separate checks.

## Acceptance

Exercise the real Save mutation with multiple active grants and an existing eligible app default; a read-only default must not intercept a Save. Revoked permissions still deny access. Exercise authenticated HTTP for ambiguous selection and actual MCP 2.0 transport for the safe next action, with no leaked backend details or authentication challenge. Run full local checks and exact CI, then publish under standing release authority and verify implicit production Save, its stable replay and an already-ready result without another analysis.

The phone TikTok was saved through its explicit current profile for diagnosis, with analyze=false. This proves the OAuth connection works and preserves the user's link; it does not establish that a new automatic analysis completed. The finite native pilot and its consumed attempt allowance remain a separate operational constraint.
