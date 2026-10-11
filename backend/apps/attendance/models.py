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
    source = models.CharField(max_length=32, default='MANUAL')
    detected_at = models.DateTimeField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    network_match = models.BooleanField(default=True)

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
    source = models.CharField(max_length=32, default='MANUAL')
    detected_at = models.DateTimeField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    network_match = models.BooleanField(default=True)
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


class PendingSuggestion(BaseModel):
    TYPE_ARRIVAL = 'ARRIVAL'
    TYPE_DEPARTURE = 'DEPARTURE'
    TYPE_CHOICES = [
        (TYPE_ARRIVAL, 'Arrival'),
        (TYPE_DEPARTURE, 'Departure'),
    ]
    STATUS_PENDING = 'PENDING'
    STATUS_CONFIRMED = 'CONFIRMED'
    STATUS_DISMISSED = 'DISMISSED'
    STATUS_SNOOZED = 'SNOOZED'
    STATUS_CANCELLED = 'CANCELLED'
    STATUS_EXPIRED = 'EXPIRED'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_CONFIRMED, 'Confirmed'),
        (STATUS_DISMISSED, 'Dismissed'),
        (STATUS_SNOOZED, 'Snoozed'),
        (STATUS_CANCELLED, 'Cancelled'),
        (STATUS_EXPIRED, 'Expired'),
    ]

    event_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    detected_at = models.DateTimeField()
    source = models.CharField(max_length=32, default='WIFI_AUTO')
    network_match = models.BooleanField(default=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-detected_at']
        indexes = [
            models.Index(fields=['user', 'status']),
            models.Index(fields=['user', 'event_type']),
        ]

    def __str__(self):
        return f"Suggestion {self.event_type} ({self.status}) for {self.user.username}"


class OfficialImportBatch(BaseModel):
    source_filename = models.CharField(max_length=255)
    file_hash = models.CharField(max_length=128, db_index=True)
    row_count = models.PositiveIntegerField(default=0)
    imported_at = models.DateTimeField(default=timezone.now)
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-imported_at']

    def __str__(self):
        return f"Batch {self.source_filename} ({self.imported_at.date()})"


class OfficialAttendanceRecord(BaseModel):
    batch = models.ForeignKey(
        OfficialImportBatch,
        on_delete=models.CASCADE,
        related_name='records'
    )
    work_date = models.DateField(db_index=True)
    check_in_time = models.DateTimeField(null=True, blank=True)
    check_out_time = models.DateTimeField(null=True, blank=True)
    break_duration_minutes = models.PositiveIntegerField(default=0)
    total_duration_minutes = models.PositiveIntegerField(default=0)
    source_description = models.CharField(max_length=255, blank=True, default='')
    validation_status = models.CharField(max_length=32, default='VALID')
    discrepancy_note = models.TextField(blank=True, default='')
    is_reviewed = models.BooleanField(default=False)

    class Meta:
        ordering = ['work_date', 'check_in_time']
        indexes = [
            models.Index(fields=['user', 'work_date']),
            models.Index(fields=['user', 'is_reviewed']),
        ]

    def __str__(self):
        return f"Official {self.work_date} ({self.validation_status}) for {self.user.username}"

