import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone


class SyncLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='sync_logs'
    )
    device_id = models.CharField(max_length=120, blank=True, default='')
    client_sync_time = models.DateTimeField(null=True, blank=True)
    server_sync_time = models.DateTimeField(default=timezone.now)
    records_received = models.PositiveIntegerField(default=0)
    records_applied = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=30, default='SUCCESS')
    details = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-server_sync_time']

    def __str__(self):
        return f"Sync at {self.server_sync_time} by {self.user.username}: {self.status}"
