#!/usr/bin/env bash
# Static preview server for the PWA shell.
# Serves app/ as-is with no build step — the served files are byte-for-byte the source.
# Usable from the desktop browser and from an iPhone on the same LAN.
set -euo pipefail

PORT="${PORT:-8000}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../app" && pwd)"

echo "Serving app/ at http://localhost:${PORT}"
exec python3 -m http.server "${PORT}" --directory "${ROOT}"
