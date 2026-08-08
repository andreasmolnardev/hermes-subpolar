# Python To Bun Migration

## Scope

Python is legacy implementation and must not remain part of this codebase. Bun and
TypeScript are canonical runtime for Subpolar. Existing Python data, plugins,
CLI transports, and provider behavior are not compatibility contracts unless
listed below as an explicit migration requirement.

This inventory covers capabilities still advertised by Python source, Python
documentation, or the root product README. It compares them with current Bun
ownership. `Implemented` means Bun has an active implementation for that
surface. `Partial` means Bun has a package or primitive, but not the complete
user-facing behavior. `Not implemented` means no Bun owner exists.

## Feature Inventory

| Python advertisement | Python source or documentation | Bun implementation | Status | Deprecation and removal action |
| --- | --- | --- | --- | --- |
| Standalone agent with automatic tool loop, history, recovery, configurable parameters, and multiple providers | `run_agent.py:3-21`, `agent/conversation_loop.py`, `agent/tool_executor.py` | `packages/harness/src/index.ts:224-273,1648`; `packages/api-gateway/src/index.ts:255-256` | Partial | Keep harness as owner. Remove `run_agent.py` runtime entry after chat, tool, cancellation, and recovery E2E pass. |
| Python `hermes` CLI with `gateway`, `cron`, and `doctor` subcommands | `hermes:3-7` and historical `hermes_cli/` surface | `packages/api-gateway/src/server.ts:157-430` | Partial | Advertise only `bun run serve`. Delete Python launcher, command registry, installer, update, and doctor paths. |
| Workspace-first product with files, Git repositories, terminals, browser sessions, tools, configuration, conversations, and scheduled tasks | `README.md:104-238`, `README.md:270-293` | Active browser entry is `packages/web-ui/src/main.tsx:4-9`; authenticated projects, agents, sessions, and chat are in `packages/web-ui/src/SubpolarApp.tsx:47-249` and `packages/api-gateway/src/server.ts:228-369` | Partial | Keep claims limited to implemented authenticated projects, agents, conversations, and chat. Do not advertise files, Git, terminals, browser sessions, or schedules until Bun owners ship them. |
| Reusable agents with skills, tool permissions, models, system prompts, and behavior | `run_agent.py:137-174`, `agent/system_prompt.py`, `toolsets.py:193-240` | `packages/data-layer/src/auth.ts:255-341`; `packages/web-ui/src/SubpolarApp.tsx:85-106,146-148,231-248` | Partial | Keep basic owner-scoped agents and instructions. Migrate skills, model defaults, tool permissions, and prompt composition before removing Python agent configuration. |
| Multiple native and compatible model providers | `providers/README.md:3-8`, `plugins/model-providers/README.md:1-70`, `agent/*_adapter.py`, `plugins/model-providers/*` | Provider-neutral contracts in `packages/chat-provider-interface/src/index.ts:68-205`; one adapter in `packages/chat-provider-interface/src/openai-compatible.ts:30-47`; setup stores one OpenAI-compatible connection in `packages/data-layer/src/auth.ts:311-324` | Partial | OpenAI-compatible is only supported provider. Remove provider catalog and Python adapters; add each Bun adapter with recorded request, error, usage, credential, streaming, and multimodal tests before advertising it. |
| Streaming, reasoning, usage, cache hints, multimodal input, and tool-call continuation | `agent/transports/`, `agent/message_content.py`, `agent/prompt_caching.py`, `agent/stream_single_writer.py` | Provider content and stream contracts in `packages/chat-provider-interface/src/index.ts:72-260`; serialization in `packages/chat-provider-interface/src/openai-compatible.ts:85-213`; gateway projection in `packages/api-gateway/src/client.ts:120-235`; SSE/WebSocket transport in `packages/api-gateway/src/server.ts:336-405` | Partial | Keep typed Bun contracts and authenticated streaming. Remove Python reconciliation and provider transport code after differential stream tests cover reasoning, tools, usage, cache metadata, cancellation, and finish reasons. |
| Prompt assembly, context references, token estimation, compression, and persistent memory | `agent/system_prompt.py`, `agent/prompt_builder.py`, `agent/context_references.py`, `agent/context_compressor.py`, `agent/memory_manager.py`, `agent/memory_provider.py` | Prompt/context ports and token helpers in `packages/harness/src/index.ts:95-134,210-235`; provider-facing content in `packages/chat-provider-interface/src/index.ts:128-148` | Partial | Treat unsupported context as an explicit unsupported route. Migrate only through Bun-owned ports with prompt-byte, cache-boundary, compression, restart, and memory-injection fixtures. Remove Python context and memory modules when those gates pass. |
| Dynamic Python tool registry and composable toolsets | `model_tools.py:3-20,199-232`, `tools/registry.py`, `toolsets.py:5-24,31-86` | Deterministic descriptors, schema validation, collision checks, and policy precedence in `packages/tool-resolver/src/index.ts:20-56`; gateway accepts resolved tools in `packages/api-gateway/src/index.ts:114-162` | Partial | Use `tool-resolver` as sole discovery contract. Remove Python registry, toolset aliases, and module-import discovery after black-box schema, policy, disabled-tool, collision, and stable-order tests pass. |
| Terminal, process, local execution, Docker, Modal, SSH, Daytona, and other environments | `toolsets.py:42-44`, `tools/terminal_tool.py`, `tools/environments/*`, `mini_swe_runner.py:3-27,117-150` | Verified argv-only shell handle in `packages/tool-runtime/src/shell.ts:5-18,126-180`; exported by `packages/tool-runtime/src/index.ts:1-6` | Partial | Bun shell is not a Python environment replacement and is not wired into HTTP chat yet. Remove Python environment backends and SWE claims unless Bun adds an explicitly managed backend with isolation, cancellation, cleanup, and E2E evidence. |
| MCP server discovery and execution | `tools/mcp_tool.py`, `tools/mcp_schema_cache.py`, `mcp_serve.py:3-26` | Operator-supplied MCP transport and sanitized tool definitions in `packages/tool-runtime/src/mcp.ts:3-59` | Partial | Keep MCP as a Bun runtime primitive only. Remove Python MCP discovery, OAuth, channel bridge, and `hermes mcp serve` claims until Bun owns configuration, transport lifecycle, approval, and persistence. |
| OpenAPI and native/plugin integrations | `README.md:227-238`, `tools/*`, `plugins/*`, `openapi.json` | Fixed-origin, allowlisted OpenAPI tool definitions in `packages/tool-runtime/src/openapi.ts:3-12,26-89,128-160`; plugin/integration domain types in `packages/shared/src/subpolar-domain.ts:24-38` | Partial | Keep only trusted operator-configured OpenAPI operations. Remove Python plugin loading and model-controlled integration configuration; migrate each retained integration as a standalone Bun package or delete it. |
| Browser automation, computer use, image/video generation, audio, transcription, and text-to-speech | `toolsets.py:42-58,84-85`, `tools/browser_*`, `tools/computer_use/*`, `agent/*_provider.py`, `plugins/video_gen/*` | Provider contracts carry image, audio, and file parts in `packages/chat-provider-interface/src/index.ts:82-106`; no Bun browser, computer-use, media, or voice runtime exists | Not implemented | Remove these from Subpolar product claims. Reintroduce only behind explicit Bun integrations with security, credential, cancellation, and output-limit tests. |
| Skills and user/project plugins | `toolsets.py:49-51`, `skills/`, `optional-skills/`, `hermes_cli/plugins`, `plugins/*` | UI has legacy source pages, but active entry is `SubpolarApp`; no Bun skill/plugin loader is in the active runtime. `packages/shared/src/subpolar-domain.ts:24-38` only defines integration data | Not implemented | Mark Python skills and plugins unsupported for Subpolar. Delete Python discovery and compatibility paths; migrate selected skills to Bun-owned packages or static documentation only. |
| Sessions, transcript history, search, resume, checkpoints, recovery, and usage | `hermes_state.py`, `hermes_state_search.py`, `tools/checkpoint_manager.py`, `mcp_serve.py:72-177` | New SQLite schema and repositories in `packages/data-layer/src/sqlite.ts:236-355`; message/checkpoint/recovery contracts in `packages/data-layer/src/contracts.ts:146-290`; session API in `packages/api-gateway/src/server.ts:316-334` | Partial | Bun data is new and owner-scoped. Do not promise Python database resume or search. Remove legacy schema readers and migration metadata after fresh-database restart/recovery/retention tests pass. |
| Authentication, pairing, dashboard access, and secret handling | Python dashboard/auth plugins, `hermes_cli/`, `gateway/`, `agent/secret_scope.py` | Password bootstrap/login/logout, CSRF, same-origin checks, and owner scoping in `packages/api-gateway/src/server.ts:57-135,228-294`; SQLite identity repository in `packages/data-layer/src/auth.ts:148-341` | Implemented for current local web scope | Keep Bun cookie authentication as authority. Remove Python pairing, dashboard auth, secret stores, and process-global credential paths from Subpolar. |
| Scheduled tasks, reminders, isolated cron sessions, and gateway service installation | `cron/__init__.py:1-42`, `cron/jobs.py`, `cron/scheduler.py`, `toolsets.py:211-215`, `README.md:189-209` | `packages/shared/src/subpolar-domain.ts:40-56` defines a domain shape only; no Bun scheduler or executor exists | Not implemented | Remove cron from active Subpolar navigation, docs, and runtime claims. Migrate only with a Bun scheduler, durable ownership/policy checks, run-now behavior, shutdown, delivery, and restart tests. |
| Messaging platforms and outbound delivery | `gateway/platforms/*`, `tools/send_message_tool.py`, `tools/discord_tool.py`, `plugins/platforms/*` | No Bun platform adapter or delivery runtime | Not implemented | Remove Telegram, Discord, Slack, WhatsApp, Matrix, Teams, and related Python gateway claims. Re-add each platform only as an independent Bun adapter with protocol and platform E2E coverage. |
| TUI, ACP, desktop, and JSON-RPC editor workflows | `tui_gateway/`, `acp_adapter/`, desktop/Tauri paths, `requirements.md:34-43` | Browser WebSocket transport in `packages/api-gateway/src/server.ts:374-405`; no TUI or ACP adapter | Not implemented | Explicitly out of scope. Delete Python TUI/ACP/desktop launchers and documentation; do not preserve their protocols as compatibility targets. |
| Activity panel, tool timeline, approvals, cancellation, and transparent events | `agent/session_activity.py`, gateway event emitters, `tools/approval.py` | Typed harness lifecycle in `packages/harness/src/index.ts:246-299`; gateway event projection in `packages/api-gateway/src/client.ts:26-44,120-235`; WebSocket cancellation in `packages/api-gateway/src/server.ts:384-405` | Partial | Keep event projection and approval ports. Complete browser rendering, reconnect/heartbeat, durable approvals, and cross-session isolation before deleting Python event adapters. |
| Logging, health, monitoring, OTLP, redaction, and process supervision | `hermes_logging.py`, `agent/monitoring/*`, `gateway/*`, `agent/redact.py` | Liveness/readiness and bounded HTTP/static serving in `packages/api-gateway/src/server.ts:156-217`; no equivalent exporter or full supervisor | Partial | Keep health and Bun-side redaction. Remove Python exporters, watchdogs, signal paths, and log routing after Bun shutdown, observability, and redaction gates pass. |
| Batch runs, Mini-SWE trajectories, compression, and evaluation tooling | `batch_runner.py`, `mini_swe_runner.py:3-27`, `trajectory_compressor.py` | No Bun batch runner or trajectory format implementation | Not implemented | Remove from Subpolar product advertising. Keep in a separately named Python research repository only if still needed. |

## Immediate Stale Advertisers

These files still make Python behavior look like supported Subpolar runtime:

- `README.md:270-293` says Hermes continues to provide the execution engine. The
  active engine is Bun; rewrite this section around `api-gateway` and `harness`.
- `README.md:104-238,242-256` lists scheduled tasks, apps, broad tools, and
  providers beyond current Bun behavior. Replace with implemented Bun scope.
- `run_agent.py`, `model_tools.py`, `toolsets.py`, and
  `plugins/model-providers/README.md` describe Python APIs and catalogs. Add a
  deprecated header immediately, then delete them with their owners.
- `cron/__init__.py`, `mcp_serve.py`, and `mini_swe_runner.py` advertise Python
  commands with no Bun replacement. Mark unsupported or move out of this repo.
- `packages/api-gateway/src/python-bridge.ts` and
  `packages/api-gateway/src/python-runtime-bridge.ts` are migration debt, not
  product features. They must not be reachable from the default server path.
- `packages/data-layer/src/sqlite.ts:424-455` still recognizes Python-shaped
  sessions as read-only compatibility input. Remove this branch when the
  retention and fresh-database gates below pass.

`PATCH.md` may retain historical notes, but must not be treated as current
feature documentation.

## Removal Order

1. Update README, package descriptions, command help, provider docs, and skill
   catalogs to describe only active Bun behavior.
2. Keep `bun run serve`, authenticated web chat, projects, agents, sessions,
   OpenAI-compatible provider, harness lifecycle, and Bun tool primitives as
   supported scope.
3. Finish Bun replacements for any capability intentionally retained. Each
   replacement needs behavior tests, security tests, cancellation tests, and
   browser or protocol E2E coverage where applicable.
4. Remove Python runtime bridges, Python runtime selection, Python tool
   discovery, legacy SQLite readers, and Python dependencies from the Bun path.
5. Delete Python CLI, gateway, cron, TUI, ACP, provider, plugin, media, and
   research entry points that remain in this repository.
6. Run `bun run check:monorepo`, `bun run typecheck:runtime`, `bun run test`,
   browser E2E, clean-install build, and Docker health checks. Run Python tests
   only while deletion work still touches retained historical files.

## Deletion Gates

Python code may be deleted only when its Bun owner has:

- Black-box behavior coverage for supported inputs and failure paths.
- Security and ownership isolation coverage.
- Cancellation, timeout, shutdown, and no-duplicate-side-effect coverage.
- Restart, persistence, and retention coverage when state is involved.
- Protocol or browser E2E coverage for public transports.
- No active imports, subprocess calls, documentation claims, or package
  scripts requiring Python.

The target state is Bun and TypeScript only. Unsupported Python inputs fail
closed before provider, tool, filesystem, or network side effects.
