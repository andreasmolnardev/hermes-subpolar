import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";

import { serveStatic } from "../src/static.ts";

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "subpolar-static-"));
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "index.html"), "<main>app</main>");
  await writeFile(join(root, "assets", "app-a1b2c3d4.js"), "console.log('ok')");
  return root;
}

test("static serving uses immutable asset caching and SPA fallback", async () => {
  const root = await fixture();
  const asset = await serveStatic(new Request("http://localhost/assets/app-a1b2c3d4.js"), { root });
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(await asset.text(), "console.log('ok')");

  const page = await serveStatic(new Request("http://localhost/chat/123", { headers: { accept: "text/html" } }), { root });
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.equal(await page.text(), "<main>app</main>");
});

test("static serving rejects traversal and does not fall back for API misses", async () => {
  const root = await fixture();
  for (const path of ["/%2e%2e/secret", "/%2f%2fsecret", "/api/missing", "/v1/missing"]) {
    const response = await serveStatic(new Request(`http://localhost${path}`), { root });
    assert.equal(response.status, 404, path);
  }
  const method = await serveStatic(new Request("http://localhost/", { method: "POST" }), { root });
  assert.equal(method.status, 405);
});
