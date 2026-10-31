# ADR 167: generate widget resource cache keys

Date: 26 October 2026. Status: accepted and published in a7a48cb.

## Context

Exact frontend21de39d passed CI and staged checks, then same-build promotion. Real ChatGPT rendering with developer CSP enforcement on still showed the preceding HTML, including five citation rows and the raw coverage label. Every renderer advertised a constant v1.html URI. OpenAI's [UI integration guidance](https://developers.openai.com/plugins/build/chatgpt-ui) identifies resource URIs as cache keys and requires new identifiers for changed UI bundles.

## Decision

The widget build computes a16-character SHA-256 prefix from each self-contained HTML resource. Generated widgetResourceUris supplies the URI to the matching resource registration and every renderer, including ordinary fetch/save. Protocol generation remains v1. Resource discovery lists the three current identifiers.

Scoped resource templates retain old v1 and v1-fingerprint URLs for conversation recovery using current v1-compatible HTML. They do not promise immutable historical HTML. They preserve knowledge:read and reject other contract versions. Widget data still reauthorizes the current grant and selected source. Neither a stale URI nor an exported snapshot grants live authority.

## Validation and limits

A real stateless-MCP regression failed against the constant URI. It now reads every advertised renderer resource and matches the URI fingerprint to its returned HTML. Compatibility cases cover original and older-fingerprint URLs, missing scope and unsupported protocol.33 focused protocol/access cases, widget build, full types and zero-warning lint passed. Exact combined CI, publication, discovery refresh and actual two/five/two-reference rendering with CSP enforcement on remain required. No new backend, permission, network allowlist or paid model is needed.

## Production evidence

Exact CI40388132270 passed and one fixed Basic build was promoted unchanged. Refreshing the existing ChatGPT plugin delivered current HTML with CSP enforcement on. Native pointer disclosure passed2/5/2 and expanded Library reads succeeded. The earlier fixed-URI failure remains in its separate receipt. Actual Codex rendering and live keyboard activation are not certified by this checkpoint. [Host receipt](../operations/evidence/launch-20261026-mcp-widget-cache-publication.json).
