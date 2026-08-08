## What does this PR do?

<!-- Describe the behavior change and the owning Bun package boundary. -->

## Related Issue

Fixes #

## Type of Change

- [ ] Bug fix
- [ ] New web/API feature
- [ ] Security fix
- [ ] Documentation
- [ ] Tests
- [ ] Refactor

## How to Test

```bash
bun run check:monorepo
bun run typecheck:runtime
bun test
```

<!-- Add focused API, browser, or persistence commands when relevant. -->

## Checklist

- [ ] The change stays within the owning package boundary.
- [ ] API, authentication, persistence, and tool behavior have tests where relevant.
- [ ] SQLite tests use an isolated temporary data directory where relevant.
- [ ] Provider credentials, prompts, tool arguments, and results are not logged.
- [ ] No second runtime or process was introduced.
- [ ] Documentation was updated or is not needed.
