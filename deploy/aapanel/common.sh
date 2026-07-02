# Helpers compartilhados — deploy aaPanel
#
# Diretórios padrão (VPS Sorelle):
#   APP_DIR    /home/deploy/sorelle-presentes        — código-fonte
#   SITE_ROOT  /home/deploy/sorelle-presentes/dist   — frontend publicado (raiz Nginx)

DEFAULT_DOMAIN="191.252.205.7"
DEFAULT_APP_DIR="/home/deploy/sorelle-presentes"
DEFAULT_SITE_ROOT="/home/deploy/sorelle-presentes/dist"
DEFAULT_SITE_NAME="sorelle-presentes"
DEFAULT_REPO_URL="https://github.com/CesarBorgesDev/sorelle-presentes.git"

load_deploy_env() {
  local deploy_env_file="${1:-}"

  if [ -n "$deploy_env_file" ] && [ -f "$deploy_env_file" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$deploy_env_file"
    set +a
  fi

  DOMAIN="${DOMAIN:-$DEFAULT_DOMAIN}"
  APP_DIR="${APP_DIR:-$DEFAULT_APP_DIR}"
  SITE_ROOT="${SITE_ROOT:-$DEFAULT_SITE_ROOT}"
  SITE_NAME="${SITE_NAME:-$DEFAULT_SITE_NAME}"
  REPO_URL="${REPO_URL:-$DEFAULT_REPO_URL}"
  GIT_BRANCH="${GIT_BRANCH:-main}"
  AAPANEL_VHOST="${AAPANEL_VHOST:-/www/server/panel/vhost/nginx/${SITE_NAME}.conf}"

  if [ -z "${API_DOMAIN:-}" ] && ! is_ipv4 "${DOMAIN:-}"; then
    API_DOMAIN="api.${DOMAIN}"
  fi
  AAPANEL_API_VHOST="${AAPANEL_API_VHOST:-/www/server/panel/vhost/nginx/${API_DOMAIN}.conf}"
}

print_deploy_paths() {
  echo "  APP_DIR:     ${APP_DIR}"
  echo "  SITE_ROOT:   ${SITE_ROOT}"
  echo "  DOMAIN:      ${DOMAIN}"
  echo "  API_DOMAIN:  ${API_DOMAIN:-(proxy /api no site principal)}"
  echo "  SITE_NAME:   ${SITE_NAME}"
  echo "  NGINX:       ${AAPANEL_VHOST}"
  if [ -n "${API_DOMAIN:-}" ]; then
    echo "  NGINX API:   ${AAPANEL_API_VHOST}"
    echo "  VITE_API:    $(vite_api_url)"
  fi
}

api_public_url() {
  if [ -n "${API_DOMAIN:-}" ]; then
    site_public_url "$API_DOMAIN"
  else
    site_public_url
  fi
}

vite_api_url() {
  echo "$(api_public_url)/api"
}

nginx_api_location_block() {
  if [ -n "${API_DOMAIN:-}" ] && ! is_ipv4 "${DOMAIN:-}"; then
    echo ""
    return
  fi

  cat <<'EOF'
    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
    }
EOF
}

log()  { echo -e "${GREEN:-}==>${NC:-} $*"; }
warn() { echo -e "${YELLOW:-}AVISO:${NC:-} $*"; }

is_ipv4() {
  [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

# http://191.252.205.7 ou https://seudominio.com.br
site_public_url() {
  local domain="${1:-$DOMAIN}"
  local scheme="${SITE_SCHEME:-}"

  if [ -z "$scheme" ]; then
    if is_ipv4 "$domain"; then
      scheme="http"
    else
      scheme="https"
    fi
  fi

  echo "${scheme}://${domain}"
}

nginx_default_server_flag() {
  if is_ipv4 "${DOMAIN:-}"; then
    echo "default_server"
  fi
}

open_firewall_ports() {
  log "Liberando portas 80 e 443 (firewall + aaPanel)..."

  if command -v ufw >/dev/null 2>&1; then
    ufw allow 80/tcp 2>/dev/null || true
    ufw allow 443/tcp 2>/dev/null || true
    ufw allow 22/tcp 2>/dev/null || true
    ufw --force enable 2>/dev/null || true
    ufw reload 2>/dev/null || true
    log "UFW: portas 80/443 liberadas."
  fi

  if command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port=80/tcp 2>/dev/null || true
    firewall-cmd --permanent --add-port=443/tcp 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
    log "firewalld: portas 80/443 liberadas."
  fi

  if command -v iptables >/dev/null 2>&1; then
    iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null \
      || iptables -I INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
    iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null \
      || iptables -I INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
  fi

  if command -v bt >/dev/null 2>&1; then
    bt firewall add 80/tcp 2>/dev/null || true
    bt firewall add 443/tcp 2>/dev/null || true
    log "aaPanel (bt): regras de firewall solicitadas."
  fi

  warn "aaPanel → Security → Firewall → portas 80/443 com estratégia Allow."
  warn "Locaweb Cloud → IP público 191.252.205.7 → aba Firewall → TCP 80 e 443."
}

ensure_nginx_running() {
  log "Garantindo Nginx ativo na porta 80..."

  if [ -x /etc/init.d/nginx ]; then
    /etc/init.d/nginx start 2>/dev/null || /etc/init.d/nginx restart 2>/dev/null || true
  elif [ -x /www/server/nginx/sbin/nginx ]; then
    if ! /www/server/nginx/sbin/nginx -t 2>/dev/null; then
      warn "Config Nginx inválida — verifique vhost em /www/server/panel/vhost/nginx/"
      return 1
    fi
    pgrep -f '/www/server/nginx/sbin/nginx' >/dev/null 2>&1 \
      || /www/server/nginx/sbin/nginx 2>/dev/null || true
  fi

  if command -v bt >/dev/null 2>&1; then
    bt restart nginx 2>/dev/null || bt reload 2>/dev/null || true
  fi

  if ss -tln 2>/dev/null | grep -q ':80 '; then
    log "Nginx escutando na porta 80."
    return 0
  fi

  warn "Porta 80 ainda não está em LISTEN. Instale/inicie Nginx pelo aaPanel → App Store."
  return 1
}

diagnose_access() {
  echo ""
  echo "=== Diagnóstico de acesso (191.252.205.7) ==="
  echo "Portas em LISTEN:"
  ss -tlnp 2>/dev/null | grep -E ':80 |:443 |:3001 ' || echo "  (nenhuma das portas 80/443/3001)"
  echo ""
  echo "Nginx:"
  if pgrep -f nginx >/dev/null 2>&1; then echo "  processo: rodando"; else echo "  processo: PARADO"; fi
  echo ""
  echo "Docker:"
  docker ps --format '  {{.Names}}: {{.Status}}' 2>/dev/null || echo "  docker não disponível"
  echo ""
  echo "Teste local:"
  curl -s -o /dev/null -w "  http://127.0.0.1/ → HTTP %{http_code}\n" http://127.0.0.1/ 2>/dev/null || echo "  http://127.0.0.1/ → falhou"
  curl -s -o /dev/null -w "  http://127.0.0.1:3001/api/health → HTTP %{http_code}\n" http://127.0.0.1:3001/api/health 2>/dev/null || echo "  API → falhou"
  echo ""
  if command -v ufw >/dev/null 2>&1; then
    echo "UFW:"
    ufw status 2>/dev/null | head -20 || true
  fi
  echo "============================================="
}

ensure_site_root() {
  mkdir -p "$SITE_ROOT"
  chown -R www:www "$SITE_ROOT" 2>/dev/null || true
}

is_aapanel_placeholder_page() {
  local file="$1"
  [ -f "$file" ] || return 1
  grep -q 'Congratulations, the site is created successfully' "$file" 2>/dev/null \
    || grep -q 'automatically generated by the system' "$file" 2>/dev/null \
    || grep -q 'This is the default index.html' "$file" 2>/dev/null
}

remove_aapanel_placeholder() {
  local root="${1:-${SITE_ROOT:-}}"
  local index="${root}/index.html"

  if is_aapanel_placeholder_page "$index"; then
    log "Removendo index.html padrão do aaPanel em ${root}..."
    rm -f "$index"
  fi
}

is_react_index() {
  local file="$1"
  [ -f "$file" ] || return 1
  grep -q 'id="root"' "$file" 2>/dev/null \
    || grep -q '/assets/index-' "$file" 2>/dev/null
}

# Publica dist/ do React no SITE_ROOT, substituindo a página padrão do aaPanel
publish_frontend() {
  local dist_dir="${1:-${APP_DIR}/dist}"
  local target="${2:-${SITE_ROOT}}"

  if [ ! -d "$dist_dir" ]; then
    warn "Pasta dist não encontrada: $dist_dir"
    return 1
  fi

  ensure_site_root
  remove_aapanel_placeholder "$target"

  log "Publicando loja React → ${target}"
  rsync -a --delete "${dist_dir}/" "${target}/"
  chown -R www:www "$target" 2>/dev/null || true

  if is_react_index "${target}/index.html"; then
    log "Página inicial React publicada."
  elif is_aapanel_placeholder_page "${target}/index.html"; then
    warn "index.html ainda é o padrão do aaPanel — rode npm run build antes de publicar."
    return 1
  else
    warn "index.html em ${target} não parece ser o build React."
  fi
}

write_nginx_vhost() {
  local script_dir="${DEPLOY_AAPANEL_DIR:-}"
  local template out_dir default_flag

  [ -n "$script_dir" ] || { warn "DEPLOY_AAPANEL_DIR não definido"; return 1; }

  template="${script_dir}/nginx-vhost.conf.template"
  [ -f "$template" ] || { warn "Template Nginx não encontrado: $template"; return 1; }

  AAPANEL_VHOST="${AAPANEL_VHOST:-/www/server/panel/vhost/nginx/${DOMAIN}.conf}"
  default_flag="$(nginx_default_server_flag)"
  out_dir="$(dirname "$AAPANEL_VHOST")"
  mkdir -p "$out_dir" /www/wwwlogs 2>/dev/null || true

  log "Configurando Nginx → ${AAPANEL_VHOST}"
  log "  root: ${SITE_ROOT} | server_name: ${DOMAIN} ${SITE_NAME}"
  DOMAIN="$DOMAIN" SITE_NAME="$SITE_NAME" SITE_ROOT="$SITE_ROOT" APP_DIR="$APP_DIR" \
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
      gsub(/\{\{SITE_ROOT\}\}/, ENVIRON["SITE_ROOT"], line)
      gsub(/\{\{APP_DIR\}\}/, ENVIRON["APP_DIR"], line)
      gsub(/\{\{NGINX_DEFAULT_SERVER\}\}/, ENVIRON["NGINX_DEFAULT_SERVER"], line)
      print line
    }
  ' API_BLOCK="$(nginx_api_location_block)" "$template" > "$AAPANEL_VHOST"
}

write_nginx_api_vhost() {
  local script_dir="${DEPLOY_AAPANEL_DIR:-}"
  local template out_dir default_flag

  [ -n "${API_DOMAIN:-}" ] || return 0
  is_ipv4 "${DOMAIN:-}" && return 0

  [ -n "$script_dir" ] || { warn "DEPLOY_AAPANEL_DIR não definido"; return 1; }

  template="${script_dir}/nginx-api-vhost.conf.template"
  [ -f "$template" ] || { warn "Template API Nginx não encontrado: $template"; return 1; }

  default_flag=""
  out_dir="$(dirname "$AAPANEL_API_VHOST")"
  mkdir -p "$out_dir" /www/wwwlogs 2>/dev/null || true

  log "Configurando Nginx API → ${AAPANEL_API_VHOST}"
  log "  server_name: ${API_DOMAIN} → 127.0.0.1:3001"
  sed -e "s|{{API_DOMAIN}}|${API_DOMAIN}|g" \
      -e "s|{{NGINX_DEFAULT_SERVER}}|${default_flag}|g" \
      "$template" > "$AAPANEL_API_VHOST"
}

reload_nginx() {
  log "Recarregando Nginx..."
  ensure_nginx_running || true
  if command -v bt >/dev/null 2>&1; then
    bt reload 2>/dev/null || true
  fi
  if [ -x /etc/init.d/nginx ]; then
    /etc/init.d/nginx reload 2>/dev/null || /etc/init.d/nginx restart 2>/dev/null || true
  elif command -v nginx >/dev/null 2>&1; then
    nginx -t && nginx -s reload 2>/dev/null || true
  elif [ -x /www/server/nginx/sbin/nginx ]; then
    /www/server/nginx/sbin/nginx -t && /www/server/nginx/sbin/nginx -s reload 2>/dev/null || true
  else
    warn "Recarregue o Nginx manualmente pelo aaPanel."
  fi
}

update_server_env_urls() {
  local env_file="${APP_DIR}/server/.env"
  local frontend_url api_url
  frontend_url="$(site_public_url)"
  api_url="$(api_public_url)"

  [ -f "$env_file" ] || return 0

  log "Atualizando URLs em server/.env"
  log "  FRONTEND → ${frontend_url} | API → ${api_url}"
  sed -i "s|CORS_ORIGIN=.*|CORS_ORIGIN=${frontend_url}|" "$env_file"
  sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=${frontend_url}|" "$env_file"
  sed -i "s|APP_PUBLIC_URL=.*|APP_PUBLIC_URL=${api_url}|" "$env_file"
}

wait_for_db() {
  local i
  log "Aguardando PostgreSQL..."
  for i in $(seq 1 30); do
    if docker exec sorelle-db pg_isready -U postgres -d sorelle >/dev/null 2>&1; then
      log "PostgreSQL respondendo."
      return 0
    fi
    sleep 2
  done
  warn "PostgreSQL não respondeu a tempo. Verifique: docker ps"
  return 1
}

# Migração pelo host VPS — DATABASE_URL deve usar 127.0.0.1 (não "db")
run_db_migrate() {
  local app_dir="${1:-${APP_DIR:-.}}"

  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^sorelle-db$'; then
    warn "Container sorelle-db não está rodando — suba o Docker antes de migrar."
    return 1
  fi

  wait_for_db || return 1

  if [ -f "${app_dir}/server/.env" ] && grep -q '@db:5432' "${app_dir}/server/.env" 2>/dev/null; then
    warn "Corrigindo DATABASE_URL: db → 127.0.0.1 em server/.env"
    sed -i 's|@db:5432|@127.0.0.1:5432|' "${app_dir}/server/.env"
  fi

  log "Executando migrações (host → 127.0.0.1:5432)..."
  npm run db:migrate --prefix "${app_dir}/server"
}
