from django.contrib import admin
from django.urls import path
from .views import SlackWebhookView

urlpatterns = [
    path("webhook/", SlackWebhookView.as_view()),
]
