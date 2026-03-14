# ACOM Example Chat Frontend

Interface em formato de chat para o backend orquestrador. A aplicação exibe sessões na barra lateral e permite responder mensagens em um único ponto, com roteamento para a integração correta.

## Funcionalidades principais

- Campo superior para id do usuário da plataforma
- Barra lateral com chats abertos (canal + id do usuário no canal + sessão)
- Painel de conversa com bolhas no estilo mensageria
- Identificação colaborativa de remetente: `ds_id_platform_user` não nulo representa mensagem da plataforma
- Atualização periódica por polling

## Endpoints utilizados

- GET /manager/sessions/
- GET /manager/messages/
- POST /manager/messages/

## Ambiente

Defina a URL base da API no arquivo `.env` do frontend:

```env
VITE_API_BASE_URL=http://SEU_IP_OU_DOMINIO:8000
```

Arquivo de exemplo:

- `.env.example`

## Execução local

```bash
npm install
npm run dev
```

## Execução com Docker Compose

Dentro da pasta `acom_preview`:

```bash
docker compose up --build
```
