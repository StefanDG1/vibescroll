# ADR 201: direct ChatGPT plan access and prepared evidence

Date: October 29, 2026. Status: accepted implementation direction; hosted provider access pending.

## Context

The owner requests a single ChatGPT connection for direct prepared-image/transcript analysis and later proposals, avoiding Work Cloud event latency. They report an application request with no known response and ask whether open-source distribution already permits hosted use.

## Decision

Follow [the staged plan](../strategy/DIRECT-CHATGPT-PLAN.md), requirement R098. Reuse the existing public-flow protocol and prepared evidence contracts. Build and test transport-free evidence adaptation first. Keep supported self-hosted deployment distinct from the paid VibeScroll service: the official public guide directs paid/remotely hosted apps to the interest form. No approved hosted contract/client or live direct inference is established by the MIT licence, an application submission, identity-only OAuth or the existing MCP connection.

Keep current native and credit production paths. Do not enable hosted callback/token transfer or change login, grants, pricing, balances, model selection or shared catalog authorization for this foundation. Do not upload local OAuth credentials. Credentials for any approved future route belong to the authenticated actor and OpenAI registration, not every member of a VibeScroll workspace.

## Validation and consequence

The evidence adapter verifies exact prepared frame bytes and bindings, reuses the strict stream-completion parser and validates citations after server binding. Tests use a synthetic JPEG and mocked SSE, never customer media or live inference. Two initial fixture assertions used image citations rather than the prepared contract's timestamped video observations; correcting the fixture made the existing citation validator pass without weakening it.

Hosted OAuth, distributed refresh, actual account model discovery, direct inference, automatic Save completion and project proposals each retain separate acceptance. A commercial response is required before hosted activation, not before offline development. No production publication or new analysis charge is necessary for this increment.
