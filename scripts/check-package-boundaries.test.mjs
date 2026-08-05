import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";

import { check, PACKAGE_NAMES, SUPPORT_PACKAGE_NAMES } from "./check-package-boundaries.mjs";

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "hermes-boundaries-"));
  for (const name of [...PACKAGE_NAMES, ...SUPPORT_PACKAGE_NAMES]) {
    const directory = join(root, "packages", name);
    await mkdir(join(directory, "src"), { recursive: true });
    await writeFile(join(directory, "src", "index.ts"), "export {};\n");
    await writeFile(join(directory, "package.json"), JSON.stringify({
      name: name === "shared" ? "@hermes/shared" : name,
      private: true,
      type: "module",
      scripts: { typecheck: "true", test: "true", check: "true" },
      ...(name === "web-ui" ? { browserDependencies: [] } : {})
    }));
  }
  return root;
}

test("rejects undeclared browser and server-only imports", async () => {
  const root = await createFixture();
  try {
    await writeFile(join(root, "packages", "web-ui", "package.json"), JSON.stringify({
      name: "web-ui",
      private: true,
      type: "module",
      browserDependencies: [],
      dependencies: { "provider-sdk": "1.0.0" },
      scripts: { typecheck: "true", test: "true", check: "true" }
    }));
    await writeFile(join(root, "packages", "web-ui", "src", "index.ts"),
      'import "provider-sdk";\nimport "node:fs";\n');
    await assert.rejects(check({ root }), /not browser-safe/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("requires declared package edges and allows explicit browser dependencies", async () => {
  const root = await createFixture();
  try {
    await writeFile(join(root, "packages", "web-ui", "package.json"), JSON.stringify({
      name: "web-ui",
      private: true,
      type: "module",
      browserDependencies: ["dompurify"],
      dependencies: { "dompurify": "1.0.0" },
      scripts: { typecheck: "true", test: "true", check: "true" }
    }));
    await writeFile(join(root, "packages", "web-ui", "src", "index.ts"),
      'import "dompurify";\nimport type { WorkspaceSummary } from "data-layer/contracts";\nexport type { WorkspaceSummary };\n');
    await assert.rejects(check({ root }), /imports undeclared package/);

    await writeFile(join(root, "packages", "web-ui", "package.json"), JSON.stringify({
      name: "web-ui",
      private: true,
      type: "module",
      browserDependencies: ["dompurify"],
      dependencies: { "dompurify": "1.0.0", "data-layer": "0.0.0" },
      scripts: { typecheck: "true", test: "true", check: "true" }
    }));
    await check({ root });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("requires declared third-party imports in server packages", async () => {
  const root = await createFixture();
  try {
    await writeFile(join(root, "packages", "harness", "src", "index.ts"),
      'import "unlisted-server-package";\n');
    await assert.rejects(check({ root }), /imports undeclared dependency/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
