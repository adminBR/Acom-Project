from django.contrib import admin
from django.urls import path
from .views import (
    manually_pop_redis_to_pg,
    fetch_redis_stored_messages,
    fetch_redis_active_sessions,
)

urlpatterns = [
    path("manual_run_worker/", manually_pop_redis_to_pg),
    path("redis_messages/", fetch_redis_stored_messages),
    path("redis_sessions/", fetch_redis_active_sessions),
]
