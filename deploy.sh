#!/bin/bash
# ==============================================================================
# Script de Deploy e Sincronização Local para VPS Ubuntu
# Sorelle Presentes
# ==============================================================================

set -e

# Configurações de Acesso
VPS_IP="191.252.205.7"
VPS_USER="root"               # Altere para o usuário correto (ex: ubuntu, root) se necessário
TARGET_DIR="/home/deploy/sorelle-presentes"  # Diretório de destino na VPS
SSH_KEY=""                    # Caminho para sua chave SSH se não for o padrão (ex: -i ~/.ssh/minha_chave)

# Configuração da linha de comando SSH
SSH_CMD="ssh ${SSH_KEY} ${VPS_USER}@${VPS_IP}"

echo "=== [1/4] Validando conexão com a VPS (${VPS_IP}) ==="
if ! ${SSH_CMD} "echo 'Conexão SSH bem-sucedida!'" ; then
    echo "ERRO: Não foi possível conectar na VPS via SSH."
    echo "Certifique-se de que sua chave SSH está configurada ou passe os argumentos adequados."
    exit 1
fi

echo "=== [2/4] Sincronizando arquivos para a VPS == style=info ==="
# Cria o diretório remoto caso não exista
${SSH_CMD} "mkdir -p ${TARGET_DIR}"

# Sincroniza os arquivos locais com a VPS usando rsync
rsync -avz -e "ssh ${SSH_KEY}" --delete \
    --exclude="node_modules" \
    --exclude="server/node_modules" \
    --exclude=".git" \
    --exclude="dist" \
    --exclude=".env" \
    --exclude="server/.env" \
    --exclude="*.log" \
    ./ "${VPS_USER}@${VPS_IP}:${TARGET_DIR}/"

echo "=== [3/4] Inicializando arquivos de configuração (.env) na VPS ==="
# Cria os arquivos .env base na VPS se eles ainda não existirem
${SSH_CMD} "
    if [ ! -f ${TARGET_DIR}/server/.env ]; then
        echo 'Criando server/.env inicial a partir do exemplo...'
        cp ${TARGET_DIR}/server/.env.example ${TARGET_DIR}/server/.env
        echo 'AVISO: Modifique as credenciais no arquivo ${TARGET_DIR}/server/.env na VPS.'
    fi
"

echo "=== [4/4] Executando build e subindo os containers na VPS ==="
${SSH_CMD} "cd ${TARGET_DIR} && docker compose up -d --build"

echo "=============================================================================="
echo " Deploy concluído com sucesso!"
echo " A aplicação Sorelle está rodando na VPS no endereço: http://${VPS_IP}"
echo "=============================================================================="
