from django.apps import AppConfig


class MockIntegrationConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'mock_integration'
