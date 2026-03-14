from django.contrib import admin
from django.urls import path
from .views import Messages, CommonMessagesIdentified, CommonMessagesList, Sessions

urlpatterns = [
    path("messages/", Messages.as_view(), name="message_manager"),
    path("sessions/", Sessions.as_view(), name="message_sessions"),
    path(
        "common_messages/",
        CommonMessagesList.as_view(),
        name="common_messages_multi",
    ),
    path(
        "common_messages/<int:id>/",
        CommonMessagesIdentified.as_view(),
        name="common_messages_single",
    ),
]
