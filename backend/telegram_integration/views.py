import json
from rest_framework import serializers, status
from django.views.decorators.csrf import csrf_exempt
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from telegram import Update, Bot
from telegram.ext import Application, ContextTypes
from asgiref.sync import async_to_sync
from .tasks import handle_telegram_message
from integrador_de_chats.settings import TELEGRAM_TOKEN

bot = Bot(token=TELEGRAM_TOKEN)


# Serializer for response
class TelegramWebhookResponseSerializer(serializers.Serializer):
    status = serializers.CharField()


class TelegramWebhookView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        """
        Endpoint that telegram webhook will call to send a message
        """
        try:
            # Telegram sends raw JSON, we can parse it directly
            update_data = request.data  # DRF automatically parses JSON
            update = Update.de_json(update_data, bot)

            if update.message and update.message.text:
                text = update.message.text
                chat_id = update.message.chat.id

                print("Got message:", text)

                # Use Celery task asynchronously
                handle_telegram_message.delay(chat_id, text)

            serializer = TelegramWebhookResponseSerializer({"status": "ok"})
            return Response(serializer.data, status=status.HTTP_200_OK)

        except Exception as e:
            return Response(
                {"status": "error", "detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
