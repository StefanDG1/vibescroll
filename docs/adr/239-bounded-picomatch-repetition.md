# ADR 239: Bound wildcard repetition in Picomatch

Status: accepted. Date: November 18, 2026.

The production dependency audit reports GHSA-fc5q-39xc-vjpf for Picomatch 2.3.2 through Repomix and 4.0.7 through the docs stack. The registry has no patched release. Keep the pinned dependency graph and apply a local parser mitigation to both versions.

Repeated extglob groups containing an unescaped wildcard use Picomatch's existing literal fallback. Ordinary glob wildcards and simple repeated alternatives continue to match as before. The audit accepts the mitigation only when each affected version has its own unexpired record and exact patch hash. Recheck upstream by December 18, 2026.

[Security advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
