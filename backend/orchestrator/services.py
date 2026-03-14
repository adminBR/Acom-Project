import json
import time
import redis
from redis import Redis
from django.conf import settings
from typing import cast
from .models import CommonMessagesReference

REDIS_HOST = getattr(settings, "REDIS_HOST")
REDIS_PORT = getattr(settings, "REDIS_PORT")
SESSION_TIMEOUT_SECONDS = 1800  # 30 minutes

redis_pool = redis.ConnectionPool(
    host=REDIS_HOST, port=REDIS_PORT, db=1, decode_responses=True
)


# debug function
def fetch_redis_sessions():
    r = redis.Redis(connection_pool=redis_pool)
    session_list = []
    for key in r.scan_iter("session:*"):
        session_list.append(key)

    return session_list


# debug function
def fetch_redis_messages():
    r = redis.Redis(connection_pool=redis_pool)
    all_items = r.lrange("message_buffer_queue", 0, -1)
    parsed_items = [json.loads(item) for item in all_items]
    print(parsed_items)
    return parsed_items or []


# core handler that receive calls from the listeners
def message_handler(
    platform_user_id: str | None,
    channel_user_id: str,
    channel_name: str,
    message_text: str,
):
    r = redis.Redis(connection_pool=redis_pool)
    user_session_key = f"session:{channel_name}:{channel_user_id}"

    session_id = validate_session(r, user_session_key)

    print(f"Message from {channel_user_id} assigned to session_id: {session_id}")

    message_to_store = {
        "session_id": int(session_id),
        "text": message_text,
        "id_user": platform_user_id,
        "id_channel": channel_user_id,
        "channel_name": channel_name,
    }

    redis_queue_message(r, message_to_store)
    # save_message_to_db(message_to_store)
    # returning the processed data if the view needs it
    return message_to_store


# update expire or create a unique key that includes the source (mock, telegram, whatsapp...)
def validate_session(r: Redis, user_session_key: str) -> int:
    session_id = r.get(user_session_key)

    if session_id:
        print(f"Active session found for {user_session_key}: {session_id}")
        r.expire(user_session_key, SESSION_TIMEOUT_SECONDS)
    else:
        print(f"No active session for {user_session_key}. Creating a new one.")
        session_id = cast(int, r.incr("global:session_id_counter"))
        r.setex(user_session_key, SESSION_TIMEOUT_SECONDS, session_id)

    return cast(int, session_id)


def redis_queue_message(r: redis.Redis, message_data: dict):
    queue_key = "message_buffer_queue"

    message_json = json.dumps(message_data)
    r.lpush(queue_key, message_json)
    print(f"Queued message for session {message_data['session_id']}")


##todo... treat messages to store without spaces or special characters
def fetch_common_messages() -> dict:
    queryset = CommonMessagesReference.objects.values()
    lookup = {item["ds_message"]: item["ds_response"] for item in queryset}
    return lookup
