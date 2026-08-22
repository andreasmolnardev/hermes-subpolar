import { strict as assert } from "node:assert";
import { afterAll, afterEach, test } from "bun:test";
import { createHttpSpeechToTextProvider, createHttpTextToSpeechProvider } from "../src/index";

const originalFetch = globalThis.fetch;
const fetchCalls: { readonly input: RequestInfo | URL; readonly init?: RequestInit }[] = [];
globalThis.fetch = async (input, init) => {
  fetchCalls.push({ input, init });
  return new Response(JSON.stringify({ text: "hello there" }), { status: 200 });
};

afterEach(() => fetchCalls.splice(0));
afterAll(() => { globalThis.fetch = originalFetch; });

test("speech-to-text sends multipart audio and returns editable text", async () => {
  globalThis.fetch = async (input, init) => {
    fetchCalls.push({ input, init });
    return new Response(JSON.stringify({ text: "hello there" }), { status: 200 });
  };
  const text = await createHttpSpeechToTextProvider({ endpoint: "https://voice.example.test/transcribe", apiKey: "secret" }).transcribe({
    audio: new Uint8Array([1, 2, 3]),
    mimeType: "audio/webm",
    model: "listen-v1",
    language: "en",
  });
  assert.equal(text, "hello there");
  const request = fetchCalls[0]?.init;
  assert.equal(request?.method, "POST");
  assert.deepEqual(request?.headers, { Authorization: "Bearer secret" });
  assert.ok(request?.body instanceof FormData);
});

test("text-to-speech returns provider audio without coupling to a chat provider", async () => {
  globalThis.fetch = async (input, init) => {
    fetchCalls.push({ input, init });
    return new Response(new Uint8Array([4, 5]), { status: 200, headers: { "content-type": "audio/ogg" } });
  };
  const result = await createHttpTextToSpeechProvider({ endpoint: "https://voice.example.test/speech" }).synthesize({
    text: "Read this",
    model: "speak-v1",
    voice: "alloy",
    speed: 1.1,
  });
  assert.deepEqual([...result.audio], [4, 5]);
  assert.equal(result.mimeType, "audio/ogg");
  assert.deepEqual(JSON.parse(String(fetchCalls[0]?.init?.body)), { model: "speak-v1", input: "Read this", voice: "alloy", speed: 1.1 });
});
