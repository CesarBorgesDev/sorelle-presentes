#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# Configura Nginx do aaPanel para proxy Docker:
#   /     → 127.0.0.1:3000 (frontend)
#   /api  → 127.0.0.1:3001 (backend)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEPLOY_AAPANEL_DIR="${APP_DIR}/deploy/aapanel"
DEPLOY_ENV="${DEPLOY_AAPANEL_DIR}/.env.deploy"

# shellcheck source=../aapanel/common.sh
source "${DEPLOY_AAPANEL_DIR}/common.sh"
DEPLOY_AAPANEL_DIR="$DEPLOY_AAPANEL_DIR"

load_deploy_env "$DEPLOY_ENV"

patch_nginx_docker_frontend() {
  local vhost_dir="/www/server/panel/vhost/nginx"
  local tmp_block patched_count nginx_test_out

  [ -d "$vhost_dir" ] || { warn "Pasta Nginx não encontrada: $vhost_dir — pule se não usar aaPanel."; return 0; }

  tmp_block="$(mktemp)"
  cat > "$tmp_block" << 'EOF'
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
    }
EOF

  log "Aplicando proxy / → 127.0.0.1:3000 nos vhosts do domínio..."
  patched_count="$(
    python3 - "$vhost_dir" "$DOMAIN" "$SITE_NAME" "$tmp_block" << 'PY'
import re
import sys
from pathlib import Path

vhost_dir, domain, site_name, block_file = sys.argv[1:5]
front_block = Path(block_file).read_text()
if not front_block.endswith("\n"):
    front_block += "\n"

markers = [m for m in (
    domain,
    f"www.{domain}",
    site_name,
    "sorellepresentes.com.br",
    "sorelle-presentes",
) if m]
patched = []

def block_matches(block: str) -> bool:
    return any(m and m in block for m in markers)

def has_front_proxy(block: str) -> bool:
    return "127.0.0.1:3000" in block and re.search(r"location\s+/\s*\{", block)

def iter_server_blocks(text: str):
    pos = 0
    while pos < len(text):
        match = re.search(r"\bserver\s*\{", text[pos:])
        if not match:
            break
        start = pos + match.start()
        brace = pos + match.end() - 1
        depth = 0
        end = None
        for idx in range(brace, len(text)):
            ch = text[idx]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end = idx + 1
                    break
        if end is None:
            break
        yield start, end, text[start:end]
        pos = end

def replace_location_root(block: str) -> tuple[str, bool]:
    pattern = re.compile(
        r"[ \t]*location[ \t]+/[ \t]*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\s*\n?",
        re.MULTILINE | re.DOTALL,
    )
    if has_front_proxy(block):
        return block, False
    new, n = pattern.subn(front_block + "\n", block, count=1)
    if n:
        return new, True
    insert_before = (
        r"(\n)([ \t]*location[ \t]+\^[ \t]*~[ \t]+/api\b)",
        r"(\n)([ \t]*error_page[ \t])",
        r"(\n)([ \t]*access_log[ \t])",
    )
    for pat in insert_before:
        new, n = re.subn(pat, r"\1" + front_block + r"\2", block, count=1)
        if n:
            return new, True
    new, n = re.subn(r"\n\}\s*$", "\n" + front_block + "\n}\n", block, count=1)
    return (new, True) if n else (block, False)

def patch_file(text: str) -> tuple[str, bool]:
    spans = list(iter_server_blocks(text))
    if not spans:
        return text, False
    changed = False
    parts = []
    cursor = 0
    for start, end, block in spans:
        parts.append(text[cursor:start])
        new_block = block
        if block_matches(block):
            new_block, block_changed = replace_location_root(block)
            if block_changed:
                changed = True
        parts.append(new_block)
        cursor = end
    parts.append(text[cursor:])
    return "".join(parts), changed

for conf in sorted(Path(vhost_dir).rglob("*.conf")):
    try:
        original = conf.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        continue
    if not any(m and m in original for m in markers):
        continue
    updated, changed = patch_file(original)
    if not changed:
        continue
    backup = conf.with_suffix(conf.suffix + ".bak")
    if not backup.exists():
        backup.write_text(original, encoding="utf-8")
    conf.write_text(updated, encoding="utf-8")
    patched.append(str(conf))

print(len(patched))
for path in patched:
    print(path, file=sys.stderr)
PY
  )"

  rm -f "$tmp_block"
  log "Vhosts com proxy frontend: ${patched_count}"
}

write_nginx_docker_vhost() {
  local out_file="${AAPANEL_VHOST:-/www/server/panel/vhost/nginx/${SITE_NAME}.conf}"
  local template="${SCRIPT_DIR}/nginx-vhost-docker.conf.template"
  local out_dir default_flag

  [ -f "$template" ] || { warn "Template Docker não encontrado: $template"; return 1; }
  [ -d "$(dirname "$out_file")" ] || { warn "aaPanel Nginx não encontrado — pulando vhost."; return 0; }

  if [ -f "$out_file" ] && grep -qE 'listen[[:space:]]+443|ssl_certificate' "$out_file" 2>/dev/null; then
    warn "Vhost ${out_file} tem SSL — mantendo certificados, só aplicando patch proxy."
    return 0
  fi

  default_flag="$(nginx_default_server_flag)"
  out_dir="$(dirname "$out_file")"
  mkdir -p "$out_dir" /www/wwwlogs 2>/dev/null || true

  log "Escrevendo vhost Docker → ${out_file}"
  DOMAIN="$DOMAIN" SITE_NAME="$SITE_NAME" APP_DIR="$APP_DIR" \
  NGINX_DEFAULT_SERVER="$default_flag" \
  awk '
    BEGIN {
      api = ENVIRON["API_BLOCK"]
      gsub(/\r/, "", api)
    }
    /\{\{API_LOCATION_BLOCK\}\}/ {
      if (length(api) > 0) printf "%s\n", api
      next
    }
    {
      line = $0
      gsub(/\{\{DOMAIN\}\}/, ENVIRON["DOMAIN"], line)
      gsub(/\{\{SITE_NAME\}\}/, ENVIRON["SITE_NAME"], line)
      gsub(/\{\{APP_DIR\}\}/, ENVIRON["APP_DIR"], line)
      gsub(/\{\{NGINX_DEFAULT_SERVER\}\}/, ENVIRON["NGINX_DEFAULT_SERVER"], line)
      print line
    }
  ' API_BLOCK="$(nginx_api_template_block)" "$template" > "$out_file"
}

configure_nginx_docker() {
  write_nginx_docker_vhost || true
  patch_nginx_docker_frontend || true
  patch_nginx_api_proxy || true
  reload_nginx || true
}

configure_nginx_docker
