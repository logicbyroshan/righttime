import uuid
from datetime import datetime, timezone, timedelta
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from apps.attendance.models import AttendanceSession, AttendanceEvent, BreakSession


class AttendanceApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='attuser', password='password123')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.now = datetime(2026, 10, 10, 9, 0, 0, tzinfo=timezone.utc)

    def test_check_in_and_duplicate_prevention(self):
        event_id = uuid.uuid4()
        resp = self.client.post('/api/v1/attendance/events/', {
            'id': str(event_id),
            'event_type': 'CHECK_IN',
            'timestamp': self.now.isoformat(),
            'notes': 'Morning arrival',
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data['session']['status'], 'IN_PROGRESS')

        # Attempt second check-in while first is still open -> must fail
        resp2 = self.client.post('/api/v1/attendance/events/', {
            'event_type': 'CHECK_IN',
            'timestamp': (self.now + timedelta(minutes=10)).isoformat(),
        })
        self.assertEqual(resp2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('already active', resp2.data['message'])

        # Idempotent retry with original event_id -> should return existing session
        resp_retry = self.client.post('/api/v1/attendance/events/', {
            'id': str(event_id),
            'event_type': 'CHECK_IN',
            'timestamp': self.now.isoformat(),
        })
        self.assertEqual(resp_retry.status_code, status.HTTP_200_OK)

    def test_break_and_checkout_workflow(self):
        # 1. Check in at 09:00
        self.client.post('/api/v1/attendance/events/', {
            'event_type': 'CHECK_IN',
            'timestamp': self.now.isoformat(),
        })

        # 2. Start break at 12:00
        break_start = self.now + timedelta(hours=3)
        b_resp = self.client.post('/api/v1/attendance/events/', {
            'event_type': 'START_BREAK',
            'timestamp': break_start.isoformat(),
            'notes': 'Lunch',
        })
        self.assertEqual(b_resp.status_code, status.HTTP_200_OK)

        # 3. Cannot start another break while break is open
        b_dup = self.client.post('/api/v1/attendance/events/', {
            'event_type': 'START_BREAK',
            'timestamp': (break_start + timedelta(minutes=10)).isoformat(),
        })
        self.assertEqual(b_dup.status_code, status.HTTP_400_BAD_REQUEST)

        # 4. Cannot checkout while break is open
        co_fail = self.client.post('/api/v1/attendance/events/', {
            'event_type': 'CHECK_OUT',
            'timestamp': (break_start + timedelta(minutes=30)).isoformat(),
        })
        self.assertEqual(co_fail.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('break is currently open', co_fail.data['message'])

        # 5. End break at 13:00 (1 hour break = 3600s)
        break_end = break_start + timedelta(hours=1)
        end_b = self.client.post('/api/v1/attendance/events/', {
            'event_type': 'END_BREAK',
            'timestamp': break_end.isoformat(),
        })
        self.assertEqual(end_b.status_code, status.HTTP_200_OK)

        # 6. Check out at 17:00 (total gross = 8 hours = 28800s, break = 3600s, net = 25200s)
        checkout_time = self.now + timedelta(hours=8)
        co_resp = self.client.post('/api/v1/attendance/events/', {
            'event_type': 'CHECK_OUT',
            'timestamp': checkout_time.isoformat(),
        })
        self.assertEqual(co_resp.status_code, status.HTTP_200_OK)
        session_data = co_resp.data['session']
        self.assertEqual(session_data['status'], 'COMPLETED')
        self.assertEqual(session_data['gross_duration_seconds'], 28800)
        self.assertEqual(session_data['total_break_seconds'], 3600)
        self.assertEqual(session_data['net_duration_seconds'], 25200)

    def test_manual_correction_audit(self):
        # Create session
        resp = self.client.post('/api/v1/attendance/events/', {
            'event_type': 'CHECK_IN',
            'timestamp': self.now.isoformat(),
        })
        session_id = resp.data['session']['id']

        # Checkout
        self.client.post('/api/v1/attendance/events/', {
            'event_type': 'CHECK_OUT',
            'timestamp': (self.now + timedelta(hours=7)).isoformat(),
        })

        # Apply correction
        corr_resp = self.client.post(f'/api/v1/attendance/{session_id}/correct/', {
            'reason': 'Forgot to checkout before meeting at 18:00',
            'end_time': (self.now + timedelta(hours=9)).isoformat(),
            'notes': 'Corrected evening checkout',
        })
        self.assertEqual(corr_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(corr_resp.data['is_corrected'])
        self.assertEqual(len(corr_resp.data['corrections']), 2)  # end_time and notes
