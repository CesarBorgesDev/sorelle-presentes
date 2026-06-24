#!/bin/bash
# Atalho — use install-aapanel-ubuntu.sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "${SCRIPT_DIR}/install-aapanel-ubuntu.sh" "$@"
