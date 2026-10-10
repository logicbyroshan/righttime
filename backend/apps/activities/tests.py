import uuid
from datetime import datetime, timezone, timedelta
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from apps.activities.models import Activity, ActivityEntry


class ActivitiesApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='actuser', password='password123')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.now = datetime(2026, 10, 10, 10, 0, 0, tzinfo=timezone.utc)

        self.activity = Activity.objects.create(
            user=self.user,
            name='Code Review',
            category='Work',
            color='#10B981',
        )

    def test_activity_crud(self):
        resp = self.client.get('/api/v1/activities/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)

        # Create activity
        create_resp = self.client.post('/api/v1/activities/', {
            'name': 'Deep Focus',
            'category': 'Productivity',
            'color': '#8B5CF6',
        })
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_resp.data['name'], 'Deep Focus')

    def test_timer_overlap_prevention(self):
        # Start timer 1
        resp1 = self.client.post('/api/v1/activities/entries/', {
            'activity': str(self.activity.id),
            'start_time': self.now.isoformat(),
            'is_running': True,
        })
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED)
        self.assertTrue(resp1.data['is_running'])

        # Start timer 2 while timer 1 is running -> must fail
        resp2 = self.client.post('/api/v1/activities/entries/', {
            'activity': str(self.activity.id),
            'start_time': (self.now + timedelta(minutes=5)).isoformat(),
            'is_running': True,
        })
        self.assertEqual(resp2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('already running', resp2.data['message'])

    def test_invalid_start_end_ordering(self):
        # End time before start time
        resp = self.client.post('/api/v1/activities/entries/', {
            'activity': str(self.activity.id),
            'start_time': self.now.isoformat(),
            'end_time': (self.now - timedelta(hours=1)).isoformat(),
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        has_end_time_err = 'end_time' in resp.data or ('errors' in resp.data and 'end_time' in resp.data['errors'])
        self.assertTrue(has_end_time_err)

    def test_manual_entry_duration_calculation(self):
        start = self.now
        end = self.now + timedelta(minutes=45)
        resp = self.client.post('/api/v1/activities/entries/', {
            'activity': str(self.activity.id),
            'start_time': start.isoformat(),
            'end_time': end.isoformat(),
            'notes': 'Manual entry for morning review',
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data['duration_seconds'], 2700)  # 45 mins * 60
