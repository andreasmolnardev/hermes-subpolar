# Hermes Repository Rules

- Make smallest correct change. Inspect existing code before adding abstractions.
- Preserve prompt caching, message-role alternation, and stable system prompts.
- Prefer extending existing code. For new capability prefer:
  CLI/skill -> service-gated tool -> plugin/MCP -> core tool.
- Plugins must not modify core files. New third-party integrations and memory
  providers belong in standalone plugin repositories.
- Use `SUBPOLAR_DATA_DIR` for server state and keep provider credentials in the
  authenticated server-side setup flow.
- Behavioral settings belong in process configuration; `.env` is for local
  development values and must not contain committed secrets.
- API endpoint changes require updating `openapi.json`.
- Dependency changes require updating `bun.lock`.
- Run Bun tests through the repository scripts and use isolated temporary data
  directories for persistence and integration tests.
- Integration, I/O, config, security, and resolution changes require behavior
  tests and browser or protocol E2E coverage where applicable.
- Tests must verify behavior and invariants, not source text, snapshots, counts,
  or volatile catalogs.
- Skill changes must follow the applicable skill authoring standards.
- Update `PATCH.md` for relevant changes. Commit all completed work; use
  `wip:` or `draft:` for untested user changes.
