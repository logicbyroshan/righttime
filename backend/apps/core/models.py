import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone


class BaseModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    is_deleted = models.BooleanField(default=False)
    client_updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        abstract = True


class UserPreferences(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="preferences"
    )
    workday_start = models.TimeField(default="09:00")
    workday_end = models.TimeField(default="17:00")
    office_name = models.CharField(max_length=120, default="Office")
    timezone = models.CharField(max_length=64, default="Asia/Kolkata")
    theme = models.CharField(max_length=20, default="dark")  # dark, light, system
    wifi_ssid = models.CharField(max_length=120, blank=True, default="")  # Phase 2 prep
    wifi_bssid = models.CharField(max_length=120, blank=True, default="")  # Phase 2 prep
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Preferences for {self.user.username}"
