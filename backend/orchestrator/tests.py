from django.test import TestCase

# Create your tests here.
# orchestrator/tests.py

import json
from unittest.mock import patch
from django.test import TestCase
import fakeredis

from .models import OrchestratorMessages
from .tasks import process_message_batch


class ProcessMessageBatchTaskTest(TestCase):
    # patching the function and redis with fakeredis
    @patch("orchestrator.tasks.send_user_messages")
    @patch(
        "orchestrator.tasks.r",
        new_callable=lambda: fakeredis.FakeRedis(decode_responses=True),
    )
    def test_task_processes_valid_batch_and_user_message_send(
        self, mock_redis, mock_send_user_messages
    ):
        """
        Tests that the task correctly saves messages to DB and calls the sender function.
        """
        message_buffer_key = "message_buffer_queue"

        # mock message from a client
        client_message = {
            "session_id": 101,
            "text": "Hello, support!",
            "id_user": None,
            "id_channel": "client_123",
            "channel_name": "whatsapp",
        }
        # mock message from a platform user
        user_message = {
            "session_id": 102,
            "text": "Hi there, I'm helping you.",
            "id_user": "agent_456",
            "id_channel": "client_123",
            "channel_name": "whatsapp",
        }

        mock_redis.lpush(message_buffer_key, json.dumps(client_message))
        mock_redis.lpush(message_buffer_key, json.dumps(user_message))

        # CHECK: if redis can have inserted messages
        self.assertEqual(mock_redis.llen(message_buffer_key), 2)
        self.assertEqual(OrchestratorMessages.objects.count(), 0)
        print("[ORCHESTRATOR:OK]: inserted mock messages on postgres")

        # manually triggering batch processing on the mock messages
        process_message_batch()

        # CHECK: messages got to postgres
        self.assertEqual(OrchestratorMessages.objects.count(), 2)
        print("[ORCHESTRATOR:OK]: postgres got the process batch messages")

        # CHECK: that the outbound sender was called only ONCE, with the right info
        mock_send_user_messages.assert_called_once_with(
            "whatsapp", "client_123", "Hi there, I'm helping you."
        )
        print("[ORCHESTRATOR:OK]: correct amount of messages stored")

        # CHECK: Redis queue is now empty
        self.assertEqual(mock_redis.llen(message_buffer_key), 0)
        print("[ORCHESTRATOR:OK]:redis cleared after empty process batch call")

    @patch(
        "orchestrator.tasks.r",
        new_callable=lambda: fakeredis.FakeRedis(decode_responses=True),
    )
    def test_task_handles_empty_queue(self, mock_redis):
        """
        Tests that the task doesn't crash or do anything if the queue is empty.
        """
        # checking if the fakeredis list is empty
        self.assertEqual(mock_redis.llen("message_buffer_queue"), 0)
        self.assertEqual(OrchestratorMessages.objects.count(), 0)

        process_message_batch()

        # CHECK: if the database stays empty on a empty batch call
        self.assertEqual(OrchestratorMessages.objects.count(), 0)
        print(
            "[ORCHESTRATOR:OK]: postgres remained clear after a empty process batch call"
        )
