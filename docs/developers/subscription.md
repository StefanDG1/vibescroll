Yes, you can use the model allowance of your signed-in ChatGPT or Codex host for work performed inside that chat. The MCP connection supplies data and saves the answer. It does not transfer that subscription to VibeScroll's servers.

## Which route pays for which work

| Action                                                            | Where the AI work happens                                    | Usage or cost                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Find or explain saved insights                                    | The active ChatGPT/Codex conversation                        | Host allowance; ordinary VibeScroll data access still applies                               |
| Write or revise a plan in chat, then call `save_project_proposal` | The active conversation; VibeScroll stores the supplied plan | Host allowance; saving starts no paid model generation                                      |
| Store a discussion message or completion report                   | VibeScroll validates and stores the supplied text            | No model generation from the persistence tool                                               |
| `start_project_plan` or a generating `reply_to_project_plan`      | VibeScroll's hosted API service                              | Quoted VibeScroll credits and provider funding                                              |
| `start_video_analysis` with `executor=gateway`                    | Server preparation, then an API model                        | Quoted preparation/analysis credits and provider funding                                    |
| Prepared video with `executor=work_cloud`                         | Server preparation, then the configured native host task     | Preparation may use VibeScroll credits; host analysis uses that user's plan and task limits |

Calling an API-start tool from a subscribed chat does not change its funding route. Conversely, saving a plan written by the chat does not require another API model to rewrite it. Source retrieval, transcription, storage and database delivery can still have infrastructure cost even when reasoning uses the host's allowance.

## Two authentications, with different purposes

You sign in to ChatGPT/Codex to use its model and product features. That session remains with OpenAI. Codex's supported ChatGPT sign-in provides subscription access; API-key sign-in uses API billing instead. See [OpenAI authentication](https://learn.chatgpt.com/docs/auth).

You separately connect VibeScroll through OAuth so the host can access your VibeScroll library and permitted project actions. Your existing VibeScroll connection is reused across supported calls. VibeScroll validates the resulting bearer token and its current grant; it does not use that token to invoke an OpenAI model.

VibeScroll does not need your ChatGPT password, subscription token or API key for ordinary in-chat reasoning. No additional “Sign in with ChatGPT inside VibeScroll” is needed for that workflow. The [MCP OAuth specification and OpenAI guide](https://developers.openai.com/plugins/build/auth) describe the connection boundary.

## Renewal and usage limits

OAuth access tokens can expire while refresh tokens let the host renew access without another interactive sign-in. Revocation, expired refresh credentials, changed scopes or provider/client configuration can still require reconnection. Neither MCP nor the current code establishes authentication forever.

The host counts its own model messages, context, reasoning and supported task usage under its plan and limits. A multi-step tool workflow can need multiple model turns. VibeScroll cannot report an exact percentage of your ChatGPT allowance consumed by a call or guarantee a particular host model/effort from a model's self-report.

## Current supported direction

Use MCP reads and chat-authored proposals when you are already working in ChatGPT/Codex. Use the explicit credit route for work you want VibeScroll's website to execute independently. Native subscription-funded video analysis still uses the configured host task; general commercial subscription inference directly on VibeScroll's servers remains gated and is not enabled by this OAuth connection.

For a prepared transcript and screenshots, an appropriately equipped active host could reason over that evidence without downloading or transcribing the video again. The existing production completion/lease route is bound to the native task. A generic “complete prepared analysis from any ordinary chat” contract remains a possible future simplification, not a claim about every current host.
