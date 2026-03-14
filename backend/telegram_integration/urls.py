from django.contrib import admin
from django.urls import path
from .views import TelegramWebhookView

urlpatterns = [
    path("webhook/", TelegramWebhookView.as_view()),
]
