from rest_framework import serializers
from apps.habits.models import Habit, HabitCompletion


class HabitSerializer(serializers.ModelSerializer):
    current_streak = serializers.IntegerField(read_only=True, default=0)
    best_streak = serializers.IntegerField(read_only=True, default=0)
    completed_today = serializers.BooleanField(read_only=True, default=False)

    class Meta:
        model = Habit
        fields = [
            'id',
            'name',
            'description',
            'target_count',
            'unit',
            'color',
            'is_archived',
            'current_streak',
            'best_streak',
            'completed_today',
            'is_deleted',
            'created_at',
            'updated_at',
            'client_updated_at',
        ]


class HabitCompletionSerializer(serializers.ModelSerializer):
    habit_name = serializers.CharField(source='habit.name', read_only=True)

    class Meta:
        model = HabitCompletion
        fields = [
            'id',
            'habit',
            'habit_name',
            'local_date',
            'completed',
            'count',
            'notes',
            'is_deleted',
            'created_at',
            'updated_at',
            'client_updated_at',
        ]


class HabitCompletionCreateSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    habit_id = serializers.UUIDField(required=True)
    local_date = serializers.DateField(required=True)
    completed = serializers.BooleanField(default=True)
    count = serializers.IntegerField(default=1)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
