# Tool Contract And Policy

Tools are explicit operator-configured capabilities. The resolver exposes only
validated typed handles; a model cannot create a handle, choose a server URL,
load code, or bypass policy. Unknown tool definitions fail closed before
execution.

## Common Definition

```text
ToolDefinition = {
  name: string,
  description: string,
  inputSchema: JsonSchema,
  source: shell | openapi | mcp,
  policy: deny | ask | allow | auto
}
```

`JsonSchema` is a validated JSON Schema object or boolean with JSON-valued
keywords. Tool input is a closed JSON object validated against that schema.
Executable handles are native TypeScript functions with a typed input and a
typed result; no executable boundary accepts an unvalidated open-ended value.

## Effective Policy

The policy precedence is `deny` before `ask`, `allow`, and `auto`. A deny at
any scope wins. Defaults are deny for unconfigured tools and ask for an
explicitly configured executable tool.

- `deny`: reject without side effect.
- `ask`: create one approval request bound to principal, session, tool name, and argument digest; execute only after approval.
- `allow`: execute without a per-call prompt within the configured bounds.
- `auto`: execute without a prompt only when the operator explicitly enabled that tool and its capability class.

Prompt text cannot change policy. Approval decisions expire with the request,
are not reusable for another argument digest, and are recorded without raw
secrets.

## Shell

Shell execution is an argv-only boundary:

```text
ShellInput = {
  argv: non-empty string[],
  cwd?: absolute string,
  timeoutMs?: positive integer
}
```

The runtime MUST NOT invoke a shell, parse a command string, interpolate
environment syntax, or execute Python. The executable must be absolute,
canonicalized inside configured executable roots, executable on disk, and
matched by an exact operator allowlist with optional argument prefix. The
working directory must be canonicalized inside configured cwd roots.

Environment inheritance is disabled; only an explicit bounded environment map
may be supplied by the operator. Timeout, stdout, and stderr have hard byte
and time limits. Cancellation kills the process and produces `tool_failed` or
`turn_cancelled`. `shell.exec` defaults to `ask`.

## Fixed-Origin OpenAPI

An OpenAPI tool is created only from an operator-preloaded OpenAPI 3.1
document, an HTTPS fixed base origin, and a non-empty unique operation ID
allowlist.

- External references, server overrides, credential headers (`Authorization`, `Cookie`, `Set-Cookie`, proxy credentials, and API-key headers), redirects, and model-supplied origins are rejected.
- Only declared path, query, header, and JSON body fields are accepted; undocumented fields fail before network I/O.
- Header names and values reject CR/LF. Response bytes are bounded and the result records status, success, body text, and truncation only.
- Fixed credentials, if required, are injected by the operator configuration and never appear in a tool schema or model argument.
- SSRF protection is the fixed origin plus HTTPS requirement; an OpenAPI path cannot escape it.

## MCP

MCP servers are operator-configured integrations. The model may select a
discovered tool but cannot supply a server, transport, command, URL, or
credential. Discovery is limited to a validated `tools/list` response;
execution is limited to `tools/call` for the discovered name and validated
object arguments.

MCP transport implementations must be native, explicitly configured, bounded,
and approved separately. No implicit stdio command, arbitrary remote URL,
dynamic package loading, or Python MCP bridge is part of this contract. An MCP
server with invalid metadata, a schema outside the JSON Schema contract, a
name collision, or an unapproved transport is disabled.

MCP failures are redacted to `tool_failed`; raw JSON-RPC responses and server
diagnostics do not cross the public error boundary.

## Output And Persistence

Tool output is bounded before it enters a transcript or event. Binary output is
not serialized as an unbounded string; a typed truncation marker and byte count
are used. Tool results are associated with the call ID and session owner.
Non-idempotent calls require a checkpoint before dispatch, as defined by
[persistence](persistence.md), and are never replayed blindly after a crash.
