from django.db import models
from apps.core.models import BaseModel


class Habit(BaseModel):
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, default='')
    target_count = models.PositiveIntegerField(default=1)
    unit = models.CharField(max_length=40, blank=True, default='times')
    color = models.CharField(max_length=30, default='#10B981')
    is_archived = models.BooleanField(default=False)

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['user', 'is_archived']),
        ]

    def __str__(self):
        return self.name


class HabitCompletion(BaseModel):
    habit = models.ForeignKey(
        Habit,
        on_delete=models.CASCADE,
        related_name='completions'
    )
    local_date = models.DateField(db_index=True)
    completed = models.BooleanField(default=True)
    count = models.PositiveIntegerField(default=1)
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-local_date']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'habit', 'local_date'],
                name='unique_habit_completion_per_day'
            )
        ]
        indexes = [
            models.Index(fields=['user', 'local_date']),
        ]

    def __str__(self):
        return f"{self.habit.name} on {self.local_date}: {self.completed}"
