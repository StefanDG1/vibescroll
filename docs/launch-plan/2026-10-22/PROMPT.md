# Short execution prompt

Use this in a new implementation session in this repository. Select GPT-6.1 Sol with Extra High reasoning, `xhigh`, before sending. The prompt requests a beginning preflight, then implementation; it is not an instruction to start implementation while editing this document.

```text
Implement ALL engineering work in docs/launch-plan/2026-10-22/README.md and its linked plans. Follow AGENTS.md, current decisions, all four foundational documents and UNATTENDED-RUN.md. Inspect existing code/issues/PRs first; preserve tested behavior and unrelated work.

I will sleep after setup. FIRST inspect requirements, ask one batch of necessary permissions and complete all known logins, consent, MFA, browser access and approved installs while I am present. Confirm readiness before I leave. Reuse supported session renewal; if later interactive authentication blocks something, continue independent work. Close unnecessary task-created tabs/workers without touching my unrelated tabs.

Use GPT-6.1 Sol Extra High, xhigh, as root, with GPT-6.1 Sol High or Medium subagents chosen for difficulty and efficiency. Do not switch to Ultra. Verify actual settings and host limits. Own integration, shared contracts and final review.

Finish the entire product scope, website/media/help, GitHub presentation, public collections/reuse/globe and both adapters through reviewable stages, not only the pilot subset. Preserve release/provider/privacy gates. Prepare unsent customer-acquisition materials; never invent live acceptance or customers.

Maximum additional Convex spend: US$2 TOTAL across agents, CI and tests. Default local/offline with paid gateways disabled. Hosted work requires a verified conservative bound; otherwise skip it and record live checks pending. No other new spending.

Implement, review and test thoroughly. Commit/push coherent feature branches and create tested draft PRs with acceptance evidence, screenshots, exact-head CI and honest failures/skips. Do not merge, deploy, change live billing or publicly post unless specifically approved at preflight. Finish with PR links, integrated test results, a clean pushed checkout, budget evidence and remaining external/human steps. Persist progress through long runs; never weaken controls to finish.
```
