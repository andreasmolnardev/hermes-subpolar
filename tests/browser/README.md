# Browser E2E

Production-shaped Subpolar browser coverage starts the Bun gateway against a
throwaway SQLite data directory. Tests use only the versioned `/v1` API and do
not call an external provider.

Run from repository root:

```bash
bun run build:web
bun run test:e2e:browser
```
