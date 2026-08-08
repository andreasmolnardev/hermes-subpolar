import { strict as assert } from "node:assert";
import { test } from "bun:test";

import { SQLiteIdentityRepository } from "data-layer";
import { beginProviderOAuth, completeProviderOAuth, refreshProviderCredential } from "../src/provider-auth.ts";

test("provider OAuth broker persists PKCE state and encrypted access tokens", async () => {
  const previous = process.env.SUBPOLAR_OPENAI_CODEX_CLIENT_ID;
  process.env.SUBPOLAR_OPENAI_CODEX_CLIENT_ID = "client-id";
  const identity = new SQLiteIdentityRepository(":memory:");
  try {
    const user = await identity.bootstrap("operator", "correct horse");
    const started = beginProviderOAuth(identity, "openai-codex", "https://api.example.test/v1", "gpt-test", "http://localhost:8080", user.principal.id);
    assert.match(started.authorizationUrl, /code_challenge=/);
    assert.match(started.authorizationUrl, /client_id=client-id/);
    await completeProviderOAuth(identity, "openai-codex", started.state, "authorization-code", user.principal.id, async (_input, init) => {
      assert.match(String(init?.body), /code_verifier=/);
      return Response.json({ access_token: "access-token", refresh_token: "refresh-token", expires_in: 3600 });
    });
    const credentials = identity.resolveCredentialHandle("openai-codex:default");
    assert.equal(credentials.accessToken, "access-token");
    assert.equal(credentials.refreshToken, "refresh-token");
    assert.equal(typeof credentials.expiresAt, "number");
  } finally {
    identity.close();
    if (previous === undefined) delete process.env.SUBPOLAR_OPENAI_CODEX_CLIENT_ID;
    else process.env.SUBPOLAR_OPENAI_CODEX_CLIENT_ID = previous;
  }
});

test("provider OAuth broker refreshes expiring credentials without exposing tokens", async () => {
  const previous = process.env.SUBPOLAR_OPENAI_CODEX_CLIENT_ID;
  process.env.SUBPOLAR_OPENAI_CODEX_CLIENT_ID = "client-id";
  const identity = new SQLiteIdentityRepository(":memory:");
  try {
    identity.configureProviderCredentials("openai-codex", "https://api.example.test/v1", { accessToken: "old", refreshToken: "refresh", expiresAt: Date.now() - 1 }, "gpt-test");
    const refreshed = await refreshProviderCredential(identity, "openai-codex", "openai-codex:default", identity.resolveCredentialHandle("openai-codex:default"), async () => Response.json({ access_token: "new", expires_in: 3600 }));
    assert.equal(refreshed.accessToken, "new");
    assert.equal(identity.resolveCredentialHandle("openai-codex:default").accessToken, "new");
  } finally {
    identity.close();
    if (previous === undefined) delete process.env.SUBPOLAR_OPENAI_CODEX_CLIENT_ID;
    else process.env.SUBPOLAR_OPENAI_CODEX_CLIENT_ID = previous;
  }
});
