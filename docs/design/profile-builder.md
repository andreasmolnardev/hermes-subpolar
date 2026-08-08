# Agent Builder

Status: design proposal.

The browser should create an owner-scoped agent in one reviewable flow. An
agent has a name, description, instructions, tool policy, and model selection.
The builder must use the existing authenticated API and must not write files or
accept provider credentials in browser storage.

## Flow

```text
Identity -> Instructions -> Model -> Tools -> Review -> Create
```

The review step shows the complete request before submission. Creation is one
authenticated API operation. The server validates ownership, model selection,
tool descriptors, and policy before committing the agent to SQLite.

## Provider

The model step selects the one configured OpenAI-compatible connection and a
model from its server-side catalog. API keys and base URLs never return to the
browser after setup.

## Tools

The tool step may select only server-advertised native descriptors. Selection
does not grant execution: the server resolves each descriptor, applies
deny-by-default policy, validates its schema, and constructs the executor. An
unknown or conflicting descriptor rejects the request before the agent exists.

## Verification

- Submit a complete builder request as an authenticated owner.
- Verify the agent, policy, and instructions survive restart in SQLite.
- Verify another owner cannot read or modify the agent.
- Verify invalid tools and model values have no partial database effect.
- Run `bun run --filter web-ui build` and the relevant Bun package tests.
