from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.http import JsonResponse
from .tasks import process_message_batch
from .services import fetch_redis_messages, fetch_redis_sessions

# orchestrator normally shouldnt have any interaction with the api by itself, everything here is for debugging purposes


@api_view(["GET"])
def manually_pop_redis_to_pg(request):
    """
    (debug only) Trigger processing of messages from Redis to Postgres
    """
    process_message_batch()
    return Response({"response": "ok"}, status=status.HTTP_200_OK)


@api_view(["GET"])
def fetch_redis_stored_messages(request):
    """
    (debug only) Fetch all messages currently stored in Redis
    """
    temp = fetch_redis_messages()  # should return a list of dicts
    return Response({"response": temp}, status=status.HTTP_200_OK)


@api_view(["GET"])
def fetch_redis_active_sessions(request):
    """
    (debug only) Fetch all active sessions currently in Redis
    """
    temp = fetch_redis_sessions()  # should return a list of dicts
    return Response({"response": temp}, status=status.HTTP_200_OK)
