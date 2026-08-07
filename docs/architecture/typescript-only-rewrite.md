# TypeScript-Only Rewrite

The active product direction is a clean TypeScript rewrite. Existing Python
runtime code, persisted data, TUI, ACP, and cron integrations are not part of
the new runtime contract and are not compatibility targets.

The TypeScript runtime is composed from `api-gateway`, `harness`,
`chat-provider-interface`, `data-layer`, `tool-resolver`, and `tool-runtime`.
`tool-runtime` owns executable TypeScript tool handles. Its initial supported
integrations are verified argv-based shell commands, operator-configured
OpenAPI operations, and MCP tool discovery/calls through an injected
transport. Tools are deny-by-default and do not invoke a shell command string.

`api-gateway` is the uniform Bun API abstraction layer and server composition
root for health, auth, sessions, static assets, WebSocket transport, and
OpenAI-compatible chat completion endpoints.
It is configured with `SUBPOLAR_OPENAI_BASE_URL` and
`SUBPOLAR_OPENAI_API_KEY`. Unsupported provider, tool, transport, or persistence
shapes must fail before side effects rather than falling back to Python.
