# Security Policy

Hermes Subpolar is a single-process Bun web application. The security model is
based on authenticated API requests, owner-scoped SQLite records, strict input
validation, and explicit server-side tool executors.

## Reporting

Report vulnerabilities privately through [GitHub Security
Advisories](https://github.com/NousResearch/hermes-subpolar/security/advisories/new).
Do not publish credentials, private data, or an exploit in an issue.

Include:

- A concise impact and severity assessment.
- The affected endpoint, package, and commit.
- Reproduction steps and expected versus actual behavior.
- Whether the issue crosses authentication, owner isolation, provider, tool,
  filesystem, or persistence boundaries.

## Security Boundaries

- Authentication is required for setup, projects, agents, sessions, and chat.
- Session, project, and agent ownership is checked before every read or write.
- Provider API keys are accepted through authenticated setup and remain
  server-side in the private SQLite database.
- The browser cannot register executors or supply tool authorization.
- Tools are deny-by-default; descriptors, schemas, arguments, and outputs are
  validated or bounded before execution or persistence.
- Unknown providers, tools, routes, schemas, and persistence versions fail
  closed before side effects.
- The server binds to loopback by default. Public access requires TLS and
  authentication at a trusted reverse proxy.

In-process policy is not an operating-system sandbox. Deploy the single process
with the minimum filesystem and network permissions needed for its configured
data directory and native tools.

## Safe Reports

Do not include real API keys, session tokens, provider responses, or private
transcripts. Replace them with clearly marked test values. We will acknowledge
reports, reproduce them against a supported Bun deployment, and coordinate a
fix or mitigation.
