#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# =============================================================================
# Sorelle Presentes — Deploy VPS com Docker (script único)
#
# Arquitetura:
#   PostgreSQL  → Docker (interno)
#   Backend     → Docker, porta 3001 (127.0.0.1:3001)
#   Frontend    → Docker, porta 3000 (127.0.0.1:3000)
#   Nginx aaPanel → proxy público sorellepresentes.com.br
#                   /     → 127.0.0.1:3000
#                   /api  → 127.0.0.1:3001
#
# PASSO A PASSO — instalação na VPS (Ubuntu + aaPanel):
#
#   1. aaPanel → App Store: instale Nginx, Docker, Git
#   2. aaPanel → Website → Add site → domínio: sorellepresentes.com.br
#   3. DNS: sorellepresentes.com.br e www → A → IP da VPS
#   4. Na VPS, como root:
#
#        curl -fsSL https://raw.githubusercontent.com/CesarBorgesDev/sorelle-presentes/main/deploy-docker-vps.sh | bash
#
#      Ou, se o repo já estiver clonado:
#
#        bash /home/deploy/sorelle-presentes/deploy-docker-vps.sh
#
#   5. Após o script, configure SSL no aaPanel (Let's Encrypt)
#   6. Teste: https://sorellepresentes.com.br/api/health
#
# Atualizar após git push:
#   bash deploy-docker-vps.sh --update
#
# Só reconfigurar Nginx:
#   bash deploy-docker-vps.sh --nginx-only
# =============================================================================

set -euo pipefail

MODE="install"

usage() {
  cat <<'EOF'
Uso: deploy-docker-vps.sh [opções]

  (sem flag)     Clone/pull + Docker (frontend :3000, backend :3001) + Nginx + testes
  --update       Atualiza código e rebuild dos containers
  --nginx-only   Apenas reconfigura proxy Nginx (3000 + /api 3001)
  -h, --help     Esta ajuda

Valores padrão (podem ser sobrescritos por variáveis de ambiente):
  DOMAIN=sorellepresentes.com.br
  POSTGRES_PASSWORD=Sorelle1975
  APP_DIR=/home/deploy/sorelle-presentes
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --update) MODE="update"; shift ;;
    --nginx-only) MODE="nginx-only"; shift ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Opção desconhecida: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_URL="${REPO_URL:-https://github.com/CesarBorgesDev/sorelle-presentes.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"

if [ -f "${SELF_DIR}/deploy/docker/docker-compose.vps.yml" ]; then
  APP_DIR="${APP_DIR:-$SELF_DIR}"
else
  APP_DIR="${APP_DIR:-/home/deploy/sorelle-presentes}"
fi

DOMAIN="${DOMAIN:-sorellepresentes.com.br}"
SITE_NAME="${SITE_NAME:-sorelle-presentes}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-Sorelle1975}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_PORT="${BACKEND_PORT:-3001}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}==>${NC} $*"; }
warn() { echo -e "${YELLOW}AVISO:${NC} $*"; }
fail() { echo -e "${RED}ERRO:${NC} $*" >&2; exit 1; }
step() { echo -e "\n${GREEN}[$1]${NC} $2"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "'$1' não encontrado. Instale pelo aaPanel → App Store."
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    python3 -c "import secrets; print(secrets.token_hex(32))"
  fi
}

echo ""
echo "=============================================================================="
echo " Sorelle Presentes — Deploy Docker VPS"
echo " Modo:     ${MODE}"
echo " Domínio:  ${DOMAIN}"
echo " Frontend: 127.0.0.1:${FRONTEND_PORT}"
echo " Backend:  127.0.0.1:${BACKEND_PORT}"
echo " Repo:     ${REPO_URL} (branch ${GIT_BRANCH})"
echo " App:      ${APP_DIR}"
echo "=============================================================================="

DOCKER_DIR="${APP_DIR}/deploy/docker"
AAPANEL_DIR="${APP_DIR}/deploy/aapanel"
ENV_DOCKER="${APP_DIR}/.env.docker"
ENV_DEPLOY="${AAPANEL_DIR}/.env.deploy"
COMPOSE_FILE="${DOCKER_DIR}/docker-compose.vps.yml"

ensure_repo_layout() {
  if [ ! -f "${COMPOSE_FILE}" ]; then
    fail "Arquivo ${COMPOSE_FILE} não encontrado.
  Faça push dos arquivos de deploy para o GitHub (branch ${GIT_BRANCH}) e tente novamente."
  fi
}

fix_script_line_endings() {
  sed -i 's/\r$//' "${DOCKER_DIR}"/*.sh 2>/dev/null || true
  sed -i 's/\r$//' "${AAPANEL_DIR}"/*.sh 2>/dev/null || true
}

sync_repository() {
  step "1/7" "Clonar ou atualizar repositório"
  require_cmd git

  if [ -d "${APP_DIR}/.git" ]; then
    log "Repositório encontrado — git pull..."
    git -C "$APP_DIR" fetch origin "$GIT_BRANCH" 2>/dev/null || true
    git -C "$APP_DIR" checkout "$GIT_BRANCH" 2>/dev/null || true
    git -C "$APP_DIR" pull origin "$GIT_BRANCH" || warn "git pull falhou — usando código local."
  elif [ -d "$APP_DIR" ] && [ "$(ls -A "$APP_DIR" 2>/dev/null | head -1)" ]; then
    fail "Pasta $APP_DIR existe mas não é um clone git. Remova-a ou defina APP_DIR."
  else
    log "Clonando ${REPO_URL} → ${APP_DIR}"
    mkdir -p "$(dirname "$APP_DIR")"
    git clone -b "$GIT_BRANCH" "$REPO_URL" "$APP_DIR"
  fi
}

ensure_env_files() {
  step "2/7" "Configurar variáveis de ambiente"

  local jwt_secret admin_password

  if [ -f "$ENV_DOCKER" ]; then
    log "Usando ${ENV_DOCKER} existente."
    # shellcheck disable=SC1090
    set -a && source "$ENV_DOCKER" && set +a
  else
    jwt_secret="$(generate_secret)"
    admin_password="${ADMIN_PASSWORD:-$(generate_secret | cut -c1-16)}"

    log "Criando ${ENV_DOCKER} ..."
    cat > "$ENV_DOCKER" << EOF
DOMAIN=${DOMAIN}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
JWT_SECRET=${jwt_secret}
ADMIN_PASSWORD=${admin_password}
JWT_EXPIRES_IN=7d
ADMIN_EMAIL=admin@sorelle.com.br
CORS_ORIGIN=https://${DOMAIN}
FRONTEND_URL=https://${DOMAIN}
APP_PUBLIC_URL=https://api.${DOMAIN}
VITE_API_URL=https://api.${DOMAIN}/api
CHECKOUT_PAYMENT_METHOD=pix
PIX_KEY=
PIX_HOLDER_NAME=Sorelle Presentes
CORREIOS_FALLBACK=estimate
EOF
    chmod 600 "$ENV_DOCKER" 2>/dev/null || true
    warn "Senha admin gerada — veja ADMIN_PASSWORD em ${ENV_DOCKER}"
  fi

  mkdir -p "$AAPANEL_DIR"
  if [ ! -f "$ENV_DEPLOY" ]; then
    log "Criando ${ENV_DEPLOY} ..."
    cat > "$ENV_DEPLOY" << EOF
DOMAIN=${DOMAIN}
SITE_NAME=${SITE_NAME}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
APP_DIR=${APP_DIR}
SITE_ROOT=${APP_DIR}/dist
REPO_URL=${REPO_URL}
EOF
  fi
}

ensure_docker() {
  step "3/7" "Verificar Docker"
  require_cmd docker

  if ! docker info >/dev/null 2>&1; then
    fail "Docker não está rodando. Inicie pelo aaPanel → App Store → Docker."
  fi

  if ! docker compose version >/dev/null 2>&1; then
    fail "docker compose não encontrado. Instale Docker Compose v2."
  fi
}

run_compose() {
  local action="$1"
  step "4/7" "Subir containers Docker (frontend :${FRONTEND_PORT}, backend :${BACKEND_PORT})"

  cd "$APP_DIR"
  log "docker compose --env-file .env.docker -f deploy/docker/docker-compose.vps.yml ${action}"
  docker compose --env-file "$ENV_DOCKER" -f "$COMPOSE_FILE" up -d --build
}

wait_for_services() {
  step "5/7" "Aguardar backend e frontend"

  local i backend_ok frontend_ok

  for i in $(seq 1 90); do
    backend_ok=0
    frontend_ok=0
    curl -sf --connect-timeout 3 "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null 2>&1 && backend_ok=1
    curl -sf --connect-timeout 3 "http://127.0.0.1:${FRONTEND_PORT}/" >/dev/null 2>&1 && frontend_ok=1

    if [ "$backend_ok" -eq 1 ] && [ "$frontend_ok" -eq 1 ]; then
      log "Backend e frontend respondendo."
      return 0
    fi
    sleep 2
  done

  warn "Timeout aguardando containers — verifique: docker compose -f deploy/docker/docker-compose.vps.yml ps"
  docker compose --env-file "$ENV_DOCKER" -f "$COMPOSE_FILE" ps || true
  fail "Containers não ficaram saudáveis a tempo."
}

configure_nginx() {
  step "6/7" "Configurar Nginx aaPanel (proxy → Docker)"
  bash "${DOCKER_DIR}/patch-nginx-docker.sh"

  if [ -f "${AAPANEL_DIR}/common.sh" ]; then
    # shellcheck source=deploy/aapanel/common.sh
    source "${AAPANEL_DIR}/common.sh"
    open_firewall_ports || true
  fi
}

run_checks() {
  step "7/7" "Testes finais"

  local base_url code body failed=0 public_ok=0

  echo ""
  if [ -f "$ENV_DOCKER" ] && [ -f "$COMPOSE_FILE" ]; then
    echo "Containers:"
    docker compose --env-file "$ENV_DOCKER" -f "$COMPOSE_FILE" ps
    echo ""
  fi

  echo "Local:"
  if curl -sf "http://127.0.0.1:${BACKEND_PORT}/api/health"; then
    echo -e "  ${GREEN}OK${NC}  backend :${BACKEND_PORT}/api/health"
  else
    echo -e "  ${RED}FALHA${NC} backend :${BACKEND_PORT}"
    failed=1
  fi

  if curl -sf -o /dev/null "http://127.0.0.1:${FRONTEND_PORT}/"; then
    echo -e "  ${GREEN}OK${NC}  frontend :${FRONTEND_PORT}/"
  else
    echo -e "  ${RED}FALHA${NC} frontend :${FRONTEND_PORT}"
    failed=1
  fi

  echo ""
  echo "Público (HTTPS se SSL já configurado no aaPanel):"
  for base_url in "https://${DOMAIN}" "http://${DOMAIN}"; do
    body="$(mktemp)"
    code="$(curl -skL --connect-timeout 15 -o "$body" -w "%{http_code}" "${base_url}/api/health" 2>/dev/null || echo "000")"
    if [ "$code" = "200" ] && grep -q '"status"' "$body" 2>/dev/null; then
      echo -e "  ${GREEN}OK${NC}  ${base_url}/api/health"
      echo "        $(tr -d '\n' < "$body" | head -c 120)"
      public_ok=1
      rm -f "$body"
      break
    fi
    rm -f "$body"
  done
  if [ "$public_ok" -eq 0 ]; then
    warn "API pública ainda não responde JSON — confira DNS, SSL e proxy Nginx."
  fi

  if [ "$failed" -ne 0 ]; then
    fail "Alguns testes locais falharam."
  fi
}

print_summary() {
  local admin_pass
  admin_pass="$(grep '^ADMIN_PASSWORD=' "$ENV_DOCKER" 2>/dev/null | cut -d= -f2- || echo '(veja .env.docker)')"

  echo ""
  echo "=============================================================================="
  echo -e "${GREEN}Deploy Docker concluído!${NC}"
  echo ""
  echo "  Loja:     https://${DOMAIN}/"
  echo "  API:      https://${DOMAIN}/api/health"
  echo "  Admin:    admin@sorelle.com.br"
  echo "  Senha:    ${admin_pass}"
  echo ""
  echo "  Docker:"
  echo "    Frontend → 127.0.0.1:${FRONTEND_PORT}"
  echo "    Backend  → 127.0.0.1:${BACKEND_PORT}"
  echo "    Banco      POSTGRES_PASSWORD=${POSTGRES_PASSWORD}"
  echo ""
  echo "Próximos passos:"
  echo "  1. aaPanel → Website → ${SITE_NAME} → SSL → Let's Encrypt"
  echo "  2. bash deploy-docker-vps.sh --update     # após git push"
  echo "  3. docker compose --env-file .env.docker -f deploy/docker/docker-compose.vps.yml logs -f"
  echo "=============================================================================="
}

case "$MODE" in
  install)
    sync_repository
    ensure_repo_layout
    fix_script_line_endings
    ensure_env_files
    ensure_docker
    run_compose "up"
    wait_for_services
    configure_nginx
    run_checks
    print_summary
    ;;
  update)
    sync_repository
    ensure_repo_layout
    fix_script_line_endings
    ensure_env_files
    ensure_docker
    run_compose "up"
    wait_for_services
    configure_nginx
    run_checks
    print_summary
    ;;
  nginx-only)
    if [ -f "${SELF_DIR}/deploy/docker/docker-compose.vps.yml" ]; then
      APP_DIR="${APP_DIR:-$SELF_DIR}"
      DOCKER_DIR="${APP_DIR}/deploy/docker"
      AAPANEL_DIR="${APP_DIR}/deploy/aapanel"
      ENV_DOCKER="${APP_DIR}/.env.docker"
      ENV_DEPLOY="${AAPANEL_DIR}/.env.deploy"
      COMPOSE_FILE="${DOCKER_DIR}/docker-compose.vps.yml"
    fi
    ensure_repo_layout
    fix_script_line_endings
    if [ ! -f "$ENV_DEPLOY" ]; then
      fail "Arquivo ${ENV_DEPLOY} não encontrado. Rode a instalação completa primeiro."
    fi
    # shellcheck disable=SC1090
    [ -f "$ENV_DEPLOY" ] && set -a && source "$ENV_DEPLOY" && set +a
    DOMAIN="${DOMAIN:-sorellepresentes.com.br}"
    configure_nginx
    run_checks
    ;;
esac
