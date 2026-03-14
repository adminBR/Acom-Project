from celery import shared_task
from telegram import Bot
from integrador_de_chats.settings import SLACK_BOT_OAUTH_TOKEN
import requests


@shared_task
def handle_slack_message(channel_user_id, text):
    from orchestrator.services import message_handler

    message_handler(None, channel_user_id, "slack", text)


@shared_task
def send_slack_message(channel_user_id, text):
    import asyncio

    asyncio.run(send_message(channel=channel_user_id, text=text))


async def send_message(channel, text):
    url = "https://slack.com/api/chat.postMessage"
    headers = {"Authorization": f"Bearer {SLACK_BOT_OAUTH_TOKEN}"}
    payload = {"channel": channel, "text": text}
    requests.post(url, headers=headers, json=payload)
