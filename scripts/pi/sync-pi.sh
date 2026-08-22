#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 /path/to/pi-checkout" >&2
  exit 2
fi

repo=$1
root=$(cd "$(dirname "$0")/../.." && pwd)
pinned=$(tr -d '[:space:]' < "$root/scripts/pi/PINNED_COMMIT")

if [[ ! -d "$repo/.git" ]]; then
  echo "Pi checkout is not a git repository: $repo" >&2
  exit 1
fi

actual=$(git -C "$repo" rev-parse HEAD)
if [[ "$actual" != "$pinned" ]]; then
  echo "Pi checkout is at $actual; expected pinned commit $pinned" >&2
  exit 1
fi

declare -A packages=(
  [agent]=pi-agent
  [ai]=pi-ai
  [client]=pi-client
  [coding-agent]=pi-coding-agent
  [protocol]=pi-protocol
  [telemetry]=pi-telemetry
  [tui]=pi-tui
)

for upstream in "${!packages[@]}"; do
  source="$repo/packages/$upstream/src"
  destination="$root/packages/${packages[$upstream]}/src"
  if [[ ! -d "$source" ]]; then
    echo "Missing upstream source directory: $source" >&2
    exit 1
  fi
  rm -rf "$destination"
  mkdir -p "$destination"
  cp -R "$source/." "$destination/"
done

echo "Synchronized Pi source at $actual"
