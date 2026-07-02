#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# Atalho de compatibilidade — use deploy-vps.sh (script único recomendado).
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${SELF_DIR}/deploy-vps.sh" "$@"
