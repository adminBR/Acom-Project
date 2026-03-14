from django.db import models
from django.utils import timezone


# postgres table schema for messages
class OrchestratorMessages(models.Model):
    cd_id = models.BigAutoField(primary_key=True, db_index=True)
    cd_session = models.BigIntegerField()
    ds_text = models.TextField()
    dt_timestamp = models.DateTimeField(default=timezone.now)
    ds_id_platform_user = models.CharField(max_length=255, null=True)
    ds_id_channel_user = models.CharField(max_length=255, null=True)
    ds_channel_name = models.CharField(max_length=100)

    class Meta:
        db_table = "OrchestratorMessages"
        indexes = [
            models.Index(fields=["cd_id"]),
            models.Index(fields=["ds_id_channel_user"]),
        ]

    def __str__(self):
        return f"{self.cd_id} - {self.ds_text[:50]}"


# postgres table schema for common_messages
class CommonMessagesReference(models.Model):
    cd_id = models.BigAutoField(primary_key=True, db_index=True)
    ds_message = models.TextField()
    ds_response = models.TextField()

    class Meta:
        db_table = "CommonMessages"
        indexes = [
            models.Index(fields=["cd_id"]),
        ]

    def __str__(self):
        return f"{self.cd_id} - {self.ds_message[:50]}"
