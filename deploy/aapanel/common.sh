# Helpers compartilhados — deploy aaPanel

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
  mkdir -p "/www/wwwroot/${DOMAIN}" 2>/dev/null || true
  chown -R www:www "$SITE_ROOT" 2>/dev/null || true
}

update_server_env_urls() {
  local env_file="${APP_DIR}/server/.env"
  local base_url
  base_url="$(site_public_url)"

  [ -f "$env_file" ] || return 0

  log "Atualizando URLs em server/.env → ${base_url}"
  sed -i "s|CORS_ORIGIN=.*|CORS_ORIGIN=${base_url}|" "$env_file"
  sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=${base_url}|" "$env_file"
  sed -i "s|APP_PUBLIC_URL=.*|APP_PUBLIC_URL=${base_url}|" "$env_file"
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
