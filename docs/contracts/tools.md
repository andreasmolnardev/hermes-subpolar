# Tool Contract

Tools are an internal boundary, not a public Wave 0 `/v1` resource. The
current HTTP and WebSocket chat handlers start every turn with an empty tool
policy list. Clients cannot register, select, or execute a tool through the
public chat request.

## Resolver Boundary

An internal tool definition contains:

```ts
  name: string;
  description: string;
  inputSchema: boolean | Record<string, unknown>;
  source: string;
  capabilities?: string[] | Record<string, unknown>;
  executable:
    | { handle: { execute: (...args: unknown[]) => unknown } }
    | { reference: string };
  policy?: "allow" | "ask" | "auto" | "deny";
  disabled?: boolean;
  enabled?: boolean;
};
```

Resolution and execution are separate. The resolver validates and sanitizes
JSON Schemas, rejects name collisions, clones inputs, produces deterministic
name order, and applies restrictive policy precedence. It never executes a
tool. `deny` removes a tool; `ask`, `allow`, and `auto` are execution policies
for an explicitly enabled descriptor.

## Execution Decisions

- A tool is deny-by-default unless an internal caller supplies a valid
  descriptor and execution policy.
- Executables are branded handles or opaque references, not shell command
  strings.
- Tool arguments are validated before execution and tool output is bounded
  before it returns to the harness or provider.
- Approval, cancellation, timeout, concurrency, and output limits belong to
  the harness/tool runtime boundary, not to browser JavaScript.
- Tool calls and results retain stable IDs and are correlated in persistence.

The public protocol reserves `approval.request`, `tool.start`,
`tool.generating`, and `tool.complete` events, but the current public server
cannot produce them from client input because no public tool set is enabled.
Their presence in the event union is a forward-compatible envelope decision,
not a claim that tools are currently available.

## Security Boundary

Tool capability metadata describes what an executor may do; it is not an
authorization grant. An embedding must construct the executor explicitly and
must not treat a provider-generated tool name or argument as trusted policy.
Unknown descriptors, invalid schemas, policy conflicts, and missing executors
fail closed before a tool side effect.
