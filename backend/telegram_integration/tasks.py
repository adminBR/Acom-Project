# tasks.py
from celery import shared_task
from telegram import Bot
from integrador_de_chats.settings import TELEGRAM_TOKEN


@shared_task
def handle_telegram_message(channel_user_id, text):
    from orchestrator.services import message_handler

    message_handler(None, channel_user_id, "telegram", text)


@shared_task
def send_telegram_message(channel_user_id, text):
    bot = Bot(token=TELEGRAM_TOKEN)
    import asyncio

    asyncio.run(bot.send_message(chat_id=channel_user_id, text=text))
