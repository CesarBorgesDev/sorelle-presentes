#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec bash "${ROOT}/deploy-vps.sh" "$@"
