#!/usr/bin/env bash

set -Eeuo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: verify-container.sh --container NAME [options]

Options:
  --container NAME       Docker container to probe (required)
  --url URL              Health URL (default: http://127.0.0.1:8080/api/health)
  --attempts N           Readiness attempts (default: 30)
  --interval-seconds N   Seconds between readiness attempts (default: 2)
  --shutdown-seconds N   Grace period passed to docker stop (default: 15)
EOF
}

container_name=
health_url=http://127.0.0.1:8080/api/health
attempts=30
interval_seconds=2
shutdown_seconds=15

while (($# > 0)); do
  case "$1" in
    --container)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      container_name=$2
      shift 2
      ;;
    --url)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      health_url=$2
      shift 2
      ;;
    --attempts)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      attempts=$2
      shift 2
      ;;
    --interval-seconds)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      interval_seconds=$2
      shift 2
      ;;
    --shutdown-seconds)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      shutdown_seconds=$2
      shift 2
      ;;
    --help|-h)
      usage >&1
      exit 0
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done

[[ -n "$container_name" ]] || { usage; exit 2; }
[[ "$attempts" =~ ^[1-9][0-9]*$ ]] || { echo "attempts must be a positive integer" >&2; exit 2; }
[[ "$interval_seconds" =~ ^[0-9]+$ ]] || { echo "interval-seconds must be a non-negative integer" >&2; exit 2; }
[[ "$shutdown_seconds" =~ ^[1-9][0-9]*$ ]] || { echo "shutdown-seconds must be a positive integer" >&2; exit 2; }

dump_logs() {
  echo "Container logs ($container_name):" >&2
  docker logs "$container_name" >&2 || true
}

fail() {
  echo "container verification failed: $*" >&2
  dump_logs
  exit 1
}

for attempt in $(seq 1 "$attempts"); do
  health_body=$(curl --fail --silent --show-error --max-time 5 "$health_url" 2>/dev/null || true)
  if [[ "$health_body" =~ \"status\"[[:space:]]*:[[:space:]]*\"ok\" ]]; then
    echo "health ready on attempt $attempt: $health_body"
    break
  fi
  if ((attempt == attempts)); then
    fail "health endpoint did not return status=ok after $attempts attempts"
  fi
  sleep "$interval_seconds"
done

running=$(docker inspect --format '{{.State.Running}}' "$container_name" 2>/dev/null || true)
[[ "$running" == "true" ]] || fail "container is not running after health became ready"

echo "stopping $container_name gracefully (timeout ${shutdown_seconds}s)"
docker stop --time "$shutdown_seconds" "$container_name" >/dev/null \
  || fail "docker stop did not complete successfully"

exit_code=$(docker wait "$container_name")
[[ "$exit_code" == "0" ]] || fail "container exited with status $exit_code"

state=$(docker inspect --format '{{.State.Status}}' "$container_name" 2>/dev/null || true)
[[ "$state" == "exited" ]] || fail "container state after shutdown was '$state', expected 'exited'"

echo "container shutdown verified: state=$state exit_code=$exit_code"
