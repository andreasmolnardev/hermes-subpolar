# Vendored Pi packages

Hermes Subpolar vendors the runtime source closure from
[`earendil-works/pi`](https://github.com/earendil-works/pi). The imported
packages and upstream revision are recorded in `PINNED_COMMIT`.

This directory is the maintenance record for the vendor. Keep the upstream
checkout separate from this repository, and never use a moving branch as the
revision being imported.

## Imported closure

The runtime closure intentionally contains these seven packages:

| Upstream package | Vendored package | Manifest name |
| --- | --- | --- |
| `agent` | `packages/pi-agent` | `@earendil-works/pi-agent-core` |
| `ai` | `packages/pi-ai` | `@earendil-works/pi-ai` |
| `client` | `packages/pi-client` | `@earendil-works/pi-client` |
| `coding-agent` | `packages/pi-coding-agent` | `@earendil-works/pi-coding-agent` |
| `protocol` | `packages/pi-protocol` | `@earendil-works/pi-protocol` |
| `telemetry` | `packages/pi-telemetry` | `@earendil-works/pi-telemetry` |
| `tui` | `packages/pi-tui` | `@earendil-works/pi-tui` |

`pi-evals`, `pi-server`, and `pi-session-backends` are deliberately outside
the initial embedded runtime closure. Do not add them during a routine source
refresh without first documenting and reviewing the architecture change.

The checker also treats this compact mapping as the machine-readable closure
record; keep each mapping on one line when changing the closure:

```text
agent        → packages/pi-agent
ai           → packages/pi-ai
client       → packages/pi-client
coding-agent → packages/pi-coding-agent
protocol     → packages/pi-protocol
telemetry    → packages/pi-telemetry
tui          → packages/pi-tui
```

## Exact update procedure

1. **Pin the upstream revision.** Fetch the Pi repository, check out the
   intended immutable commit, and verify the checkout before changing this
   repository:

   ```sh
   git -C /path/to/pi-checkout fetch --tags origin
   git -C /path/to/pi-checkout checkout --detach <40-character-commit-sha>
   git -C /path/to/pi-checkout rev-parse HEAD
   printf '%s\n' <40-character-commit-sha> > scripts/pi/PINNED_COMMIT
   ```

   The SHA in `PINNED_COMMIT` must equal the checkout's `HEAD` exactly.

2. **Import only the documented closure.** From the Hermes repository root,
   run the sync script with that checked-out repository:

   ```sh
   bash scripts/pi/sync-pi.sh /path/to/pi-checkout
   ```

   It verifies the pin and replaces only `src` under the seven `packages/pi-*`
   directories. It must not replace Subpolar adapters, manifests, lockfiles,
   permissions, or other application code.

3. **Run Pi's package checks and the vendor integrity checks.** This catches
   upstream type/test failures as well as closure drift:

   ```sh
   bun run --filter './packages/pi-*' check
   bun run check:pi
   bun run test:pi
   ```

4. **Run Subpolar and security checks.** At minimum, run the package checks
   affected by the runtime and its authorization boundary, plus the monorepo
   boundary checks:

   ```sh
   bun run check:boundaries
   bun run test:boundaries
   bun run --filter harness check
   bun run --filter tool-runtime check
   bun run --filter api-gateway check
   bun run check:monorepo
   ```

   Run the applicable browser/protocol E2E and filesystem, shell, permission,
   approval, and workspace-confinement security suites as well. A vendor
   refresh is not ready to commit if an authorization or confinement test is
   skipped because the changed Pi package appears unrelated.

5. **Review local patches before staging.** Inspect the complete source diff
   and confirm that every changed line is either an upstream import or an
   explicitly reviewed local patch:

   ```sh
   git diff --check
   git diff -- packages/pi-agent packages/pi-ai packages/pi-client \
     packages/pi-coding-agent packages/pi-protocol packages/pi-telemetry packages/pi-tui
   git status --short
   ```

   Keep Subpolar policy, credentials, tools, and event projection outside the
   vendored packages whenever possible. If a local patch is necessary, record
   why it cannot live in the harness adapter and make it easy to reapply during
   the next upstream review.

6. **Use one package-batched commit.** Stage the changed Pi package sources,
   the pin, and the maintenance record together. Review the staged diff, then
   create one commit for the complete update batch:

   ```sh
   git add packages/pi-agent packages/pi-ai packages/pi-client \
     packages/pi-coding-agent packages/pi-protocol packages/pi-telemetry packages/pi-tui \
     scripts/pi/PINNED_COMMIT scripts/pi/README.md scripts/pi/sync-pi.sh
   git diff --cached --check
   git commit -m "chore(pi): update vendored runtime to <sha>"
   git push
   ```

   Do not split one upstream revision across per-file or per-package commits;
   the pin, closure, tests, and source must move together. If the checks are
   not green, leave the work uncommitted and report the failing gate.

## Sync script contract

The script only accepts one Pi checkout, requires its `HEAD` to match
`PINNED_COMMIT`, and copies the seven upstream `src` directories into their
corresponding vendored directories. The integrity test and CI check protect
these invariants. Review the script before changing its copy scope.
