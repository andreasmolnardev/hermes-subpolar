# Subpolar Security Policy

Subpolar is a self-hosted Bun server. The server owns authentication, session
state, provider credentials, and native tool execution. Treat every network
caller, model response, MCP result, OpenAPI response, and browser input as
untrusted until the relevant boundary authorizes it.

## Reporting

Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/andreasmolnardev/hermes-subpolar/security/advisories/new).
Do not open a public issue for a suspected vulnerability.

Include:

- A concise description and severity assessment.
- The affected endpoint, package, or file and the relevant version or commit.
- Reproduction steps that do not disclose live credentials or private data.
- The expected security invariant and the observed result.
- Deployment details, including whether a reverse proxy or container was used.

## Trust Boundaries

### Authentication and Sessions

`/v1/auth/*` creates and revokes authenticated sessions. The server stores the
session token in an HttpOnly cookie and exposes a separate CSRF cookie for the
browser. State-changing requests require same-origin validation and a matching
`X-CSRF-Token`. Session IDs are routing identifiers, not authorization; every
session, project, and agent lookup must be checked against the authenticated
owner.

### Provider Credentials

The configured OpenAI-compatible provider is called by the server. Provider
base URLs, models, and API keys must not be returned to browser clients or
written to logs. Do not put provider secrets in source control, browser storage,
chat messages, tool arguments, or issue reports.

### Native Tools

Native tools are capability boundaries, not a general-purpose permission bypass:

- Shell tools use absolute executable and working-directory roots, an argument
  allowlist, bounded time, bounded output, and no shell interpolation.
- MCP tools validate JSON-RPC responses, names, schemas, message sizes,
  arguments, results, policy, timeout, and cancellation.
- OpenAPI tools expose only explicitly allowed operation IDs, use HTTPS, reject
  private or rebinding origins by default, reject credential headers, and bound
  requests, responses, and timeouts.

Tool policy defaults to `ask`. Operators must still limit the container's
filesystem, process, and network access because a permitted tool executes with
the capabilities granted by its deployment.

### Browser and Network Exposure

The default bind is loopback. If the server is exposed through a reverse proxy:

- Terminate TLS before forwarding requests.
- Forward WebSocket upgrades for `/v1/ws`.
- Keep the container port private to the proxy.
- Add network authentication, rate limiting, and an allowlist appropriate for
  the deployment.
- Do not trust arbitrary forwarded headers from an untrusted network.

## Out of Scope

The following are expected limitations rather than vulnerabilities unless they
cross one of the boundaries above:

- A model producing unsafe text without an unauthorized side effect.
- A tool doing what its explicit operator policy permits.
- Public exposure caused solely by an operator disabling the reverse proxy or
  binding the service to an untrusted interface.
- A third-party provider, MCP server, or OpenAPI service behaving maliciously
  outside the controls Subpolar documents and enforces.

## Disclosure

We will acknowledge receipt, investigate privately, and coordinate a fix or
mitigation before public disclosure where practical. Reporters receive credit
unless they request anonymity.
