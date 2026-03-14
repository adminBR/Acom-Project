# mock_integration/tests.py

from unittest.mock import patch
from django.urls import reverse
from django.test import override_settings
from rest_framework.test import APITestCase
import fakeredis

from orchestrator.models import OrchestratorMessages
from orchestrator.tasks import process_message_batch


# making celery run sync
@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
class MockWebhookApiTest(APITestCase):
    # Creating a isolated redis instance
    def setUp(self):
        self.fake_redis_client = fakeredis.FakeRedis(decode_responses=True)

    def test_webhook_call_successfully_creates_message_in_db(self):
        """
        An integration test from API call -> Redis -> DB.
        """
        with (
            patch(
                "orchestrator.services.redis.Redis", return_value=self.fake_redis_client
            ),
            patch("orchestrator.tasks.r", self.fake_redis_client),
        ):

            # getching the post url name
            webhook_url = reverse("message")
            payload = {
                "unique_id": "mock_user_for_test",
                "message": "This is a test message from the API.",
                "channel_name": "mock",
            }
            self.assertEqual(OrchestratorMessages.objects.count(), 0)
            self.assertEqual(self.fake_redis_client.llen("message_buffer_queue"), 0)

            # ACT
            response = self.client.post(webhook_url, data=payload, format="json")

            # CHECK: if it accepts the post message, with a 202
            self.assertEqual(response.status_code, 202)
            print("[MOCK:OK]:post endpoint returned 202")

            # CHECK: if redis got the posted message
            self.assertEqual(self.fake_redis_client.llen("message_buffer_queue"), 1)
            print("[MOCK:OK]:redis got the message")

            # ACT
            process_message_batch()

            # CHECK: if postgres got the message transfered from redis
            self.assertEqual(OrchestratorMessages.objects.count(), 1)
            created_message = OrchestratorMessages.objects.first()
            self.assertEqual(
                created_message.ds_text, "This is a test message from the API."
            )
            print("[MOCK:OK]:postgres got the message stored ", created_message.ds_text)

            # CHECK: if redis queue got cleared
            self.assertEqual(self.fake_redis_client.llen("message_buffer_queue"), 0)
            print("[MOCK:OK]:redis cleared")
