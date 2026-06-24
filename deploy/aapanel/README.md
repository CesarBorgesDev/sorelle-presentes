# Deploy no aaPanel (Ubuntu)

Guia para publicar a loja **Sorelle Presentes** em um VPS com [aaPanel](https://www.aapanel.com/).

## Arquitetura recomendada

```
Internet → Nginx (aaPanel, :443)
              ├── /        → dist/ (React build)
              └── /api     → Node.js API (:3001, PM2)
                              └── PostgreSQL (:5432)
```

O aaPanel já usa a porta **80/443**. Por isso **não** suba o container `frontend` do Docker na mesma máquina — use o Nginx do painel.

---

## 1. Preparar o aaPanel

1. Instale o aaPanel no Ubuntu (script oficial do site).
2. Em **App Store**, instale:
   - **Nginx**
   - **Node.js 20** (ou superior)
   - **PM2 Manager**
   - **PostgreSQL 15**
   - **Git** (opcional)

3. Em **Security**, libere portas **80** e **443**.

---

## 2. Criar o site

1. **Website → Add site**
2. Domínio: `loja.seudominio.com.br`
3. Root: `/www/wwwroot/loja.seudominio.com.br` (padrão)
4. PHP: desabilitado (site estático + proxy)

Aponte o DNS do domínio para o IP do VPS.

---

## 3. PostgreSQL

### Opção A — pelo script (recomendado)

O `install.sh` cria usuário e banco automaticamente.

### Opção B — pelo aaPanel

1. **Databases → PostgreSQL → Add database**
2. Nome: `sorelle`, usuário: `sorelle`, senha forte
3. Anote a connection string para `server/.env`

---

## 4. Instalar a aplicação

Conecte via SSH ao servidor:

```bash
cd /www/server
git clone https://github.com/SEU_USUARIO/sorelle-presentes.git
cd sorelle-presentes

export DOMAIN="loja.seudominio.com.br"
export REPO_URL=""   # já clonou, pode deixar vazio
export APP_DIR="/www/server/sorelle-presentes"
export DB_USER="sorelle"
export DB_PASS="SUA_SENHA_FORTE"

chmod +x deploy/aapanel/install.sh

# Se veio do Windows e der erro "$'\r': command not found":
sed -i 's/\r$//' deploy/aapanel/*.sh

bash deploy/aapanel/install.sh
```

O script:

- instala dependências e faz build do frontend;
- configura `server/.env` (se não existir);
- roda migrate + seed;
- inicia a API com PM2;
- copia `dist/` para `/www/wwwroot/SEU_DOMINIO/`.

---

## 5. Configurar Nginx no aaPanel

1. **Website → seu domínio → Config**
2. Dentro do bloco `server { ... }`, use o modelo em `nginx-site.conf.example`
3. Ajuste o `root` se o projeto estiver em outro caminho
4. Salve e recarregue o Nginx

Teste localmente no servidor:

```bash
curl http://127.0.0.1:3001/api/health
# {"status":"ok","message":"Sorelle API funcionando"}
```

---

## 6. HTTPS (SSL)

1. **Website → seu domínio → SSL**
2. **Let's Encrypt** → Apply
3. Ative **Force HTTPS**

Atualize em `server/.env`:

```
CORS_ORIGIN=https://loja.seudominio.com.br
FRONTEND_URL=https://loja.seudominio.com.br
APP_PUBLIC_URL=https://loja.seudominio.com.br
```

Reinicie a API: `pm2 restart sorelle-api`

---

## 7. Variáveis importantes

Edite `server/.env` (modelo: `env.production.example`):

| Variável | Uso |
|----------|-----|
| `JWT_SECRET` | Chave longa e aleatória |
| `ADMIN_PASSWORD` | Senha do admin inicial |
| `CHECKOUT_PAYMENT_METHOD` | `pix`, `cartao_credito`, `test` |
| `CIELO_*` | Pagamentos Cielo |
| `CORREIOS_*` | Cálculo de frete |
| `PIX_KEY` | PIX manual |

Reinicie após alterar: `pm2 restart sorelle-api`

---

## 8. Atualizações

```bash
export DOMAIN="loja.seudominio.com.br"
bash deploy/aapanel/update.sh
```

---

## Alternativa: Docker só para API + banco

Se preferir PostgreSQL e API em containers:

```bash
# Build do frontend no host (aaPanel Nginx serve dist/)
npm ci && npm run build
rsync -a dist/ /www/wwwroot/loja.seudominio.com.br/

cp deploy/aapanel/env.production.example server/.env
# edite server/.env

export POSTGRES_PASSWORD=senha_forte
docker compose -f deploy/aapanel/docker-compose.backend.yml up -d --build
```

Configure o Nginx igual ao passo 5 (`proxy_pass` → `127.0.0.1:3001`).

---

## Checklist pós-deploy

- [ ] `https://seudominio/` abre a loja
- [ ] `https://seudominio/api/health` retorna OK
- [ ] Login admin funciona
- [ ] Upload de imagem de produto funciona (limite 15 MB no Nginx)
- [ ] PM2: `pm2 status` mostra `sorelle-api` online
- [ ] `pm2 startup` configurado para reiniciar após reboot

---

## Problemas comuns

**502 em /api** — API parada ou porta errada. Verifique `pm2 logs sorelle-api`.

**CORS** — `CORS_ORIGIN` deve ser exatamente a URL HTTPS do site.

**Banco recusado** — Confira `DATABASE_URL` e se o PostgreSQL está rodando.

**Página em branco** — Confira `root` do Nginx apontando para `dist/` e `try_files` com fallback para `index.html`.
