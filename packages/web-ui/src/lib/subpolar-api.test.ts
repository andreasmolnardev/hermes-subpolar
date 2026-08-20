// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";

import { chatCompletion, subpolarRequest } from "./subpolar-api";

afterEach(() => {
  vi.restoreAllMocks();
});

test("sends the server-consumed chat requestId as an Idempotency-Key", async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

  await chatCompletion({ requestId: "request-1", model: "test", messages: [{ role: "user", content: "hello" }] });

  const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
  expect(new Headers(init.headers).get("Idempotency-Key")).toBe("request-1");
  expect(JSON.parse(String(init.body)).requestId).toBe("request-1");
});

test("does not add an idempotency header without an explicit requestId", async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

  await subpolarRequest("/v1/me");

  const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
  expect(new Headers(init.headers).has("Idempotency-Key")).toBe(false);
});
