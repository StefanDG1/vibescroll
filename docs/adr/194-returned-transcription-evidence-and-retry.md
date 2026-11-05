# ADR194: retain returned transcription before validating coordinates

October29,2026. Status: locally verified candidate; exact CI/publication pending.

The first hosted comparison completed download, frames, transfer, VM shutdown and a successful ASR response, then stopped with INVALID_EVIDENCE. Its receipt lacks response coordinates and a distinct storage error. The exact failed condition is unproved. Do not infer a timing defect or claim it fixed.

Retain a bounded private transcript response before coordinate validation. Strip provider/transport metadata, enforce UTF-8 byte bounds, keep immutable receipts and require source membership for reads. Record counts, interval bounds, response hash and generation correlation without speech in diagnostics. Preserve strict citation/time checks. A later validator fix can revalidate returned speech without another ASR call. This never automatically resumes work, releases financial holds or publishes private evidence.

Only a gateway run stopped at transcription, with acknowledged VM shutdown, a returned MAI/Azure receipt inside the run time window and no analysis receipt/version/attempt qualifies as known failed preparation. Preserve receipts/holds. A narrow internal reconciliation supports the old unknown classification. Provider timeouts and unconfirmed inference stay unknown and blocked. An explicit second preparation still consumes its finite preparation count. A proven pre-analysis rejection has not consumed the single Muse invocation; no automatic retry follows.

Use distinct image-storage mismatch errors. Test private persistence, immutability, foreign-account denial, reconciliation, explicit retry, timeout refusal and incumbent preservation. No schema, index, balance or website change is needed. Actual diagnosis, the complete comparison and managed shared publication remain open.

Full offline check passed:1325 core cases,47 auth/hook cases,148 UI/public cases, Node/Python checks and both production builds. Three hosted cases and seven Windows Python cases remain skipped. The thirteen focused preparation/transcription cases passed. This verifies failure handling and diagnostics, not the first live failure's precise cause.
