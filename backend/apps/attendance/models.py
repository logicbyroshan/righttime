import uuid
from django.db import models
from django.utils import timezone
from apps.core.models import BaseModel


class AttendanceSession(BaseModel):
    STATUS_IN_PROGRESS = 'IN_PROGRESS'
    STATUS_COMPLETED = 'COMPLETED'
    STATUS_CHOICES = [
        (STATUS_IN_PROGRESS, 'In Progress'),
        (STATUS_COMPLETED, 'Completed'),
    ]

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_IN_PROGRESS)
    start_time = models.DateTimeField()
    end_time = models.DateTimeField(null=True, blank=True)
    work_date = models.DateField(db_index=True)  # Local date e.g. 2026-10-10
    notes = models.TextField(blank=True, default='')
    is_incomplete = models.BooleanField(default=False)
    is_corrected = models.BooleanField(default=False)

    class Meta:
        ordering = ['-start_time']
        indexes = [
            models.Index(fields=['user', 'work_date']),
            models.Index(fields=['user', 'status']),
        ]

    def __str__(self):
        return f"Attendance {self.work_date} ({self.status}) for {self.user.username}"

    @property
    def total_break_seconds(self):
        total = 0
        for brk in self.breaks.filter(is_deleted=False):
            if brk.end_time and brk.start_time:
                diff = (brk.end_time - brk.start_time).total_seconds()
                if diff > 0:
                    total += int(diff)
        return total

    @property
    def gross_duration_seconds(self):
        if not self.end_time:
            return 0
        diff = (self.end_time - self.start_time).total_seconds()
        return max(0, int(diff))

    @property
    def net_duration_seconds(self):
        gross = self.gross_duration_seconds
        brk = self.total_break_seconds
        return max(0, gross - brk)


class BreakSession(BaseModel):
    session = models.ForeignKey(
        AttendanceSession,
        on_delete=models.CASCADE,
        related_name='breaks'
    )
    start_time = models.DateTimeField()
    end_time = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['start_time']

    @property
    def duration_seconds(self):
        if not self.end_time:
            return 0
        diff = (self.end_time - self.start_time).total_seconds()
        return max(0, int(diff))


class AttendanceEvent(models.Model):
    EVENT_CHECK_IN = 'CHECK_IN'
    EVENT_START_BREAK = 'START_BREAK'
    EVENT_END_BREAK = 'END_BREAK'
    EVENT_CHECK_OUT = 'CHECK_OUT'
    EVENT_CORRECTION = 'CORRECTION'
    EVENT_CHOICES = [
        (EVENT_CHECK_IN, 'Check In'),
        (EVENT_START_BREAK, 'Start Break'),
        (EVENT_END_BREAK, 'End Break'),
        (EVENT_CHECK_OUT, 'Check Out'),
        (EVENT_CORRECTION, 'Correction'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        AttendanceSession,
        on_delete=models.CASCADE,
        related_name='events'
    )
    user = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='attendance_events'
    )
    event_type = models.CharField(max_length=20, choices=EVENT_CHOICES)
    timestamp = models.DateTimeField(default=timezone.now)
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['timestamp']


class AttendanceCorrection(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        AttendanceSession,
        on_delete=models.CASCADE,
        related_name='corrections'
    )
    user = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='attendance_corrections'
    )
    reason = models.TextField()
    field_name = models.CharField(max_length=64)
    old_value = models.TextField(blank=True, default='')
    new_value = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-created_at']
