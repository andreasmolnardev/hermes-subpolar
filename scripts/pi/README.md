# Vendored Pi packages

Hermes Subpolar vendors the runtime source closure from
[`earendil-works/pi`](https://github.com/earendil-works/pi). The imported
packages and upstream revision are recorded in `PINNED_COMMIT`.

To refresh the subtree, check out the desired upstream commit and run:

```sh
bash scripts/pi/sync-pi.sh /path/to/pi-checkout
```

The script only replaces `packages/pi-*/src`. Subpolar package manifests and
adapter code remain outside the upstream import surface so that an upstream
refresh cannot silently overwrite application policy.

Imported package directories:

```text
agent        → packages/pi-agent       (@earendil-works/pi-agent-core)
ai           → packages/pi-ai          (@earendil-works/pi-ai)
client       → packages/pi-client      (@earendil-works/pi-client)
coding-agent → packages/pi-coding-agent (@earendil-works/pi-coding-agent)
protocol     → packages/pi-protocol    (@earendil-works/pi-protocol)
telemetry    → packages/pi-telemetry   (@earendil-works/pi-telemetry)
tui          → packages/pi-tui         (@earendil-works/pi-tui)
```
