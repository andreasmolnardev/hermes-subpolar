import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { checkPiVendor } from "./check-pi-vendor.mjs";

const root = join(import.meta.dir, "..");

describe("Pi vendor integrity", () => {
  test("matches the pinned commit documentation and vendored package closure", async () => {
    const result = await checkPiVendor({ root });
    expect(result.pinned).toMatch(/^[0-9a-f]{40}$/u);
    expect(result.packages).toHaveLength(7);
  });

  test("documents the reproducible package-batched update procedure", async () => {
    const readme = await readFile(join(root, "scripts/pi/README.md"), "utf8");
    for (const requiredText of [
      "## Imported closure",
      "## Exact update procedure",
      "PINNED_COMMIT",
      "git -C /path/to/pi-checkout checkout --detach <40-character-commit-sha>",
      "bash scripts/pi/sync-pi.sh /path/to/pi-checkout",
      "bun run --filter './packages/pi-*' check",
      "bun run check:pi",
      "bun run test:pi",
      "bun run check:boundaries",
      "bun run --filter tool-runtime check",
      "security suites",
      "Review local patches",
      "one package-batched commit",
      "git diff --cached --check",
      "git push"
    ]) {
      expect(readme).toContain(requiredText);
    }
    for (const excludedPackage of ["pi-evals", "pi-server", "pi-session-backends"]) {
      expect(readme).toContain(`\`${excludedPackage}\``);
    }
  });

  test("keeps the sync script's pin and copy-scope safeguards documented", async () => {
    const script = await readFile(join(root, "scripts/pi/sync-pi.sh"), "utf8");
    expect(script).toContain('pinned=$(tr -d \'[:space:]\' < "$root/scripts/pi/PINNED_COMMIT")');
    expect(script).toContain('if [[ "$actual" != "$pinned" ]]');
    expect(script).toContain('source="$repo/packages/$upstream/src"');
    expect(script).toContain('destination="$root/packages/${packages[$upstream]}/src"');
    expect(script).toContain("manifests, lockfiles, and Subpolar adapters stay local");
    expect(script).not.toContain('destination="$root/packages/${packages[$upstream]}"');
  });
});
