from django.contrib import admin
from django.urls import path
from .views import mock_listener

urlpatterns = [
    path("message/", mock_listener.as_view(), name="message"),
]
