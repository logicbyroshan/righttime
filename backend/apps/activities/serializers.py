from django.utils import timezone
from rest_framework import serializers
from apps.activities.models import Activity, ActivityEntry


class ActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Activity
        fields = [
            'id',
            'name',
            'category',
            'color',
            'is_archived',
            'is_deleted',
            'created_at',
            'updated_at',
            'client_updated_at',
        ]


class ActivityEntrySerializer(serializers.ModelSerializer):
    activity_name = serializers.CharField(source='activity.name', read_only=True)
    activity_color = serializers.CharField(source='activity.color', read_only=True)
    activity_category = serializers.CharField(source='activity.category', read_only=True)

    class Meta:
        model = ActivityEntry
        fields = [
            'id',
            'activity',
            'activity_name',
            'activity_color',
            'activity_category',
            'start_time',
            'end_time',
            'duration_seconds',
            'work_date',
            'notes',
            'is_running',
            'is_deleted',
            'created_at',
            'updated_at',
            'client_updated_at',
        ]


class ActivityEntryCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityEntry
        fields = [
            'id',
            'activity',
            'start_time',
            'end_time',
            'duration_seconds',
            'work_date',
            'notes',
            'is_running',
            'client_updated_at',
        ]
        extra_kwargs = {
            'id': {'required': False},
            'work_date': {'required': False},
            'end_time': {'required': False, 'allow_null': True},
            'duration_seconds': {'required': False},
            'notes': {'required': False, 'allow_blank': True},
            'is_running': {'required': False},
            'client_updated_at': {'required': False, 'allow_null': True},
        }

    def validate(self, attrs):
        start_time = attrs.get('start_time') or (self.instance.start_time if self.instance else None)
        end_time = attrs.get('end_time') if 'end_time' in attrs else (self.instance.end_time if self.instance else None)

        if start_time and end_time and end_time < start_time:
            raise serializers.ValidationError({
                "end_time": "End time must be after start time."
            })

        if 'work_date' not in attrs or not attrs['work_date']:
            ref = start_time or timezone.now()
            attrs['work_date'] = ref.date() if hasattr(ref, 'date') else ref

        return attrs
