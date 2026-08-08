# Server Middleware Boundary

Middleware is an optional server-side extension point for request shaping and
execution instrumentation. It runs inside the Bun API process and never moves
provider credentials or tool execution into the browser.

## Rules

- Middleware receives typed provider or tool boundary values.
- Request middleware returns a complete validated replacement, not an arbitrary
  patch.
- Execution middleware may wrap an explicitly constructed provider or native
  tool executor and must preserve cancellation and deadlines.
- Middleware cannot bypass authentication, owner checks, tool policy, schema
  validation, output limits, or SQLite transaction rules.
- Unknown middleware errors fail closed for security-sensitive operations and
  are reported without credentials, prompts, arguments, or results.

## Suggested Shape

```ts
type ProviderMiddleware = (request: ProviderRequest, next: ProviderNext) =>
  Promise<ProviderResult>;

type ToolMiddleware = (call: ToolCall, next: ToolNext) => Promise<ToolResult>;
```

The exact registration surface belongs to the package that owns the boundary.
Do not add a global registry or a browser-side execution hook.

## Ordering

For a provider call, validate the authenticated request, assemble the stable
provider request, run request middleware, call the OpenAI-compatible adapter,
then normalize the result and emit the public event.

For a tool call, validate the descriptor and arguments, apply restrictive
policy, obtain approval when required, run the native executor, bound its
result, and persist the correlated call and result.

Middleware observes or wraps these steps; it does not redefine their security
order.
