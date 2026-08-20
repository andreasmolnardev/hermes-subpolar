# Configuration Contract

Behavioral configuration has one source: the TypeScript-owned YAML file
`config.yaml`. The resolved path is an operator setting, and state paths are
derived through the runtime's `get_hermes_home()` equivalent rather than a
hard-coded home directory.

Environment variables and injected secret stores contain secrets only. They
MUST NOT override behavioral YAML values. The runtime does not reuse Python
configuration parsing or silently merge legacy configuration files.

## Shape

The following is the contract shape; omitted optional fields use documented
defaults and unknown keys fail validation.

```yaml
version: 1
server:
  host: 127.0.0.1
  port: 8080
  publicOrigin: https://subpolar.example
  maxRequestBytes: 1048576
  sessionLifetimeSeconds: 604800
provider:
  kind: openai-compatible
  baseUrl: https://api.openai.com/v1
  model: model-id
  credentialRef: SUBPOLAR_OPENAI_API_KEY
  defaultPolicy: ask
  shell:
    enabled: false
    executableRoots: []
    cwdRoots: []
    maxTimeoutMs: 30000
    maxOutputBytes: 65536
    allowedCommands: []
  openapi: []
  mcp: []
  retentionDays: 30
  maxTranscriptBytes: 10485760
```

The example values are illustrative but the keys and scalar types are
normative. `host` is a string, `port` and all limits are positive integers,
booleans are literal booleans, and policies are the closed set `deny`, `ask`,
`allow`, `auto`.

## Validation

- YAML must decode to a mapping with `version: 1`.
- Unknown keys, duplicate keys, invalid scalar types, empty required strings, non-finite numbers, and invalid URLs fail closed before server startup.
- `publicOrigin` is an absolute HTTP(S) origin with no path, query, fragment, username, or password. Production deployments use HTTPS.
- `maxRequestBytes`, transcript limits, timeouts, and retention values are bounded by implementation safety ceilings; a config cannot disable a ceiling with a large value.
- Relative filesystem paths are rejected for executable roots, working-directory roots, and state paths.
- A provider or tool definition that is not fully typed and policy-bound is rejected rather than dynamically interpreted.

## Secrets

`credentialRef` names a secret supplied by the process environment or an
injected secret store. The API key is injected only at the provider boundary.
It is never part of YAML, browser metadata, API responses, events, error text,
or ordinary logs. Setup may accept a secret over an authenticated write-only
request, but the response is only `{ "configured": true }`.

The provider secret is not used as a behavioral toggle. A missing or empty
secret produces `provider_not_configured` and does not attempt a provider call.

## Reload And Failure

Configuration is loaded and validated at startup. A future reload operation
must validate the complete replacement before swapping it atomically; partial
reloads and environment-driven behavioral changes are not supported. Invalid
configuration prevents startup or reload and preserves the last valid active
configuration.

There is no Python fallback, legacy key alias, implicit provider discovery, or
unknown-key preservation.
