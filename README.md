# ACOM Project Monorepo

Este repositório utiliza uma stack única com frontend e backend integrados.

## Estrutura

- `acom_preview/` -> frontend React + Vite
- `backend/` -> backend Django + Celery + Redis + PostgreSQL
- `backend/compose.yml` -> Docker Compose do backend
- `acom_preview/compose.yml` -> Docker Compose do frontend

## Executar backend

Dentro da pasta `backend`:

```bash
cd backend
docker compose up --build
```

## Executar frontend

Dentro da pasta `acom_preview`:

```bash
cd acom_preview
docker compose up --build
```

## Executar ambos em paralelo

Use dois terminais, um para backend e outro para frontend.

Serviços:

- Frontend: http://localhost:5173
- API Backend: http://localhost:8000
- Swagger: http://localhost:8000/api/swagger/
- Redoc: http://localhost:8000/api/redoc/

## Ambiente

O arquivo de ambiente do backend é carregado de `backend/.env`.
O arquivo de ambiente do frontend é carregado de `acom_preview/.env`.

Defina pelo menos:

- `PG_NAME`
- `PG_USER`
- `PG_PASSWORD`
- `PG_HOST=db`
- `PG_PORT=5432`
- `REDIS_HOST=redis`
- `REDIS_PORT=6379`
- `CORS_ALLOWED_ORIGINS=http://localhost:5173`
- `VITE_API_BASE_URL=http://SEU_IP_OU_DOMINIO:8000`

## Observações

- O frontend é servido em produção a partir do build estático.
- O endpoint da API no frontend é definido por `VITE_API_BASE_URL` em `acom_preview/.env`.
