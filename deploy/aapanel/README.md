# Deploy no aaPanel (Ubuntu)

Guia para publicar a loja **Sorelle Presentes** em um VPS com [aaPanel](https://www.aapanel.com/).

## Instalação Docker (recomendada)

API + PostgreSQL em **Docker**; frontend estático servido pelo **Nginx do aaPanel**.

```
Internet → Nginx (aaPanel, :80)
              ├── /        → /www/wwwroot/191.252.205.7
              └── /api     → Docker sorelle-backend (:3001)
                              └── Docker sorelle-db (PostgreSQL)
```

**URL padrão:** [http://191.252.205.7/](http://191.252.205.7/) (HTTP — IP não usa SSL Let's Encrypt)

### Pré-requisitos (aaPanel → App Store)

- Nginx
- Node.js 20
- Docker + Docker Compose
- Git

Libere portas **80** e **443** em Security.

### Servidor novo (sem repositório clonado)

**Importante:** faça `git push` dos arquivos de deploy para o GitHub antes de usar o `curl`. O 404 ocorre quando `install-aapanel-ubuntu.sh` ainda não está na branch `main`.

**Opção A — git clone (recomendado):**

```bash
export POSTGRES_PASSWORD='Sorelle@1975'
git clone https://github.com/CesarBorgesDev/sorelle-presentes.git /www/server/sorelle-presentes
bash /www/server/sorelle-presentes/install-aapanel-ubuntu.sh
```

**Opção B — curl** (após push no GitHub):

```bash
export POSTGRES_PASSWORD='Sorelle@1975'
curl -fsSL https://raw.githubusercontent.com/CesarBorgesDev/sorelle-presentes/main/install-aapanel-ubuntu.sh | bash
```

Se os arquivos estiverem em outra branch:

```bash
export POSTGRES_PASSWORD='Sorelle@1975'
export GIT_BRANCH=nome-da-branch
curl -fsSL https://raw.githubusercontent.com/CesarBorgesDev/sorelle-presentes/main/install-aapanel-ubuntu.sh | bash
```

Repositório: [github.com/CesarBorgesDev/sorelle-presentes](https://github.com/CesarBorgesDev/sorelle-presentes.git)

### Servidor com repositório já clonado

```bash
cd /www/server/sorelle-presentes
export POSTGRES_PASSWORD='Sorelle@1975'
bash install-aapanel-ubuntu.sh
```

Ou configure manualmente:

```bash
sed -i 's/\r$//' deploy/aapanel/*.sh
cp deploy/aapanel/.env.deploy.example deploy/aapanel/.env.deploy
nano deploy/aapanel/.env.deploy
bash deploy/aapanel/install-docker.sh
```

Exemplo de `deploy/aapanel/.env.deploy`:

```bash
DOMAIN=191.252.205.7
POSTGRES_PASSWORD='Sorelle@1975'
APP_DIR=/www/server/sorelle-presentes
SITE_ROOT=/www/wwwroot/191.252.205.7
REPO_URL=https://github.com/CesarBorgesDev/sorelle-presentes.git
```

### Firewall e acesso externo

O instalador libera portas **80** e **443** automaticamente. Para forçar manualmente:

```bash
bash deploy/aapanel/open-firewall.sh
```

No **aaPanel**:
1. **Security → Firewall** → libere **80** e **443** (Status: Release)
2. **Website → Add site** → digite `191.252.205.7` como domínio (se ainda não existir)
3. No provedor VPS (Locaweb/etc.), libere 80/443 no firewall externo

Se aparecer *"Website not found"* ou *"website has been stopped"*, rode novamente:

```bash
cd /www/server/sorelle-presentes
git pull
bash deploy/aapanel/install-docker.sh
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
| **`install-aapanel-ubuntu.sh`** | **Instalador principal** (clone + Docker + frontend) |
| `install-docker.sh` | Etapas internas (Docker, build, Nginx) |
| `bootstrap-docker.sh` | Atalho para `install-aapanel-ubuntu.sh` |
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

**npm ERR_SOCKET_TIMEOUT / npmmirror** — O aaPanel pode usar mirror chinês lento. O projeto inclui `.npmrc` com `registry.npmjs.org`. No servidor:

```bash
cd /www/server/sorelle-presentes
npm config set registry https://registry.npmjs.org/ --global
rm -rf node_modules
npm ci --registry=https://registry.npmjs.org/
```

**CORS** — `CORS_ORIGIN` deve ser exatamente a URL HTTPS do site.

**Banco recusado** — Senha com `@` exige URL-encoding na `DATABASE_URL`. Use `install-docker.sh` para gerar.

**Página em branco** — Confira `SITE_ROOT` e vhost Nginx (`nginx-vhost.conf.template`).

**`$'\r': command not found`** — Rode `sed -i 's/\r$//' deploy/aapanel/*.sh`
