from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, serializers
from orchestrator.services import message_handler


class MockListenerRequestSerializer(serializers.Serializer):
    unique_id = serializers.CharField()
    message = serializers.CharField()


class mock_listener(APIView):
    serializer_class = MockListenerRequestSerializer

    def post(self, request, *args, **kwargs):
        """
        Sends a manually written message to the message handler as the channel 'mock'
        """
        channel_user_id = request.data.get("unique_id")
        message = request.data.get("message")
        channel_name = "mock"
        if not channel_user_id or not message:
            return Response(
                {"error": "Both 'unique_id' and 'message' are required."},
                status.HTTP_400_BAD_REQUEST,
            )

        response_temp = message_handler(None, channel_user_id, channel_name, message)

        return Response(
            {"response": response_temp},
            status.HTTP_202_ACCEPTED,
        )
