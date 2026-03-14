# Integrador de canais

Sistema robusto e escalável projetado para integrar a maioria das plataformas de mensagens modernas (Telegram, WhatsApp, etc.) através de webhooks, orquestrando as mensagens para um cache Redis de alta performance e, de forma assíncrona, persistindo os dados em um banco PostgreSQL.

## 🏛️ Arquitetura

O projeto segue uma metodologia modular e orientada a serviços (service-oriented).

### Integrações

- Cada integração possui um app dentro da API, que é serializado para um formato padrão de `"id único"`, `"nome do canal"` e `"mensagem em texto"`.
- Todas as integrações chamam o `message_handler` do orquestrador. A ideia é que a única interação que as integrações tenham seja com o Redis, para manter a melhor performance.

### Orquestrador

- Recebe todas as mensagens e as insere dentro de uma lista no Redis. A ideia é não ser limitado pela velocidade de requisição dos bancos.
- O `message_handler` também verifica a sessão do usuário. Cada sessão é criada a partir da primeira mensagem enviada ou recebida de um usuário, dura 30 minutos e gera um ID no banco PostgreSQL. Isso permite separar as mensagens por sessões e manter a organização.

### Worker

- O Celery Beat, a cada 5 segundos, chama uma task que sincroniza as mensagens do Redis para o PostgreSQL e limpa a fila do Redis, garantindo a persistência das mensagens.
- Essa sincronização também verifica se mensagens comuns foram enviadas e, automaticamente, chama o `message_handler` novamente, postando a resposta gravada no banco.
- Uma vez por dia, o Celery Beat chama outra task para limpar mensagens com mais de 30 dias.

### Gerenciador de mensagens

- Local onde ocorre a interação com os dados, com um CRUD para gerenciar mensagens e respostas.
- Permite que um atendente envie respostas especificando o canal, o usuário e a mensagem, e obtenha, de forma paginada, todas as respostas.
- A postagem de mensagens pelos atendentes é considerada uma integração também, o que cria um pequeno delay nas respostas, mas mantém o sistema simples e padronizado.

## 🖼️ Fluxo

![Alt text](git_images/flow.png)

## 🛠️ Tecnologias

    Backend: Django, Django Rest Framework

    Task Queue: Celery, Celery-Beats

    Message Broker & Cache: Redis

    Database: PostgreSQL

    Authentication: djangorestframework-simplejwt (TODO)

    Dependency Management: Poetry

    Containerization: Docker compose

## 🚀 Execução

**Pré-requisitos**

Docker e Docker Compose
Slack app: para integração com slack
Telegram bot: para integração com telegram

1. Clone o repositório:

   git clone https://github.com/seu-usuario/Acom-Project
   cd Acom-Project

2. Execute o Compose dentro da pasta `backend`:

   docker compose up --build

3. permita o acesso externo para fazer as integrações, ou teste com o mock endpoint

**Configuração do Slack**

Acesso via: https://api.slack.com/apps

1. Crie um app no slack

2. ative event subscriptions

3. ative os eventos:

   message.channels - Para interação em canais
   message.im - Para interação com mensagens diretas

4. Ative as permissões

   Canais:
   channels:history
   channels:write
   Mensagens diretas:
   im:history
   im:write

5. Para permitir mensagens diretas ative a opção na aba 'app home'

**Configuração do Telegram**

1. Registre um bot com o BotFather
2. rode o script para definir o endpoint do webhook

   import requests
   TOKEN = "your_telegram_bot_token"
   WEBHOOK_URL = f"https://your_application_ip:port/integrations/telegram/webhook/"
   r = requests.get(f"https://api.telegram.org/bot{TOKEN}/setWebhook?url={WEBHOOK_URL}")
   print(r.json())

Verifique se todas as instâncias foram criadas e estão funcionando: Redis, PostgreSQL, Celery, Celery Beat e Django.

## ⚙️ API Endpoints e Documentação

A API utiliza Swagger com Redoc para documentar os endpoints separados por apps.

    http://localhost:8000/api/schema/
    http://localhost:8000/api/swagger/
    http://localhost:8000/api/redoc/

Para testes, existe uma integração de POST para simular mensagens.
Exemplo via `curl`:

    curl -X POST -H "Content-Type: application/json" \
    -d '{"unique_id": "mock_user_123", "message": "Hello World!"}' \
    http://127.0.0.1:8000/api/mock/webhook/

### Endpoints para frontend de chat

- GET `/manager/sessions/`:
  lista sessões agrupadas por sessão/canal/usuário com última mensagem para preencher a sidebar.
- GET `/manager/messages/`:
  suporta filtros `client_id`, `session_id`, `channel_name`, `platform_user_id`.
- POST `/manager/messages/`:
  aceita payload antigo (`platform_user_id`, `channel_user_id`, `message`, `channel_name`) e payload alias (`ds_id_platform_user`, `ds_id_channel_user`, `ds_text`, `ds_channel_name`).

### CORS para frontend local

Defina no `.env`:

    CORS_ALLOWED_ORIGINS=http://localhost:5173

Pode incluir múltiplas origens separadas por vírgula.

🧪 Unit Tests

Para rodar os unit tests, utilize:

    poetry run python manage.py test
