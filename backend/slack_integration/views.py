from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny

from .tasks import handle_slack_message
from integrador_de_chats.settings import SLACK_READ_BOT_MESSAGES


# Serializer for response
class SlackWebhookResponseSerializer(serializers.Serializer):
    status = serializers.CharField()


class SlackWebhookView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        """
        Endpoint that slack webhook will call to send a message
        """
        try:
            data = request.data
            # handling URL verification challenge
            if data.get("type") == "url_verification":
                return Response({"challenge": data.get("challenge")})

            # handling actual message
            if data.get("type") == "event_callback":
                event = data.get("event", {})
                if is_bot_message(event) and not SLACK_READ_BOT_MESSAGES:
                    print("ignoring bot message...")
                    serializer = SlackWebhookResponseSerializer({"status": "ok"})
                    return Response(serializer.data, status=status.HTTP_200_OK)

                if event.get("type") == "message" and "subtype" not in event:
                    user = event.get("user")
                    text = event.get("text")
                    channel = event.get("channel")
                    handle_slack_message.delay(channel, text)
                    print(f"Message from {user} in {channel}: {text}")

            serializer = SlackWebhookResponseSerializer({"status": "ok"})
            return Response(serializer.data, status=status.HTTP_200_OK)

        except Exception as e:
            return Response(
                {"status": "error", "detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )


def is_bot_message(event):
    return "bot_id" in event
