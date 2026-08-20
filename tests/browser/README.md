# Browser E2E

Browser coverage runs the Bun server against temporary application data. The
tests exercise first-run authentication, provider/setup state, sessions, and
the web UI without calling a real model provider.

Run from the repository root:

```sh
bun install --frozen-lockfile
bun run build:web
bun run test:e2e:browser
```

The Playwright harness starts the server on a temporary local port and removes
its temporary data when the run exits. Keep provider credentials unset for
browser tests; they are not required for UI and auth coverage.
