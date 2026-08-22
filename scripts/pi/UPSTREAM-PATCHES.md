# Local upstream patches

The vendored source currently has one compatibility patch:

* `packages/pi-ai/src/providers/xai.ts` widens `xaiProvider()` to include both
  API variants present in the generated `0.84.2` model catalog. The source
  provider declaration only named Responses while the release catalog also
  contains legacy OpenAI-completions models.

When refreshing Pi, re-evaluate this patch against the new generated catalog
and remove it once upstream has resolved the mismatch.

The pinned source also has two application-consumer compatibility patches:

* `packages/pi-ai/src/api/openai-codex-responses.ts` casts the SSE body at the
  fetch boundary because Bun and DOM `BodyInit` declarations disagree on the
  accepted byte-array type.
* `packages/pi-ai/src/utils/headers.ts` iterates `Headers` through its runtime
  iterable contract because the Bun declaration does not expose `entries()`.
