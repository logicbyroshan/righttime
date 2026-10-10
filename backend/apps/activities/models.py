from datetime import datetime
from dateutil import parser
from django.db import models
from apps.core.models import BaseModel


class Activity(BaseModel):
    name = models.CharField(max_length=120)
    category = models.CharField(max_length=80, default='General')
    color = models.CharField(max_length=30, default='#3B82F6')
    is_archived = models.BooleanField(default=False)

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['user', 'is_archived']),
        ]

    def __str__(self):
        return f"{self.name} ({self.category})"


class ActivityEntry(BaseModel):
    activity = models.ForeignKey(
        Activity,
        on_delete=models.CASCADE,
        related_name='entries'
    )
    start_time = models.DateTimeField()
    end_time = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(default=0)
    work_date = models.DateField(db_index=True)
    notes = models.TextField(blank=True, default='')
    is_running = models.BooleanField(default=False)

    class Meta:
        ordering = ['-start_time']
        indexes = [
            models.Index(fields=['user', 'work_date']),
            models.Index(fields=['user', 'is_running']),
        ]

    def save(self, *args, **kwargs):
        if self.end_time and self.start_time:
            st = self.start_time
            et = self.end_time
            if isinstance(st, str):
                st = parser.isoparse(st)
            if isinstance(et, str):
                et = parser.isoparse(et)
            diff = (et - st).total_seconds()
            self.duration_seconds = max(0, int(diff))
            self.is_running = False
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.activity.name} on {self.work_date} ({self.duration_seconds}s)"
