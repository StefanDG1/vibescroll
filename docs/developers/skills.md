A tool is a function the model can call. A skill is a workflow the host can load to guide when and how to use tools. A saved native monitor is a configured background task with its own trigger and instructions. These are separate parts of the integration.

## Nine packaged skills

The source plugin in `plugins/vibescroll` contains these skills:

| Skill                       | Workflow                                            |
| --------------------------- | --------------------------------------------------- |
| `vibescroll-setup`          | Connect and verify the current workspace/grant      |
| `vibescroll-save`           | Save a supported source and follow its actual state |
| `vibescroll-find`           | Search authorized saved ideas and respect coverage  |
| `vibescroll-library`        | Browse saved knowledge                              |
| `vibescroll-compare`        | Compare supported saved context/results             |
| `vibescroll-status`         | Read bounded task status                            |
| `vibescroll-project-review` | Discuss and save a project proposal in chat         |
| `vibescroll-work-review`    | Review supported work before a handoff              |
| `vibescroll-feedback`       | Record an explicit judgment or outcome              |

The plugin manifest identifies the setup skill for onboarding and the MCP endpoint. A manually added custom MCP connection can expose tools without installing those packaged skills. The source package is not proof that a particular ChatGPT account loaded them. The twelve repository coding skills under `.agents/skills` guide developers working on VibeScroll; they are not these end-user workflows.

OpenAI's [plugin packaging guide](https://developers.openai.com/plugins/build/plugins) documents how skills and MCP dependencies belong to an installed plugin. Tool descriptions still guide a host that only has the MCP connection.

## Events and automatic analysis

[MCP Events](https://developers.openai.com/plugins/build/mcp-events) lets ChatGPT subscribe to server updates. A user chooses the monitor and what the configured task does when an event arrives. VibeScroll's saved-link route uses an exact saved analysis intent and current authority before it starts work.

The existing prepared route performs downloading/transcription/frame extraction on the service. A native task reads the retained evidence, inspects JPEGs and completes its exact leased analysis. It does not need a new downloader or transcription runtime for that prepared branch.

The native monitor prompt is not automatically installed into every chat. An event does not grant access by itself and is not a guarantee that a dormant unrelated conversation will reply. Refreshing tool metadata and renewing OAuth are also different actions from creating or changing a monitor.
