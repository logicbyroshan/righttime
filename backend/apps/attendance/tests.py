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

    def test_pending_suggestion_lifecycle(self):
        # 1. Create a pending arrival suggestion
        sugg_id = str(uuid.uuid4())
        resp = self.client.post('/api/v1/attendance/suggestions/', {
            'id': sugg_id,
            'event_type': 'ARRIVAL',
            'detected_at': self.now.isoformat(),
            'source': 'WIFI_AUTO',
            'network_match': True,
            'notes': 'Office-WiFi detected',
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data['status'], 'PENDING')

        # 2. Confirm the suggestion
        confirm_resp = self.client.post(f'/api/v1/attendance/suggestions/{sugg_id}/', {
            'action': 'confirm',
        })
        self.assertEqual(confirm_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(confirm_resp.data['status'], 'CONFIRMED')

        # Verify an open attendance session was created with WIFI_SUGGESTION source
        session = AttendanceSession.objects.filter(user=self.user, status='IN_PROGRESS').first()
        self.assertIsNotNone(session)
        self.assertEqual(session.source, 'WIFI_SUGGESTION')
        self.assertEqual(session.network_match, True)

        # 3. Attempting to confirm again must fail
        dup_resp = self.client.post(f'/api/v1/attendance/suggestions/{sugg_id}/', {
            'action': 'confirm',
        })
        self.assertEqual(dup_resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_departure_suggestion_blocks_when_break_open(self):
        # 1. Create session and open break
        self.client.post('/api/v1/attendance/events/', {
            'event_type': 'CHECK_IN',
            'timestamp': self.now.isoformat(),
        })
        self.client.post('/api/v1/attendance/events/', {
            'event_type': 'START_BREAK',
            'timestamp': (self.now + timedelta(hours=2)).isoformat(),
        })

        # 2. Create departure suggestion
        dep_id = str(uuid.uuid4())
        self.client.post('/api/v1/attendance/suggestions/', {
            'id': dep_id,
            'event_type': 'DEPARTURE',
            'detected_at': (self.now + timedelta(hours=4)).isoformat(),
            'source': 'WIFI_AUTO',
        })

        # 3. Confirming departure must fail because a break is open
        fail_resp = self.client.post(f'/api/v1/attendance/suggestions/{dep_id}/', {
            'action': 'confirm',
        })
        self.assertEqual(fail_resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('break is currently open', fail_resp.data['message'])

        # 4. Dismiss suggestion instead
        dismiss_resp = self.client.post(f'/api/v1/attendance/suggestions/{dep_id}/', {
            'action': 'dismiss',
            'reason': 'Still in office',
        })
        self.assertEqual(dismiss_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(dismiss_resp.data['status'], 'DISMISSED')

    def test_sync_with_suggestions_and_metadata(self):
        sess_id = str(uuid.uuid4())
        sugg_id = str(uuid.uuid4())

        resp = self.client.post('/api/v1/sync/', {
            'attendance_sessions': [{
                'id': sess_id,
                'status': 'IN_PROGRESS',
                'start_time': self.now.isoformat(),
                'work_date': '2026-10-10',
                'notes': 'Sync test',
                'source': 'WIFI_SUGGESTION',
                'detected_at': self.now.isoformat(),
                'confirmed_at': self.now.isoformat(),
                'network_match': True,
            }],
            'pending_suggestions': [{
                'id': sugg_id,
                'event_type': 'ARRIVAL',
                'detected_at': self.now.isoformat(),
                'source': 'WIFI_AUTO',
                'network_match': True,
                'status': 'CONFIRMED',
                'confirmed_at': self.now.isoformat(),
                'notes': 'Arrived via Wi-Fi',
            }]
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['processed_counts']['attendance_sessions'], 1)
        self.assertEqual(resp.data['processed_counts']['pending_suggestions'], 1)

        # Verify persisted in database
        sess = AttendanceSession.objects.filter(id=sess_id).first()
        self.assertIsNotNone(sess)
        self.assertEqual(sess.source, 'WIFI_SUGGESTION')

    def test_official_batch_and_record_endpoints(self):
        # 1. Create official batch
        batch_id = str(uuid.uuid4())
        resp = self.client.post('/api/v1/attendance/official-batches/', {
            'id': batch_id,
            'source_filename': 'october_hr_punch.csv',
            'file_hash': 'abcdef1234567890',
            'row_count': 1,
            'notes': 'Official biometrics report',
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data['source_filename'], 'october_hr_punch.csv')

        # 2. Create official record
        rec_id = str(uuid.uuid4())
        rec_resp = self.client.post('/api/v1/attendance/official-records/', {
            'id': rec_id,
            'batch': batch_id,
            'work_date': '2026-10-10',
            'check_in_time': '2026-10-10T09:00:00Z',
            'check_out_time': '2026-10-10T17:00:00Z',
            'break_duration_minutes': 60,
            'total_duration_minutes': 420,
            'source_description': 'Biometric terminal 1',
            'validation_status': 'VALID',
        })
        self.assertEqual(rec_resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(rec_resp.data['work_date'], '2026-10-10')

        # 3. Patch review status and discrepancy note
        patch_resp = self.client.patch(f'/api/v1/attendance/official-records/{rec_id}/', {
            'is_reviewed': True,
            'discrepancy_note': 'Discussed with manager - verified on premises',
        })
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(patch_resp.data['is_reviewed'])

    def test_official_records_batch_sync(self):
        batch_id = str(uuid.uuid4())
        rec_id = str(uuid.uuid4())
        resp = self.client.post('/api/v1/sync/', {
            'device_id': 'test-phone',
            'official_attendance_batches': [{
                'id': batch_id,
                'source_filename': 'sync_official.csv',
                'file_hash': 'hash98765',
                'row_count': 1,
                'imported_at': self.now.isoformat(),
            }],
            'official_attendance_records': [{
                'id': rec_id,
                'batch_id': batch_id,
                'work_date': '2026-10-11',
                'check_in_time': '2026-10-11T09:15:00Z',
                'check_out_time': '2026-10-11T17:30:00Z',
                'break_duration_minutes': 45,
                'total_duration_minutes': 450,
                'source_description': 'Turnstile',
                'validation_status': 'VALID',
                'is_reviewed': True,
            }],
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['processed_counts']['official_attendance_batches'], 1)
        self.assertEqual(resp.data['processed_counts']['official_attendance_records'], 1)

