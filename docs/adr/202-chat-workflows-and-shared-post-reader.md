# ADR 202: chat workflows and a shared post reader

Date: October 29, 2026. Status: accepted direction; implementation pending.

## Context

Direct hosted subscription integration is paused pending provider access. The owner now prefers ChatGPT/Codex chats for insight search, project proposals and feedback, with MCP reading and updating VibeScroll. They also request a polished website feed showing saved posts beside insights/project connections, using assistant-ui where suitable and later sharing presentation with an embedded MCP view.

## Decision

Follow [the chat-first demo plan](../strategy/CHAT-FIRST-DEMO.md), R099–R101. Keep authoritative evidence, versioned proposals, project associations and feedback in VibeScroll. Use the user's existing chat host for discussion/reasoning and the existing credit worker for requested preparation/analysis. Do not upload subscription credentials or resume ADR201.

First close the gap between exact-version project-context reads and saving/revising a proposal actually composed in chat. Existing draft tools require an already completed relevant evaluation; they do not implement arbitrary chat-written proposal persistence. Extend the existing data model with idempotency, revision checks and exact source/project bindings instead of a parallel proposal database.

Build and accept one reusable website post/insight reader, then use it in the lazy home feed and a later compact MCP Apps adapter. Prefer suitable assistant-ui controls, preserve existing React/Radix/Tailwind presentation and avoid another chat backend. Supported source embeds may play; thumbnails/retained frames and source links remain valid fallbacks. Raw media retention does not change.

## Acceptance and consequence

The current MCP read-only profile calls passed, including five selected project contexts, no setup required and automatic analysis enabled. No job, proposal write, credits or deployment occurred. The UI remains disabled until its own supported-host acceptance. Source/analysis versions and proposal IDs let users continue across chats; one permanent chat is not a data dependency.

The implementation checkpoints, demo scenario and separate production gates are in the plan. This ADR records a direction, not shipped proposal CRUD, a new feed, paid customer readiness or embedded UI activation.
