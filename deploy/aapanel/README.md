# Deploy no aaPanel (Ubuntu)

Guia para publicar a loja **Sorelle Presentes** em um VPS com [aaPanel](https://www.aapanel.com/).

## Instalação Docker (recomendada)

API + PostgreSQL em **Docker**; frontend estático servido pelo **Nginx do aaPanel**.

```
Internet → Nginx (aaPanel, :443)
              ├── /        → /www/wwwroot/sorellepresentes.com.br
              └── /api     → Docker sorelle-backend (:3001)
                              └── Docker sorelle-db (PostgreSQL)
```

### Pré-requisitos (aaPanel → App Store)

- Nginx
- Node.js 20
- Docker + Docker Compose
- Git

Libere portas **80** e **443** em Security.

### Comando único no servidor

```bash
cd /www/server
git clone https://github.com/SEU_USUARIO/sorelle-presentes.git
cd sorelle-presentes

sed -i 's/\r$//' deploy/aapanel/*.sh

cp deploy/aapanel/.env.deploy.example deploy/aapanel/.env.deploy
nano deploy/aapanel/.env.deploy   # DOMAIN, POSTGRES_PASSWORD, etc.

bash deploy/aapanel/install-docker.sh
```

Exemplo de `deploy/aapanel/.env.deploy`:

```bash
DOMAIN=sorellepresentes.com.br
POSTGRES_PASSWORD='Sorelle@1975'
APP_DIR=/www/server/sorelle-presentes
SITE_ROOT=/www/wwwroot/sorellepresentes.com.br
```

> **Senha com `@`:** o script codifica automaticamente na `DATABASE_URL` (`%40`). Não monte a URL manualmente.

O script `install-docker.sh`:

1. Gera `server/.env` (se não existir)
2. Sobe `sorelle-db` + `sorelle-backend` via Docker
3. Faz build do frontend (`npm run build`)
4. Publica `dist/` em `/www/wwwroot/SEU_DOMINIO/`
5. Cria vhost Nginx em `/www/server/panel/vhost/nginx/SEU_DOMINIO.conf`
6. Recarrega Nginx

### SSL (manual — 1 passo no painel)

Após o DNS apontar para o VPS:

1. **Website → sorellepresentes.com.br → SSL**
2. **Let's Encrypt** → Apply → Force HTTPS

Confirme em `server/.env`:

```
CORS_ORIGIN=https://sorellepresentes.com.br
FRONTEND_URL=https://sorellepresentes.com.br
APP_PUBLIC_URL=https://sorellepresentes.com.br
```

Reinicie a API:

```bash
docker compose -f deploy/aapanel/docker-compose.backend.yml restart backend
```

### Atualizações

```bash
bash deploy/aapanel/update-docker.sh
```

### Testes

```bash
curl -s http://127.0.0.1:3001/api/health
curl -I http://sorellepresentes.com.br/
curl -s http://sorellepresentes.com.br/api/health
docker ps
```

---

## Instalação alternativa (PM2 + PostgreSQL nativo)

Use [`install.sh`](install.sh) se preferir API com PM2 e PostgreSQL instalado pelo aaPanel (sem Docker).

```bash
export DOMAIN="loja.seudominio.com.br"
export DB_PASS="SUA_SENHA_FORTE"
bash deploy/aapanel/install.sh
```

Requer: Nginx, Node.js 20, PM2 Manager, PostgreSQL 15.

Atualizações: `bash deploy/aapanel/update.sh`

---

## Arquivos de deploy

| Arquivo | Função |
|---------|--------|
| `install-docker.sh` | Instalação completa Docker + frontend |
| `update-docker.sh` | Atualização pós-`git pull` |
| `.env.deploy.example` | Variáveis de deploy (copiar para `.env.deploy`) |
| `docker-compose.backend.yml` | PostgreSQL + API |
| `nginx-vhost.conf.template` | Vhost Nginx gerado automaticamente |
| `env.production.example` | Modelo do `server/.env` |
| `install.sh` | Instalação PM2 (alternativa) |

---

## Variáveis importantes (`server/.env`)

| Variável | Uso |
|----------|-----|
| `DATABASE_URL` | Conexão PostgreSQL (host `db` no Docker) |
| `JWT_SECRET` | Chave longa e aleatória |
| `ADMIN_PASSWORD` | Senha do admin inicial |
| `CHECKOUT_PAYMENT_METHOD` | `pix`, `cartao_credito`, `test` |
| `CIELO_*` | Pagamentos Cielo |
| `CORREIOS_*` | Cálculo de frete |
| `PIX_KEY` | PIX manual |

---

## Checklist pós-deploy

- [ ] `https://seudominio/` abre a loja
- [ ] `https://seudominio/api/health` retorna OK
- [ ] Login admin funciona
- [ ] Upload de imagem funciona (limite 15 MB no Nginx)
- [ ] `docker ps` mostra `sorelle-db` e `sorelle-backend` online

---

## Problemas comuns

**502 em /api** — API parada. Verifique `docker logs sorelle-backend`.

**CORS** — `CORS_ORIGIN` deve ser exatamente a URL HTTPS do site.

**Banco recusado** — Senha com `@` exige URL-encoding na `DATABASE_URL`. Use `install-docker.sh` para gerar.

**Página em branco** — Confira `SITE_ROOT` e vhost Nginx (`nginx-vhost.conf.template`).

**`$'\r': command not found`** — Rode `sed -i 's/\r$//' deploy/aapanel/*.sh`
