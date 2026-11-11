# Onboarding research, November 2

Scope: planning only for R148. Read-only research created no source, analysis, paid model request, feedback, grant, purchase or deployment. Existing production behavior remains unchanged.

## VibeScroll retrieval

Used the current connected VibeScroll MCP, discovered authorized profiles with get_profile and searched ranked_v1 across the personal library. The onboarding query was continued through every returned page until has_more=false, returning 60 matches across 25 distinct accessible posts and 60 session candidates. Quiz, activation and paywall searches added context. Six especially relevant posts were read in structured form, including the benefit-copy post after a successful retry.

These are lexical indexed results, not complete recall over all raw transcripts. A federated read included the separately granted shared-catalog workspace, but its search index reported not ready at revision 0. Do not claim the whole catalog was searched or enable an index/backfill from this investigation. Unrelated results such as document-signing onboarding and ad formats were excluded from the product recommendation.

| Saved post                                                                                                                                         | Relevant lesson                                                                                                            | Decision                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [Promise, quiz, plan and paywall](https://scroll.companynerve.com/app/nn7d15ckc9p6xsx0z7sd09w7298fey3s/posts/px7ezg2dqrzz94qgapkfzt46hn8ffc5p)     | A clear promise, answers carried into the result, concrete value before price and clear billing terms.                     | Adopt the sequence with a real retained-post result. Do not copy the example's free trial. |
| [Benefit-led step wording](https://scroll.companynerve.com/app/nn7d15ckc9p6xsx0z7sd09w7298fey3s/posts/px7ffjrxq1c3nmpetq7s1x6vjh8ffb4k)            | Explain what answering or connecting enables. The claimed Duolingo improvement has conflicting transcript/graphic figures. | Explain each step in one useful line; no conversion percentage.                            |
| [Real interaction before the paywall](https://scroll.companynerve.com/app/nn7d15ckc9p6xsx0z7sd09w7298fey3s/posts/px74c137jwz2e4tek0jph8bd418ffb89) | Let people perform the core task and inspect drop-off by step.                                                             | Expand a real insight in Home, then keep/apply. No claimed VibeScroll improvement.         |
| [Manageable setup steps](https://scroll.companynerve.com/app/nn7d15ckc9p6xsx0z7sd09w7298fey3s/posts/px7f66ea6vdw0tzkz1aa2v8zrn8g36gv)              | Useful support and progress can be spread across small decisions; defer irrelevant explanation.                            | Preserve the quiz and simplify each screen.                                                |
| [Goal-linked activation](https://scroll.companynerve.com/app/nn7d15ckc9p6xsx0z7sd09w7298fey3s/posts/px7ansjfrh14dn60zxa9m2c76d8g3hqk)              | Guide users toward a meaningful result and offer optional contextual help.                                                 | Tie the tutorial to answers; defer lifecycle emails and paid acquisition work.             |
| [Broader visual references](https://scroll.companynerve.com/app/nn7d15ckc9p6xsx0z7sd09w7298fey3s/posts/px70d1ea60me0dtms8yy1ydpex8g2z25)           | Study motion and product personality beyond familiar examples. Mascot/gamification claims are subjective or unverified.    | Restrained interaction feedback in V1; mascot only as an optional V2 proposal.             |

Paywall-focused results recommend early pricing and sometimes trials, artificial waits, contrast changes or urgent reminders. Retain honest price disclosure and value before purchase. Reject fake waits and unsupported uplift, and preserve the owner's paid-only offer. Several posts repeat the same creator/data narrative; repetition is not independent evidence.

## Exponential reference

Located the owner's actual private [StefanDG1/Exponential](https://github.com/StefanDG1/Exponential) repository, rather than assuming an unrelated public project was the reference. Read source at commit 8f44f5cb1e59515e05d4568568506b8a38eb7a96:

- [October 14 refinement](https://github.com/StefanDG1/Exponential/blob/8f44f5cb1e59515e05d4568568506b8a38eb7a96/docs/plans/2026-10-14-onboarding-expo-refinement.md): actual visited-step Back history, no auto-advance, visible choices, shared real runtime and safe account handoff.
- [October 17 runtime consistency](https://github.com/StefanDG1/Exponential/blob/8f44f5cb1e59515e05d4568568506b8a38eb7a96/docs/plans/2026-10-17-onboarding-runtime-polish.md): use the ordinary app's components and keep one idea per screen.
- Inspected the existing local mobile parent-question capture and copied it unchanged into the [reference collection](references/onboarding-review-2026-11-02/README.md). This is a historical Exponential capture, not a newly verified production state.

Borrow interaction structure and component reuse. Do not copy educational grading, XP, trial rewards, the mascot, Romanian wording or unrelated domain rules into VibeScroll. The quiz needs its own concise English product copy.

## External references

- [Linear's official start guide](https://linear.app/docs/start-guide) was read in the browser. It places a demo overview before workspace creation, with role-specific guidance later. This supports showing the product before requesting all setup; it does not prove conversion gains.
- [Linear screenshot collection](https://www.saasui.design/application/linear) was inspected. A browser-captured workspace-creation reference is retained with attribution. Borrow calm hierarchy and focus; its dropdowns and multi-field setup are not VibeScroll requirements.
- [Appcues' Duolingo walkthrough](https://goodux.appcues.com/blog/duolingo-user-onboarding) was read and identifies goal, motivation and actual-exercise screenshot examples. Borrow one decision per page, progress and trying the product. This historical walkthrough is not verification of today's Duolingo flow. Its mascot is excluded from V1. A clip-coordinate attempt captured the article header rather than the intended choice screen; that invalid capture is excluded from the retained references.

Browser research used the required browser-harness and its recording. No external account was created, no paywall bypassed and no screenshot asset is licensed for use as VibeScroll product artwork. Reference images remain attributed research artifacts.

## Recommendation

Use a guided quiz followed by the actual shared Home feed. Each answer must have a visible consequence. Make MCP prominent with a working connect-later branch, explain current credit boundaries fairly, preserve existing account/GitHub/Pro state and guide a real first proposal after access. Keep optional integrations and provider failures from trapping users. Measure the resulting funnel before adding a mascot, adaptive prompts or more elaborate experiments.
