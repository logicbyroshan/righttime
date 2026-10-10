import uuid
from datetime import datetime, timezone
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from apps.attendance.models import AttendanceSession, AttendanceEvent
from apps.activities.models import Activity, ActivityEntry
from apps.habits.models import Habit, HabitCompletion
from apps.sync.models import SyncLog


class SyncApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='syncuser', password='password123')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.act_id = uuid.uuid4()
        self.entry_id = uuid.uuid4()
        self.sess_id = uuid.uuid4()
        self.habit_id = uuid.uuid4()
        self.comp_id = uuid.uuid4()

    def test_sync_upsert_and_idempotency(self):
        payload = {
            'device_id': 'android-test-device-01',
            'last_sync_timestamp': '2026-10-09T00:00:00Z',
            'activities': [
                {
                    'id': str(self.act_id),
                    'name': 'Architecture Design',
                    'category': 'Engineering',
                    'color': '#3B82F6',
                    'is_archived': False,
                }
            ],
            'activity_entries': [
                {
                    'id': str(self.entry_id),
                    'activity': str(self.act_id),
                    'start_time': '2026-10-10T10:00:00Z',
                    'end_time': '2026-10-10T11:00:00Z',
                    'duration_seconds': 3600,
                    'work_date': '2026-10-10',
                    'notes': 'Sync entry',
                    'is_running': False,
                }
            ],
            'attendance_sessions': [
                {
                    'id': str(self.sess_id),
                    'status': 'COMPLETED',
                    'start_time': '2026-10-10T09:00:00Z',
                    'end_time': '2026-10-10T17:00:00Z',
                    'work_date': '2026-10-10',
                    'notes': 'Synced office session',
                    'is_incomplete': False,
                    'is_corrected': False,
                }
            ],
            'habits': [
                {
                    'id': str(self.habit_id),
                    'name': 'Daily Workout',
                    'color': '#10B981',
                    'target_count': 1,
                }
            ],
            'habit_completions': [
                {
                    'id': str(self.comp_id),
                    'habit': str(self.habit_id),
                    'local_date': '2026-10-10',
                    'completed': True,
                    'count': 1,
                }
            ],
        }

        # First sync
        resp1 = self.client.post('/api/v1/sync/', payload, format='json')
        self.assertEqual(resp1.status_code, status.HTTP_200_OK)
        self.assertEqual(resp1.data['status'], 'success')
        self.assertEqual(resp1.data['processed_counts']['activities'], 1)
        self.assertEqual(resp1.data['processed_counts']['attendance_sessions'], 1)

        # Verify database items created
        self.assertTrue(Activity.objects.filter(id=self.act_id).exists())
        self.assertTrue(ActivityEntry.objects.filter(id=self.entry_id).exists())
        self.assertTrue(AttendanceSession.objects.filter(id=self.sess_id).exists())
        self.assertTrue(Habit.objects.filter(id=self.habit_id).exists())
        self.assertTrue(HabitCompletion.objects.filter(id=self.comp_id).exists())

        # Duplicate sync with same payload -> must succeed idempotently without creating duplicates
        resp2 = self.client.post('/api/v1/sync/', payload, format='json')
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        self.assertEqual(Activity.objects.filter(user=self.user).count(), 1)
        self.assertEqual(ActivityEntry.objects.filter(user=self.user).count(), 1)
        self.assertEqual(AttendanceSession.objects.filter(user=self.user).count(), 1)
        self.assertEqual(Habit.objects.filter(user=self.user).count(), 1)
        self.assertEqual(HabitCompletion.objects.filter(user=self.user).count(), 1)

        # Check sync logs
        self.assertEqual(SyncLog.objects.filter(user=self.user).count(), 2)
