import uuid
from datetime import date, timedelta
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from apps.habits.models import Habit, HabitCompletion
from apps.habits.streaks import calculate_habit_streaks


class HabitsApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='habituser', password='password123')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.habit = Habit.objects.create(
            user=self.user,
            name='Drink Water',
            color='#3B82F6',
        )
        self.today = date(2026, 10, 10)

    def test_daily_completion_uniqueness(self):
        # First completion
        resp1 = self.client.post('/api/v1/habits/completions/', {
            'habit_id': str(self.habit.id),
            'local_date': str(self.today),
            'completed': True,
        })
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED)

        # Second completion on same date -> updates rather than creates duplicate
        resp2 = self.client.post('/api/v1/habits/completions/', {
            'habit_id': str(self.habit.id),
            'local_date': str(self.today),
            'completed': True,
            'count': 2,
        })
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        # Verify only 1 completion record in database
        self.assertEqual(HabitCompletion.objects.filter(habit=self.habit, local_date=self.today).count(), 1)

    def test_streak_calculation_and_historical_update(self):
        # Day 1: 2026-10-08
        HabitCompletion.objects.create(
            user=self.user, habit=self.habit, local_date=self.today - timedelta(days=2), completed=True
        )
        # Day 2: 2026-10-09
        HabitCompletion.objects.create(
            user=self.user, habit=self.habit, local_date=self.today - timedelta(days=1), completed=True
        )
        # Day 3: 2026-10-10 (today)
        HabitCompletion.objects.create(
            user=self.user, habit=self.habit, local_date=self.today, completed=True
        )

        streaks = calculate_habit_streaks(self.habit, today=self.today)
        self.assertEqual(streaks['current_streak'], 3)
        self.assertEqual(streaks['best_streak'], 3)
        self.assertTrue(streaks['completed_today'])

        # Now remove yesterday's completion (simulate editing historical entry)
        HabitCompletion.objects.filter(habit=self.habit, local_date=self.today - timedelta(days=1)).delete()

        # Recalculate streak: only today is completed, streak should be 1
        recalculated = calculate_habit_streaks(self.habit, today=self.today)
        self.assertEqual(recalculated['current_streak'], 1)
        self.assertEqual(recalculated['best_streak'], 1)
