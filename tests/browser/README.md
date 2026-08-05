# Browser E2E

Production-shaped Subpolar browser coverage runs dashboard server against a
throwaway `HERMES_HOME`. Harness seeds only non-secret fixture metadata and a
local dirty Git repository. Tests never call an LLM or provider; chat gateway
coverage is intentionally outside this suite.

Run from repository root:

```bash
npm run build -w web
npm run test:e2e:browser
```

Set `HERMES_E2E_PYTHON` when Python dependencies live outside `python3`.
Playwright starts `hermes dashboard` on temporary ports, removes temporary
state on exit, and uses a second dashboard process for restart persistence.
