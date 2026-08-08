# Configuration Contract

Wave 0 configuration is the Bun gateway's process configuration plus the
authenticated first-run provider setup. The browser never supplies process
configuration or receives provider credentials.

## Process Configuration

When launched as `bun src/server.ts`, the server reads:

| Variable | Default | Contract |
| --- | --- | --- |
| `SUBPOLAR_HOST` | `127.0.0.1` | Bun listen hostname |
| `SUBPOLAR_PORT` | `8080` | Integer TCP port from 1 through 65535 |
| `SUBPOLAR_STATIC_ROOT` | `packages/web-ui/dist` relative to the working directory | Optional static asset root |
| `SUBPOLAR_DATA_DIR` | `.subpolar` in the working directory | Directory containing `state.db` and the private credential key |

When the server is embedded, `hostname`, `port`, `staticRoot`, `dataDir`,
`provider`, and `maxRequestBytes` are constructor options. `maxRequestBytes`
defaults to `1_048_576` and must be a positive integer. These options are not
HTTP request fields.

The default directory is persistent for local use. Production deployments
should set `SUBPOLAR_DATA_DIR` to a private durable directory.

## First-Run Setup

The authenticated administrator uses `/v1/setup/providers` to read the
catalog, then `/v1/setup/provider` to store one connection. The setup request
contains:

```ts
type ProviderSetup = {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};
```

The provider must be present in the catalog. `baseUrl` must be a valid HTTPS
URL, or an HTTP URL whose hostname is `localhost`, `127.0.0.1`, or `::1`.
`apiKey` and `model` must be non-empty; model names are limited to 256
characters. The normalized base URL and connection are stored server-side.

The setup status is complete only when a provider connection exists and the
authenticated user owns a `master` agent. `/v1/setup/agents` creates the
default project and the `master` agent, plus the selected `research` template.

## Configuration Boundaries

- Browser-visible configuration is limited to setup metadata and the provider
  catalog's `slug`, `label`, `description`, `authType`, and optional default
  `baseUrl`.
- API keys are accepted only by the authenticated setup request, encrypted in
  the server state database with a private per-directory key, and resolved by
  opaque handles at the provider boundary.
- The current Bun entrypoint does not load a `config.yaml` file. Such a file is
  not an input to this `/v1` contract.
- The current entrypoint does not read provider keys from arbitrary process
  environment variables. Provider setup is the supported public configuration
  path.
- The gateway accepts one configured provider connection. Provider selection,
  catalog metadata, and provider execution are separate concerns.

## Deployment Requirements

Bind the gateway to loopback unless a trusted reverse proxy provides TLS and
the public browser origin is preserved through the proxy. The origin check
compares the request's `Origin` with the origin parsed from the request URL, so
proxy routing must not create an internal/public-origin mismatch.

The data directory must be readable and writable only by the gateway account.
It contains identity, session ownership, transcript, and provider credential
data. Backups and filesystem permissions are part of the deployment boundary.
