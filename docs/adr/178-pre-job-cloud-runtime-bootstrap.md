# ADR 178: prepare the pinned runtime in the task that executes the event

Date: October 27, 2026. Status: private automatic media acceptance passed; controlled candidate publication tracked separately.

## Observed failure

The actual closed-tab app Save delivered its signed event, but the automatic task observed ENOENT for the private ASR runtime and its receipts before creating a source job. A later bounded manual command confirmed the missing directory. The caption tools, separately downloaded complete model and new model-readiness receipt still existed. The reason only the runtime disappeared is unknown. Do not describe the whole filesystem as reset or promise that one manually prepared directory will persist.

Official [Cloud environment documentation](https://learn.chatgpt.com/docs/environments/cloud-environments) distinguishes a published reusable prepared filesystem, task-specific saved state and new tasks. [MCP Events](https://developers.openai.com/plugins/build/mcp-events) delivers events asynchronously to a subscribed Work chat. Neither publication of an MCP event nor a previous readiness report proves that a particular runtime path exists when the event executes. A published environment could be another supported route; it has not been configured or tested for this repository-free owner pilot.

## Decision

Use a separate immutable, tools-only bootstrap archive. It preserves the reviewed CPython3.13.17 and24 wheel pins in the original sealed plan. The helper accepts only a new owned directory, downloads those25 pinned public files once, creates a private environment with the existing uv0.13.4 in offline/no-index/no-deps/no-build mode and verifies installed payloads against the original wheels. No model, source media, application call, inference or source job belongs to bootstrap.

The source-free bootstrap is allowed before requesting or claiming a job, including preparation for a current finite saved intent. Bound runtime to1GiB, combined owned caches plus disposable-tool allowance to2GiB and setup to900 seconds with zero automatic retries. Preserve managed proxy/CA controls, historical caches and partial attempts. Never repair an existing target, upgrade the installer, add a paid fallback or download packages inside the active source lease. A missing model still needs its separately pinned setup; this runtime helper cannot manufacture readiness for it.

Every event must verify current capabilities. Prepare a fresh disposable runtime before claiming work rather than relying on a previous runtime's retention. Reuse only independently verified model bytes, not a historical badge or an absent receipt. The existing caption-first preparation, sampled JPEG return, source/grant/policy binding and finite execution lease stay unchanged. Static readiness does not construct a model. Cached model initialization belongs to admitted preparation under fresh V2 decoder denial, and usable captions bypass ASR.

The first native bootstrap returned success after verifying25 downloads,24 versions and2,229 installed wheel payloads. A follow-up check observed its generated UNREADY marker despite the helper's successful unlink; the cause is unknown. Independent revalidation then verified3,480 CPython regular files, the interpreter link, all25 downloaded pins,24 versions,2,229 installed payloads and the strict model. The known marker was archived with metadata preserved. Fresh V2 denial and a source-free model load passed. The candidate removes this redundant marker and publishes one atomic positive receipt only after substantive checks. Failure leaves no ready proof, and an existing target cannot be reused or repaired. This does not relax any byte, version, path or isolation check.

The ordinary post page must also stop presenting historical local/credit intake controls while a current authorized Cloud intent is waiting before its first generation. Reuse the existing current-intent validator for both status and legacy actions. Expired or invalid intents gain no authority; existing Cloud generations retain their current control owner. Preserve all historical intakes and reservations.

## Acceptance

Offline checks cover byte/hash/transport/deadline bounds, archive traversal/expansion, offline installation, installed-byte tampering and preservation of existing roots. A native source-free test must verify the actual interpreter, wheel payloads, preserved model and V2 model load. Then an actual app Save with the native tab closed must trigger the automatic task, acquire the permitted Reel, transcribe or reuse captions, return every real JPEG and thumbnail, commit cited analysis and refresh the protected post. Delivery or bootstrap alone does not complete this acceptance.

Frontend/backend70c9aac are published after exact CI40437613587 and the controlled same-build release. The production receipt records canonical checks. Saved data, reserved and unknown sources, original disputed repair, full-main migration and provider/privacy gates remain. The owner permits continuation under cumulative EUR10.50 and Vercel included usage below USD20 without repeated Vercel permission requests. Retained allowances are not invoices.

## October27 accepted outcome

The fresh app Save completed automatically with its ChatGPT tab closed. The current pinned bootstrap preceded job request, and the actual result passed52 displayed transcript segments,8 retained JPEG byte/hash checks, thumbnail and full-size viewing,6 insights and57 evidence references. Exact Ubuntu CI40437613587 passed. The earlier source separately became an expired queued/unclaimed generation and remains protected; its initial reported runtime failure is historical evidence, not the successful source. See the [accepted receipt](../operations/evidence/launch-20261027-automatic-reel-accepted.json). Provider deletion, settled usage, cold model provisioning and general customer rollout remain open.
