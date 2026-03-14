# ACOM Project

Monorepo de um integrador de canais de mensagem, com backend de orquestracao e frontend de atendimento em formato de chat.

## Visao Geral

O projeto centraliza mensagens de diferentes integracoes (Telegram, Slack e mock), processa no backend e disponibiliza uma interface unica para atendimento no frontend.

## Tech Stack

### Backend

- Python 3.13
- Django + Django REST Framework
- Celery + Celery Beat
- Redis (cache/fila)
- PostgreSQL (persistencia)
- drf-spectacular (Swagger/Redoc)
- Docker Compose

### Frontend

- React 19 + TypeScript
- Vite
- Tailwind CSS 4
- Base UI + utilitarios (`clsx`, `tailwind-merge`, `lucide-react`)
- Docker Compose

## Arquitetura

1. Integracoes recebem webhooks e normalizam mensagens.
2. Orquestrador escreve eventos no Redis para manter alto throughput.
3. Worker (Celery) drena fila do Redis para PostgreSQL periodicamente.
4. Backend expoe endpoints de consulta e resposta para o painel.
5. Frontend consulta sessoes/mensagens e envia respostas por um unico fluxo (`/manager/messages/`).

Para detalhes de implementacao:

- Backend: `backend/README.md`
- Frontend: `acom_preview/README.md`

## Estrutura do Repositorio

- `backend/`: API, orquestrador, workers e integracoes
- `acom_preview/`: aplicacao frontend de chat

## Como Rodar

Use dois terminais.

### 1) Backend

```bash
cd backend
docker compose up --build
```

### 2) Frontend

```bash
cd acom_preview
docker compose up --build
```

## Endpoints Locais

- Frontend: `http://localhost:5173`
- API: `http://localhost:8000`
- Swagger: `http://localhost:8000/api/swagger/`
- Redoc: `http://localhost:8000/api/redoc/`

## Variaveis de Ambiente

- Backend: copie `backend/.env.example` para `backend/.env`
- Frontend: copie `acom_preview/.env.example` para `acom_preview/.env`

Minimo esperado:

- Backend: `PG_*`, `REDIS_*`, `CORS_ALLOWED_ORIGINS`
- Frontend: `VITE_API_BASE_URL`
