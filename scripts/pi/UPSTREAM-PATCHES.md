# Local upstream patches

The vendored source currently has one compatibility patch:

* `packages/pi-ai/src/providers/xai.ts` widens `xaiProvider()` to include both
  API variants present in the generated `0.84.2` model catalog. The source
  provider declaration only named Responses while the release catalog also
  contains legacy OpenAI-completions models.

When refreshing Pi, re-evaluate this patch against the new generated catalog
and remove it once upstream has resolved the mismatch.
