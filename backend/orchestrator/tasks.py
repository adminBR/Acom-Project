import json
from datetime import datetime
from celery import shared_task
from .models import OrchestratorMessages
import redis
from django.utils import timezone
from datetime import timedelta

from django.conf import settings
from telegram_integration.tasks import send_telegram_message
from slack_integration.tasks import send_slack_message
from .services import fetch_common_messages, message_handler
from message_manager.services import normalize_message_test

REDIS_HOST = getattr(settings, "REDIS_HOST")
REDIS_PORT = getattr(settings, "REDIS_PORT")

redis_pool = redis.ConnectionPool(
    host=REDIS_HOST, port=REDIS_PORT, db=1, decode_responses=True
)
r = redis.Redis(connection_pool=redis_pool)


# debug function
# task to save a single message to postgres with celery caching
def save_message_to_db(message_data: dict):
    print("start.... ", message_data)
    try:
        OrchestratorMessages.objects.create(
            cd_session=int(message_data.get("session_id")),
            ds_text=message_data.get("text"),
            ds_id_platform_user=message_data.get("id_user"),
            ds_id_channel_user=message_data.get("id_channel"),
            ds_channel_name=message_data.get("channel_name"),
        )
        print(f"Successfully saved message for session {message_data.session_id}")
    except Exception as e:
        print(f"Error saving message: {e}")


# pops all messages from the Redis buffer list and bulk-inserts them into postgres
@shared_task
def process_message_batch():
    message_buffer_key = "message_buffer_queue"

    # pipeline for atomic pop on messages from redis
    pipe = r.pipeline()
    pipe.lrange(message_buffer_key, 0, -1)  # Get all items
    pipe.delete(message_buffer_key)  # Clear the list
    results = pipe.execute()

    messages_json = results[0]

    if not messages_json:
        print("No messages in buffer to process.")
        return

    COMMON_MESSAGES_REFERENCE = fetch_common_messages()

    print(f"Processing a batch of {len(messages_json)} messages.")

    messages_to_create = []
    for msg_json in messages_json:
        try:
            msg_data = json.loads(msg_json)
            print(msg_data)

            messages_to_create.append(
                OrchestratorMessages(
                    cd_session=int(msg_data.get("session_id")),
                    ds_text=msg_data.get("text"),
                    ds_id_platform_user=msg_data.get("id_user"),
                    ds_id_channel_user=msg_data.get("id_channel"),
                    ds_channel_name=msg_data.get("channel_name"),
                )
            )

            # if its a user message
            if msg_data.get("id_user"):
                send_user_messages(
                    msg_data.get("channel_name"),
                    msg_data.get("id_channel"),
                    msg_data.get("text"),
                    msg_data.get("id_user"),
                )
            else:
                check_and_reply_common_messages(
                    COMMON_MESSAGES_REFERENCE,
                    msg_data.get("channel_name"),
                    msg_data.get("id_channel"),
                    msg_data.get("text"),
                )

        except (json.JSONDecodeError, KeyError, TypeError) as e:
            print(f"Could not process message, skipping. Error: {e}. Data: {msg_json}")

    if messages_to_create:
        OrchestratorMessages.objects.bulk_create(messages_to_create)
        print(
            f"Successfully inserted {len(messages_to_create)} messages into the database."
        )


def send_user_messages(
    channel_name: str,
    channel_user_id: str,
    message: str,
    attendant_id: str | None = None,
):
    message_to_send = message
    if attendant_id:
        message_to_send = f"**{attendant_id}**\n{message}"

    if channel_name == "telegram":
        send_telegram_message(channel_user_id=channel_user_id, text=message_to_send)
    if channel_name == "slack":
        send_slack_message(channel_user_id=channel_user_id, text=message_to_send)


def check_and_reply_common_messages(
    reference_list: dict, channel_name: str, channel_user_id: str, message: str
):
    normalize_message = normalize_message_test(message)
    match = reference_list.get(normalize_message)
    if match:
        message_handler("0", channel_user_id, channel_name, match)


@shared_task
def delete_old_messages():
    cutoff_date = timezone.now() - timedelta(days=30)
    deleted_count, _ = OrchestratorMessages.objects.filter(
        dt_timestamp__lt=cutoff_date
    ).delete()

    print(f"Deleted {deleted_count} messages older than 30 days.")
