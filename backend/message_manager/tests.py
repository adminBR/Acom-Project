from unittest.mock import patch
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from orchestrator.models import OrchestratorMessages


class MessageManagerApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("message_manager.views.message_handler")
    def test_post_messages_accepts_alias_payload_keys(self, mock_handler):
        mock_handler.return_value = {"ok": True}
        payload = {
            "ds_text": "hello from ui",
            "ds_id_platform_user": "agent-77",
            "ds_id_channel_user": "chat-1",
            "ds_channel_name": "telegram",
        }

        response = self.client.post("/manager/messages/", payload, format="json")

        self.assertEqual(response.status_code, 200)
        mock_handler.assert_called_once_with(
            "agent-77",
            "chat-1",
            "telegram",
            "hello from ui",
        )

    @patch("message_manager.views.message_handler")
    def test_post_messages_accepts_legacy_payload_keys(self, mock_handler):
        mock_handler.return_value = {"ok": True}
        payload = {
            "message": "hello from legacy",
            "platform_user_id": "agent-9",
            "channel_user_id": "channel-user-9",
            "channel_name": "slack",
        }

        response = self.client.post("/manager/messages/", payload, format="json")

        self.assertEqual(response.status_code, 200)
        mock_handler.assert_called_once_with(
            "agent-9",
            "channel-user-9",
            "slack",
            "hello from legacy",
        )

    def test_post_messages_missing_fields_returns_400(self):
        response = self.client.post(
            "/manager/messages/",
            {"ds_text": "missing data"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_get_messages_supports_channel_and_platform_filters(self):
        OrchestratorMessages.objects.create(
            cd_session=1,
            ds_text="from telegram user",
            ds_id_platform_user=None,
            ds_id_channel_user="chan-1",
            ds_channel_name="telegram",
        )
        OrchestratorMessages.objects.create(
            cd_session=1,
            ds_text="from agent",
            ds_id_platform_user="agent-1",
            ds_id_channel_user="chan-1",
            ds_channel_name="telegram",
        )
        OrchestratorMessages.objects.create(
            cd_session=2,
            ds_text="from slack",
            ds_id_platform_user="agent-2",
            ds_id_channel_user="chan-2",
            ds_channel_name="slack",
        )

        response = self.client.get(
            "/manager/messages/?channel_name=telegram&platform_user_id=agent-1"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["ds_text"], "from agent")

    def test_get_sessions_returns_grouped_and_sorted_data(self):
        base_time = timezone.now()
        OrchestratorMessages.objects.create(
            cd_session=10,
            ds_text="older session",
            dt_timestamp=base_time,
            ds_id_platform_user=None,
            ds_id_channel_user="telegram-user",
            ds_channel_name="telegram",
        )
        OrchestratorMessages.objects.create(
            cd_session=11,
            ds_text="latest session",
            dt_timestamp=base_time + timedelta(minutes=2),
            ds_id_platform_user="agent-z",
            ds_id_channel_user="slack-user",
            ds_channel_name="slack",
        )
        OrchestratorMessages.objects.create(
            cd_session=11,
            ds_text="latest followup",
            dt_timestamp=base_time + timedelta(minutes=3),
            ds_id_platform_user=None,
            ds_id_channel_user="slack-user",
            ds_channel_name="slack",
        )

        response = self.client.get("/manager/sessions/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)

        first = response.data["results"][0]
        self.assertEqual(first["cd_session"], 11)
        self.assertEqual(first["ds_channel_name"], "slack")
        self.assertEqual(first["ds_last_text"], "latest followup")
        self.assertEqual(first["total_messages"], 2)

    def test_get_sessions_supports_channel_filter(self):
        OrchestratorMessages.objects.create(
            cd_session=15,
            ds_text="telegram message",
            ds_id_platform_user=None,
            ds_id_channel_user="user-tele",
            ds_channel_name="telegram",
        )
        OrchestratorMessages.objects.create(
            cd_session=16,
            ds_text="slack message",
            ds_id_platform_user=None,
            ds_id_channel_user="user-slack",
            ds_channel_name="slack",
        )

        response = self.client.get("/manager/sessions/?channel_name=telegram")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["ds_channel_name"], "telegram")
