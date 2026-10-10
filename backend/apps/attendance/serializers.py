from rest_framework import serializers
from apps.attendance.models import (
    AttendanceSession,
    BreakSession,
    AttendanceEvent,
    AttendanceCorrection,
)


class BreakSessionSerializer(serializers.ModelSerializer):
    duration_seconds = serializers.IntegerField(read_only=True)

    class Meta:
        model = BreakSession
        fields = [
            'id',
            'session',
            'start_time',
            'end_time',
            'notes',
            'duration_seconds',
            'is_deleted',
            'created_at',
            'updated_at',
            'client_updated_at',
        ]
        read_only_fields = ['session']


class AttendanceEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttendanceEvent
        fields = [
            'id',
            'session',
            'event_type',
            'timestamp',
            'notes',
            'created_at',
        ]
        read_only_fields = ['session']


class AttendanceCorrectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttendanceCorrection
        fields = [
            'id',
            'session',
            'reason',
            'field_name',
            'old_value',
            'new_value',
            'created_at',
        ]
        read_only_fields = ['session']


class AttendanceSessionSerializer(serializers.ModelSerializer):
    breaks = BreakSessionSerializer(many=True, read_only=True)
    events = AttendanceEventSerializer(many=True, read_only=True)
    corrections = AttendanceCorrectionSerializer(many=True, read_only=True)
    gross_duration_seconds = serializers.IntegerField(read_only=True)
    total_break_seconds = serializers.IntegerField(read_only=True)
    net_duration_seconds = serializers.IntegerField(read_only=True)

    class Meta:
        model = AttendanceSession
        fields = [
            'id',
            'status',
            'start_time',
            'end_time',
            'work_date',
            'notes',
            'is_incomplete',
            'is_corrected',
            'breaks',
            'events',
            'corrections',
            'gross_duration_seconds',
            'total_break_seconds',
            'net_duration_seconds',
            'is_deleted',
            'created_at',
            'updated_at',
            'client_updated_at',
        ]


class ProcessAttendanceEventSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    session_id = serializers.UUIDField(required=False)
    event_type = serializers.ChoiceField(choices=AttendanceEvent.EVENT_CHOICES)
    timestamp = serializers.DateTimeField(required=False)
    work_date = serializers.DateField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class CorrectionRequestSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True)
    start_time = serializers.DateTimeField(required=False)
    end_time = serializers.DateTimeField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)
