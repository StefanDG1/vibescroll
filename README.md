# VibeScroll

Make scrolling useful. Save practical content, find its main ideas with source evidence and decide what to apply to your projects. Use the library on its own or connect GitHub to review plans and approved code changes.

Open [the hosted application](https://scroll.companynerve.com/app) or follow the [first-source tutorial](docs/HOSTED-TUTORIAL.md). The web app works on phone and desktop; GitHub is optional for your first library result.

## Main features

- Save permitted links, upload media or import Instagram Saved metadata. Metadata import captures links; private or blocked media may need a permitted upload.
- Read extracted main ideas with transcript or sampled-frame evidence and timestamps. Inspect coverage and uncertainty alongside each result.
- Find and organize saved knowledge with search, topics, Tree and Folders views, and Personal/Business filing.
- Check whether ideas fit selected GitHub projects using confirmed project context. No fit, already implemented and deferred are useful outcomes too.
- Review, edit or export implementation plans. Separately approve funded, isolated Vercel coding, inspect the patch and checks, and publish an approved draft PR.
- Ask ChatGPT or Codex to retrieve approved library knowledge through MCP, with citations back to VibeScroll. This integration is currently a private pilot.
- Export or delete your library data and revoke assistant access through the app.

See [capabilities and limits](docs/CAPABILITIES.md) for evidence and availability details.

## How it works

Save content → extract cited insights → organize and connect knowledge → check project relevance → review a proposal and plan → approve coding → review a draft PR → record the outcome.

1. Save a permitted link or upload media to your library.
2. Review the analysis route and cost, then approve processing. VibeScroll extracts main ideas with transcript or sampled-frame references so you can inspect the evidence and coverage.
3. Browse related ideas through topics, Tree or Folders. Keep useful knowledge for reference and correct its organization when needed.
4. Optionally connect GitHub, select repositories and confirm project context. Evaluate relevant ideas against what a project needs and already implements.
5. Review the proposed change and its evidence. Refine, edit or export a plan when you want to act. You can also reject an idea, defer it, or keep a no-fit or already-implemented result.
6. Separately approve coding for the selected repository, plan, funding route and spending limit. Review the resulting patch and checks before approving draft PR publication. You control merge and deployment.
7. Follow the PR status and record whether the change helped. Merging a PR does not establish that the change helped; benefit needs its own evidence. Return to that knowledge when reviewing the next idea.

The library is useful without GitHub, and a saved source does not have to become code. You can stop at cited insights, keep an idea for later or export a plan to use elsewhere. See the [first-source tutorial](docs/HOSTED-TUTORIAL.md) for the guided journey.

## Use with ChatGPT or an AI agent

VibeScroll exposes a remote MCP server at `https://scroll.companynerve.com/mcp`. The private pilot has verified ChatGPT and native Codex retrieval. Public directory availability and general onboarding for other agent clients are not established.

For a supported, registered assistant:

1. Connect VibeScroll through the assistant host's OAuth connection flow.
2. In VibeScroll **Connections**, choose the assistant, Personal, Business or Both library access, permitted actions and any project context to share.
3. Review and save the grant after a recent app sign-in. Choose until you turn access off, seven days or thirty days. The selected library scope includes future eligible posts; you can revoke it in Connections.

Connecting the assistant alone does not grant library access. A new agent host also needs a registered OAuth client and server configuration; the endpoint alone is insufficient. See the [assistant access runbook](docs/operations/assistant-access.md) for setup.

Once connected, ask, for example: "Search my VibeScroll library for interface design ideas and cite the sources."

| Tool             | What an agent can retrieve                                     |
| ---------------- | -------------------------------------------------------------- |
| `get_profile`    | Approved workspace profiles and selected project context       |
| `search`         | Matching extracted ideas, excerpts and source links            |
| `fetch`          | A current permitted result with supporting evidence timestamps |
| `get_job_status` | Current status of selected or explicitly saved work            |

The usual flow is `get_profile` → `search` → follow `next_cursor` → `fetch` selected result IDs. Each search page examines up to five posts and returns up to 20 matching ideas; one page does not establish full-library coverage. Retrieval excludes original transcripts, media, repository code, credentials and conversation history.

Additional tools support explicit link saving, feedback and private project suggestions, subject to their granted actions and separate acceptance checks. `request_analysis` returns the app's review link without starting processing or reserving money. The connector does not authorize coding or publication, or connect a ChatGPT subscription to fund processing. Background MCP Events remain disabled.

## Try the local demo

For a labeled synthetic preview, use Node 24 and pnpm 12.3.4:

```powershell
pnpm install --frozen-lockfile
node scripts/setup-preflight.mjs --demo
pnpm dev
```

Open `http://localhost:3001/demo`. Real setup uses [your own provider accounts](docs/PERSONAL-SETUP.md); [contribution](docs/CONTRIBUTING.md) and [private security reporting](docs/SECURITY.md) have separate paths. Keep credentials, source archives and private evidence out of Git.

## Availability and documentation

Managed analysis and approved Vercel coding use explicit funding, reservations and existing ceilings. Personal ChatGPT analysis requires the user's eligible paired laptop; general hosted commercial ChatGPT access and Windows local coding remain gated.

Use [the documentation map](docs/README.md), [current readiness](docs/V1-READINESS.md) and [implementation evidence](docs/implementation-status.md) for the current release record. Numerical human scoring, settled provider invoices, full serving recovery and independent setup acceptance remain open. No accuracy percentage, customer savings or unlimited usage is promised.

V1-authored code uses MIT, preserving CompanyNerve's exported foundation and upstream notices. Hosting, managed processing and support are the paid service's value. Both routes use one maintained core. V2 remains a separate decision. See [versioning](docs/VERSIONING.md) for immutable alpha releases and exact deployed commits.
