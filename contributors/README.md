# Contributor email -> GitHub login mappings

Each mapping is a file under `emails/`. Keeping one file per commit-author
email avoids merge conflicts during releases.

## Bun release workflow

1. Install the locked Bun dependencies:

   ```bash
   bun install --frozen-lockfile
   ```

2. Run the release checks:

   ```bash
   bun run check:monorepo
   bun run typecheck:runtime
   bun run test
   bun run build:web
   ```

3. Add any missing contributor mapping before tagging the release:

   ```bash
   printf '%s\n' '<github-login>' > contributors/emails/<email>
   ```

   Use the exact commit-author email from `git log --format='%ae'` as the
   filename. The first non-comment line is the GitHub login; lines beginning
   with `#` may contain a release or pull request note.

4. Commit the mapping, create the release tag, and publish the GitHub release.
   The repository's Bun and Docker release automation runs from that release.

GitHub noreply emails (`<id>+<login>@users.noreply.github.com` and
`<login>@users.noreply.github.com`) resolve automatically and do not need a
mapping file.
