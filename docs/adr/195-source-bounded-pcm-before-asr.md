# ADR195: bound decoded PCM to the source timeline

October29,2026. Status: local correction; production verification pending.

The second hosted run retained the actual ASR response. Its valid ordered segment ends at74328ms, with provider duration74330ms, against a74302ms source. Strict validation correctly rejects the26ms overrun. Do not clamp returned speech coordinates or weaken insight citation checks.

The decoder limited audio only to600seconds, even for shorter sources. Codec padding can therefore extend decoded PCM beyond the container timeline. An owned3second AAC fixture reproduces this: the old decoder produced48298 samples at16kHz instead of at most48001. Bound FFmpeg audio extraction to the actual probed source duration. The same real-media test then passes; native-caption reuse remains intact. The decoder recipe hash changes automatically with its generated source.

The owner approved two additional fresh preparation passes, four total, within the sameUSD0.50 comparison/EUR14 cap. The allowlisted policy accepts at most four and counts five indexed rows to reject overflow. Preserve all earlier receipts/financial holds and the selected result. One Muse invocation remains the maximum; proven pre-analysis failures did not invoke it. Verify the corrected Muse route and automatic existing-Assistant Save route before claiming the whole comparison works.

Full offline check passed1326 core tests,47 auth/hook tests,148 UI/public tests, Node/Python checks and both production builds. Three hosted cases and seven Windows Python cases remain skipped. The actual synthetic-media regression passed both PCM and native-caption branches after the correction. Exact CI/publication and fresh hosted acceptance remain pending.
