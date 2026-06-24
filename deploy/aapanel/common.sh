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

  warn "Confira também no painel: Security → Firewall → libere 80 e 443."
  warn "Se usar VPS (AWS/DO/Linode), libere 80/443 no Security Group do provedor."
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
