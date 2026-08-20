# Contributing to Subpolar

Subpolar is a Bun and TypeScript web application. Contributions should preserve
the single-server product boundary, authenticated `/v1` API, OpenAI-compatible
provider contract, and explicit native tool boundaries.

Contributions should target the supported browser server and its Bun runtime,
not compatibility layers or product launchers for other environments.

## Development Setup

Requirements:

- Git.
- Bun 1.3.14 or a compatible Bun 1.x release.
- Docker, when changing the container or Compose deployment.

```sh
git clone https://github.com/andreasmolnardev/hermes-subpolar.git
cd hermes-subpolar
bun install --frozen-lockfile
```

Behavioral settings belong in application configuration. Provider keys and other
secrets belong in local environment injection, never in committed files.

## Checks

Run the checks relevant to the change:

```sh
bun run check:monorepo
bun run typecheck:runtime
bun run test
bun run build:web
```

For browser or deployment changes, also run:

```sh
bun run test:e2e:browser
docker compose config --quiet
docker compose up -d --build
curl -fsS http://127.0.0.1:8080/api/health
docker compose down --volumes
```

Use Bun exclusively for repository validation. The workflow contract is
`bun install --frozen-lockfile` followed by Bun scripts, Bun tests, and the Bun
web build.

## Architecture Boundaries

- Keep the server in one Bun process. Do not add a second runtime or a product
  launcher for another environment.
- Preserve session ownership and CSRF checks on all state-changing `/v1`
  requests.
- Keep provider credentials server-side. The browser receives identity and
  session data, never provider secrets.
- Add tools through typed native definitions. Every tool must declare its source,
  capabilities, input schema, policy, limits, and cancellation behavior.
- Keep shell execution argument-based and allowlisted. Never turn user input
  into a shell command string.
- Keep MCP JSON-RPC bounded and OpenAPI operations explicitly allowlisted.
- Keep OpenAPI origins HTTPS-only and reject private addresses unless an
  operator explicitly selects the private-address policy.

## Adding Features

Start with a focused issue for changes that affect the API, authentication,
provider behavior, persistence schema, tool policy, or deployment contract.
Changes to an API endpoint require matching updates to the checked-in API
contract and tests. Do not modify generated or planning artifacts as a shortcut.

Tests should assert behavior and security invariants, including unauthorized
access, ownership checks, CSRF failures, bounds, cancellation, and failure
handling. Avoid tests that only count files, match source text, or depend on a
volatile provider catalog.

## Pull Requests

Use a focused branch and a Conventional Commit message:

```text
<type>(<scope>): <description>
```

Useful types include `fix`, `feat`, `docs`, `test`, `refactor`, and `chore`.
Include what changed, why it changed, and the exact Bun checks you ran. Note any
security or deployment impact explicitly.

## Reporting Problems

Use GitHub Issues for ordinary bugs and design discussion. Report security
issues privately according to [`SECURITY.md`](SECURITY.md).

## License

By contributing, you agree that your contribution is licensed under the
license in [`LICENSE`](LICENSE).
