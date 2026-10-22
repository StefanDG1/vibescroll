# Unattended implementation contract

Status: requirements for a future implementation session. The owner will be asleep after the initial setup and wants all known permissions and logins addressed first. The current documentation task does not start that run.

## Model and delegation

Select GPT-6.1 Sol with Extra High reasoning, `xhigh`, in the application before starting. The owner selected this instead of Ultra. Keep the root at this setting and use explicit subagent delegation for independent work. If the requested setting is unavailable, resolve that during preflight rather than silently substituting a model or enabling Ultra. A prompt cannot change an already selected root model or combine two effort settings.

Explicitly use GPT-6.1 Sol subagents where independent work benefits. Medium fits bounded inspection, documentation, assets and routine tests. High fits authorization, schemas, state machines, spending, recovery and difficult integration. Give each agent a bounded goal, applicable instructions, file ownership, evidence requirements and the shared budget. Use fresh task context when the host requires it to set an effort override. Verify accepted settings rather than claiming an unobserved model/effort.

Respect the host's concurrency limit. More agents do not automatically mean faster or cheaper work. The root owns shared contracts, integration, dependency/lockfile edits, final review and the cumulative cost ledger. Avoid parallel writes to shared files and parallel use of one local browser-control daemon. Reuse agents where helpful. Do not create user-visible chats as a substitute for subagents.

[OpenAI's multi-agent guidance](https://developers.openai.com/codex/multi-agent/) explains delegation and per-agent configuration. [Reasoning guidance](https://developers.openai.com/api/docs/guides/reasoning) distinguishes effort choices. These do not override the actual host's exposed controls or account eligibility.

## Preflight before the owner sleeps

First inspect the baseline, instructions, plan, credentials availability without revealing values, installed runtime, local test paths, CI/preview side effects and all external gates. Start from a clean tracked checkout. Preserve unrelated work. Read existing pull requests, including the current dependency PR, before duplicating updates. Choose a branch/PR strategy that avoids overlapping dependency upgrades.

Ask one concise batch of concrete decisions and complete known interactive setup while the owner is present:

- Confirm authority to implement the entire plan, make local commits, push feature branches, open/update draft PRs and run the reviewed CI. This is the intended overnight scope. Distinguish approval from permission to merge or deploy.
- Verify GitHub login/permissions, browser remote-debugging consent if needed, the own-account official client session, and any isolated test-account WorkOS/GitHub connection. Perform required user-driven sign-in, consent and MFA now. Never request passwords or tokens in chat.
- Confirm the test environment and named Convex deployment, if any. Default to local/offline with paid gateway access disabled. If hosted tests are requested, show the exact limit/control, team-wide disable risk and remaining allowance before seeking permission to change it.
- Review other potential costs. The US$2 limit is for additional Convex usage; it is not authorization for other services. Default to no new paid API, cloud compute purchase, advertising, domain, live billing or paid tool. State whether the current own-account session has sufficient known quota; quota is not guaranteed.
- List any required laptop changes, downloads, administrator prompts or restarts. Default to project-scoped dependency fixes. Install approved prerequisites while the owner is awake; defer disruptive system upgrades if they cannot complete safely now.
- Confirm whether public metadata edits are allowed. Default to preparing them in the PR. Keep accounts, outreach, directory submissions and public marketing unsent unless each category is explicitly approved. No HN AI-authored posting.
- Confirm production remains unchanged: no main merge, production deploy, schema/data migration, grant activation, live charges, DNS change or destructive cleanup unless a specific reviewed action has separate approval.

Do not ask for information that the repository, connected tools or an existing authorization already provides. Explain any permission that truly needs the owner. Do not delay reversible local work for optional preferences. Required permissions must be resolved before their dependent operation; silence is not approval.

End preflight with a short readiness receipt: selected model/effort, repository/branch, verified login routes, test mode, budget controls, permitted actions, excluded actions and unresolved gates. If an essential interactive step remains, say so before the owner leaves. An uninterrupted session or completion of every third-party integration cannot be guaranteed.

## Sessions and browser tabs

Maintain a private task inventory of login dependencies and tabs created by this run. Keep secrets, cookies, refresh tokens, authorization codes and signed URLs out of prompts, repositories, PRs, logs and screenshots.

Use normal supported provider/client session renewal and saved local protected credentials where authorized. Recheck session validity at natural phase boundaries and before a dependent integration test. Save progress before known expiry. Do not manufacture activity to bypass inactivity policies, prolong consent beyond its scope, scrape OAuth tokens or automatically approve new consent/MFA. Browser reload is not a substitute for a valid session.

If later renewal needs the owner, stop that integration, record its safe failure state and continue independent work. Do not keep a prompt-retry loop running all night. Prepare an exact recovery step for the morning.

Close task-created research tabs when their evidence is saved, and test tabs when their phase is verified. Retain only tabs needed for active tests/review. Do not close unrelated user tabs or log the user out of other work. Close all remaining disposable task tabs and stop task-owned servers/workers at completion. Preserve review artifacts and protected account connections. Avoid leaving billable temporary browsers or compute running.

## Shared Convex ceiling

The maximum is US$2 of additional Convex charges for the entire run, including descendants, CI, previews and verification. It is not US$2 per agent, PR, deployment or calendar day. Crossing midnight does not reset this task's allowance. Existing plan/seat fees are outside this incremental task limit; record baseline context without claiming responsibility for unrelated background traffic.

Default to local backend, isolated fixtures and offline tests. Verify targets before running scripts: a command on a laptop may still call production Convex or a paid gateway. Do not run mass imports, library rescans, video reanalysis, production load tests, broad live subscriptions, continuous log tails or watch-mode polling. Disable paid provider egress in synthetic tests and prevent retries from escaping test adapters.

[Convex team spending limits](https://docs.convex.dev/dashboard/teams/teams) include warning and disable controls. The disable threshold affects all projects in that team and applies to usage beyond plan inclusions, not seat fees. A warning alone is not enforcement. Do not alter a live team's limit without explicit permission for its availability impact.

[Deployment usage limits](https://docs.convex.dev/production/usage-limits) bound specified resources per UTC day/month. They do not by themselves establish a whole-run dollar cap across services. Account for current usage, region, applicable rates, storage/egress and outstanding work before reserving any hosted test allowance. Verify supported limits rather than pasting commands from newer documentation into an incompatible CLI.

[Local deployments](https://docs.convex.dev/cli/local-deployments) can avoid ordinary cloud-development work, but local does not automatically mean no paid access. In particular, [project-connected AI Gateway calls](https://docs.convex.dev/ai-gateway/usage-and-billing) can charge the team. Already-issued credentials/in-flight requests can finish after a gateway limit is reached. Disable this route for budget-safe local tests.

Keep a single root-owned ledger with environment, baseline, estimated worst-case reservation, observed usage, reporting lag and active work. Permit hosted activity only after a conservative bounded reservation fits within the remaining US$2 and verified controls. Leave headroom for lag/in-flight work. Never interpret missing metrics as zero. If no enforceable conservative bound is available, spend zero through hosted Convex and mark those live checks pending. Do not buy a paid monitoring service to enforce the limit.

The operator already has other live activity. This run cannot certify a future whole-account invoice from a task ledger alone. Report observed/estimated/unsettled amounts separately. Never raise a threshold, add a deployment or switch credentials to get around the ceiling. Stop all task-owned hosted work before its approved allowance is exhausted.

## Implementation and PR strategy

The root audits existing capabilities first, agrees shared contracts, then implements all work packages in dependency order. Produce real backend/UI behavior and recovery; avoid placeholder-only later phases. Continue independently buildable public collection, reuse, globe, website and repository work even when a provider/human release gate remains. Leave blocked live activation disabled and its acceptance explicitly pending.

Use a small set of coherent feature branches or stacked draft PRs, rather than one enormous change or dozens of disconnected patches. Proposed groups are reliability/funding/cost, core UX/help/project decisions, website/media/GitHub, and public knowledge/discovery/adapters. Adjust to actual dependencies. Do not merge main. Verify an integration branch without merging customer or protected branches.

Read the current repository checks before running them. Preserve exact-approval, tenancy, deletion, secret handling, isolation and billing boundaries. Run appropriate unit/integration/browser checks for changes, then the required formatting, validation, lint, type, test, build, dependency and secret checks for the integrated result. Reuse valid results until a relevant change justifies rerunning. Do not run a full build in every agent.

Inspect mobile/desktop, both themes, keyboard, large text, reduced motion and important error states. Fresh-user live routes, independent hardware, human usefulness and provider permission remain distinct from synthetic tests. Never replace required live evidence with mocks and mark it passed.

For every PR include the concrete problem, final behavior, dependencies, acceptance matrix, exact commands/results and known blockers. Attach created PRs to the chat when supported. Push reviewed commits, check exact-head CI when available and report existing failures honestly. Do not disable checks or lower coverage/security rules to get green results.

## Completion receipt

Deliver PR links, integrated commit, covered work packages, test evidence, review screenshots/videos, current budget ledger, pending external/human acceptance and instructions for the first pilot. Record any auth expiry or gated provider feature with the smallest next action.

Leave the working checkout clean with every intended change committed and pushed, except deliberately private ignored evidence. Do not delete user files to achieve clean status. Stop temporary task-owned processes and close unnecessary task tabs. A long run may exceed a session or quota; persist phase status and exact next actions for recovery rather than claiming that one prompt guarantees unlimited execution.
