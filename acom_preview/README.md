# Frontend - ACOM Preview

Aplicacao React para atendimento em formato de chat, consumindo os endpoints do `message_manager` no backend.

## Responsabilidades

- Listar sessoes de conversa em tempo real por polling
- Exibir historico de mensagens da sessao selecionada
- Enviar respostas para o backend
- Exibir estados de envio otimista e metricas basicas de latencia

## Stack Tecnica

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- Base UI
- Lucide React

## Estrutura Relevante

- `src/App.tsx`: layout principal da interface e interacoes
- `src/hooks/use-chat-data.ts`: polling, selecao de sessao e envio
- `src/lib/chat-api.ts`: contratos e chamadas HTTP

## Endpoints Consumidos

- `GET /manager/sessions/`
- `GET /manager/messages/`
- `POST /manager/messages/`

## Ambiente

Copie `.env.example` para `.env`.

```env
VITE_API_BASE_URL=http://SEU_IP_OU_DOMINIO:8000
```

## Execucao Local

```bash
cd acom_preview
npm install
npm run dev
```

Aplicacao: `http://localhost:5173`

## Execucao com Docker

```bash
cd acom_preview
docker compose up --build
```

## Scripts

- `npm run dev`: servidor de desenvolvimento
- `npm run build`: build de producao
- `npm run preview`: preview do build
- `npm run lint`: lint com ESLint
- `npm run typecheck`: checagem de tipos
- `npm run format`: formatacao com Prettier
