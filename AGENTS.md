# Hermes Repository Rules

- Make smallest correct change. Inspect existing code before adding abstractions.
- Preserve prompt caching, message-role alternation, and stable system prompts.
- Prefer extending existing code. For new capability prefer:
  CLI/skill -> service-gated tool -> plugin/MCP -> core tool.
- Plugins must not modify core files. New third-party integrations and memory
  providers belong in standalone plugin repositories.
- Use `get_hermes_home()` for state paths and `display_hermes_home()` for
  user-facing paths. Never hardcode `~/.hermes`.
- Behavioral settings belong in `config.yaml`; `.env` is for secrets only.
- API endpoint changes require updating `openapi.json`.
- Dependency versions require upper bounds. Regenerate `uv.lock` after changes.
- Run Python tests through `scripts/run_tests.sh`, never direct `pytest`.
- Integration, I/O, config, security, and resolution changes require E2E tests
  using a temporary `HERMES_HOME`.
- Tests must verify behavior and invariants, not source text, snapshots, counts,
  or volatile catalogs.
- Skill changes must follow skill authoring standards in the skill documentation.
- Update `PATCH.md` for relevant changes. Commit all completed work; use
  `wip:` or `draft:` for untested user changes.
