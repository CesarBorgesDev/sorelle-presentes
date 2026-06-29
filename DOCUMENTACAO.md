# Sorelle Presentes — Documentação do Projeto

E-commerce de presentes e itens para casa, decoração, fragrâncias e cama/mesa/banho. O projeto nasceu na plataforma [Base44](https://base44.com), mas os dados passaram a ser gerenciados por uma **API própria em Node.js** com **PostgreSQL**, mantendo a interface React original.

---

## Visão geral

| Camada        | Tecnologia                          | Porta padrão |
|---------------|-------------------------------------|--------------|
| Frontend      | React 18 + Vite + Tailwind CSS      | `5173` (dev) / `80` (Docker) |
| Backend       | Express.js + JWT                    | `3001`       |
| Banco de dados| PostgreSQL 15                       | `5432`       |

O frontend consome a API REST em `/api`. Em desenvolvimento, o Vite faz proxy das requisições para o backend. Em produção (Docker), o Nginx serve o build estático e encaminha `/api` para o container do backend.

---

## Arquitetura

```
┌─────────────────┐     /api      ┌─────────────────┐     SQL      ┌──────────────┐
│  React (Vite)   │ ────────────► │  Express API    │ ───────────► │  PostgreSQL  │
│  src/           │               │  server/src/    │              │              │
└─────────────────┘               └─────────────────┘              └──────────────┘
```

### Fluxo de autenticação

1. O usuário faz login ou registro em `/login` ou `/register`.
2. A API valida credenciais, gera um **JWT** e devolve `access_token`.
3. O token é salvo no `localStorage` (chave `sorelle_access_token`).
4. Todas as requisições autenticadas enviam `Authorization: Bearer <token>`.
5. O `AuthContext` (`src/lib/AuthContext.jsx`) verifica o token ao carregar a app via `GET /api/auth/me`.
6. Rotas administrativas exigem `role === 'admin'` (middleware `requireAdmin` no backend + componente `AdminRoute` no frontend).

### Camada de API no frontend

O arquivo `src/api/apiClient.js` implementa um cliente REST compatível com o padrão que o Base44 SDK usava. O `src/api/base44Client.js` apenas reexporta esse cliente — o nome `base44` foi mantido para não quebrar imports existentes no código.

---

## Funcionalidades

### Loja (público)

| Rota | Descrição |
|------|-----------|
| `/` | Página inicial com produtos por categoria |
| `/categoria/:slug` | Listagem por categoria (`casa`, `decoracao`, `fragancias`, `cama_mesa_banho`) |
| `/produto/:id` | Detalhe do produto |

### Autenticação

| Rota | Descrição |
|------|-----------|
| `/login` | Login com e-mail e senha |
| `/register` | Cadastro de novo usuário |
| `/forgot-password` | Solicitação de reset (simulado — não envia e-mail) |
| `/reset-password` | Redefinição de senha |

### Carrinho (usuário autenticado)

- Itens persistidos no banco (`cart_items`), vinculados ao `user_id`.
- Opções de embalagem: sem embalagem, Kraft Minimalista (R$ 12,90) ou Sorelle Signature (R$ 29,90).
- Componente principal: `src/components/CartDrawer.jsx`.

### Painel administrativo (apenas `admin`)

| Rota | Descrição |
|------|-----------|
| `/admin` | Dashboard com estatísticas e pedidos recentes |
| `/admin/produtos` | CRUD de produtos |
| `/admin/pedidos` | Gestão de pedidos e status |
| `/admin/afiliados` | Gestão de afiliados e conversões |

---

## Estrutura de pastas

```
sorelle-presentes/
├── src/                    # Frontend React
│   ├── api/                # Cliente HTTP (apiClient.js, base44Client.js)
│   ├── components/         # Componentes reutilizáveis e UI (shadcn/Radix)
│   ├── lib/                # AuthContext, query-client, utilitários
│   └── pages/              # Páginas da loja e admin
├── server/                 # Backend Express
│   └── src/
│       ├── config/         # Conexão PostgreSQL
│       ├── db/             # schema.sql, migrate.js, seed.js
│       ├── middleware/     # JWT (auth.js)
│       └── routes/         # Rotas da API
├── base44/                 # Metadados legados da plataforma Base44
├── docker-compose.yml      # Orquestração (db + backend + frontend)
├── nginx.conf              # Proxy /api em produção
├── deploy.sh               # Deploy via rsync para VPS
└── setup-docker.sh         # Instalação do Docker em Ubuntu
```

---

## Banco de dados

O schema está em `server/src/db/schema.sql`. Tabelas principais:

| Tabela | Função |
|--------|--------|
| `users` | Usuários (`admin` ou `user`) |
| `products` | Catálogo de produtos |
| `orders` | Pedidos com itens em JSONB |
| `cart_items` | Carrinho por usuário |
| `affiliates` | Programa de afiliados |
| `affiliate_conversions` | Conversões/comissões de afiliados |

### Categorias de produto

- `casa`
- `decoracao`
- `fragancias`
- `cama_mesa_banho`

### Status de pedido

`pendente` → `confirmado` → `em_preparo` → `enviado` → `entregue` (ou `cancelado`)

---

## API REST

Base: `http://localhost:3001/api` (dev) ou `/api` (produção via proxy).

| Prefixo | Autenticação | Descrição |
|---------|--------------|-----------|
| `GET /health` | Pública | Health check |
| `/auth/*` | Variável | Login, registro, perfil |
| `/products` | Leitura pública; escrita admin | Produtos |
| `/orders` | Admin | Pedidos |
| `/affiliates` | Admin | Afiliados |
| `/affiliate-conversions` | Admin | Conversões |
| `/cart-items` | Usuário logado | Carrinho |

---

## Pré-requisitos

### Desenvolvimento local

- **Node.js** 18+ (recomendado 20)
- **npm**
- **PostgreSQL** 15+ (local ou via Docker apenas do banco)

### Produção (Docker)

- **Docker** e **Docker Compose**

---

## Passo a passo — desenvolvimento local

### 1. Clonar e instalar dependências

```bash
git clone <url-do-repositorio>
cd sorelle-presentes

npm install
cd server && npm install && cd ..
```

### 2. Subir o PostgreSQL

**Opção A — apenas o banco via Docker:**

```bash
docker compose up -d db
```

Isso sobe o Postgres na porta `5432` com:

- Usuário: `postgres`
- Senha: `postgres`
- Banco: `sorelle`

**Opção B — PostgreSQL instalado localmente:**

Crie um banco chamado `sorelle` e anote a connection string.

### 3. Configurar variáveis de ambiente do backend

Crie o arquivo `server/.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sorelle
JWT_SECRET=sua-chave-secreta-aqui
JWT_EXPIRES_IN=7d
PORT=3001
CORS_ORIGIN=http://localhost:5173
ADMIN_EMAIL=admin@sorelle.com.br
ADMIN_PASSWORD=admin123
```

> Em produção, altere `JWT_SECRET` e `ADMIN_PASSWORD` para valores seguros.

### 4. Migrar e popular o banco

Na raiz do projeto:

```bash
npm run db:migrate
npm run db:seed
```

O seed cria:

- Usuário admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD`)
- 4 produtos de exemplo

### 5. Iniciar frontend e backend

**Tudo de uma vez:**

```bash
npm run dev:all
```

**Ou em terminais separados:**

```bash
# Terminal 1 — API
npm run dev:server

# Terminal 2 — Frontend
npm run dev
```

### 6. Acessar a aplicação

| URL | Descrição |
|-----|-----------|
| http://localhost:5173 | Loja |
| http://localhost:5173/admin | Painel admin |
| http://localhost:3001/api/health | Health check da API |

**Login admin padrão (após seed):**

- E-mail: `admin@sorelle.com.br`
- Senha: `admin123`

---

## Passo a passo — Docker (stack completa)

Ideal para testar o ambiente de produção localmente ou fazer deploy.

### 1. Instalar Docker (Ubuntu/VPS)

```bash
chmod +x setup-docker.sh
./setup-docker.sh
```






### 2. Subir todos os serviços

Na raiz do projeto:

```bash
docker compose up -d --build
```

O `docker-compose.yml` sobe:

1. **db** — PostgreSQL 15
2. **backend** — executa migrate + seed + inicia a API na porta `3001`
3. **frontend** — build React servido pelo Nginx na porta `80`

### 3. Acessar

- Loja e admin: http://localhost
- API: http://localhost/api/health

### Comandos úteis

```bash
docker compose logs -f          # Ver logs
docker compose down             # Parar containers
docker compose down -v          # Parar e apagar volume do banco
```

---

## Deploy em VPS

O script `deploy.sh` automatiza:

1. Conexão SSH com a VPS
2. Sincronização dos arquivos via `rsync` (exclui `node_modules`, `.git`, etc.)
3. Criação de `server/.env` a partir de `.env.example` (se existir)
4. `docker compose up -d --build`

Antes de executar, edite as variáveis no topo de `deploy.sh`:

```bash
VPS_IP="seu-ip"
VPS_USER="root"
TARGET_DIR="/var/www/sorelle"
```

```bash
chmod +x deploy.sh
./deploy.sh
```

---

## Scripts npm disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Frontend Vite (porta 5173) |
| `npm run dev:server` | Backend com hot-reload (`--watch`) |
| `npm run dev:all` | Frontend + backend simultaneamente |
| `npm run db:migrate` | Aplica `schema.sql` no banco |
| `npm run db:seed` | Cria admin e produtos de exemplo |
| `npm run build` | Build de produção do frontend |
| `npm run preview` | Preview do build local |
| `npm run lint` | ESLint |

---

## Variáveis de ambiente

### Backend (`server/.env`)

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim | Connection string PostgreSQL |
| `JWT_SECRET` | Sim | Chave para assinar tokens JWT |
| `JWT_EXPIRES_IN` | Não | Expiração do token (padrão: `7d`) |
| `PORT` | Não | Porta da API (padrão: `3001`) |
| `CORS_ORIGIN` | Não | Origem permitida (padrão: `http://localhost:5173`) |
| `ADMIN_EMAIL` | Não | E-mail do admin no seed |
| `ADMIN_PASSWORD` | Não | Senha do admin no seed |

### Frontend (opcional)

| Variável | Descrição |
|----------|-----------|
| `VITE_API_URL` | URL base da API (padrão: `/api` — usa proxy do Vite ou Nginx) |

> As variáveis `VITE_BASE44_*` do README original são legado da plataforma Base44 e **não são necessárias** para rodar com a API PostgreSQL local.

---

## Observações importantes

1. **Base44 vs API local:** O projeto ainda usa o plugin `@base44/vite-plugin` no Vite para compatibilidade com o builder Base44, mas os dados vêm da API Express + PostgreSQL.
2. **Reset de senha:** O endpoint `/auth/reset-password-request` apenas registra no log — não envia e-mail de verdade.
3. **Login social:** Google OAuth não está implementado; o cliente retorna erro se tentado.
4. **Segurança em produção:** Troque `JWT_SECRET`, senha do admin e credenciais do Postgres antes de expor publicamente.

---

## Resolução de problemas

| Problema | Possível causa | Solução |
|----------|----------------|---------|
| `ECONNREFUSED` na API | Backend não está rodando | Execute `npm run dev:server` |
| Erro de conexão com o banco | Postgres parado ou `DATABASE_URL` incorreta | Verifique o container `sorelle-db` ou o serviço local |
| 401 em rotas admin | Token expirado ou usuário sem role `admin` | Faça login com o admin do seed |
| CORS bloqueado | `CORS_ORIGIN` diferente da URL do frontend | Ajuste para `http://localhost:5173` em dev |
| Porta 5432 em uso | Outro Postgres na máquina | Pare o serviço conflitante ou altere a porta no `docker-compose.yml` |

---

## Licença e suporte

Projeto privado da loja Sorelle Presentes. Para dúvidas sobre a integração original com Base44, consulte a [documentação oficial](https://docs.base44.com/Integrations/Using-GitHub).
