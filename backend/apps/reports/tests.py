from datetime import date, datetime, timezone, timedelta
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from apps.attendance.models import AttendanceSession, BreakSession
from apps.activities.models import Activity, ActivityEntry
from apps.habits.models import Habit, HabitCompletion


class ReportsApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='repuser', password='password123')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.today = date(2026, 10, 10)

    def test_empty_reports_return_valid_structure(self):
        # Empty daily report
        d_resp = self.client.get('/api/v1/reports/daily/?date=2026-10-10')
        self.assertEqual(d_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(d_resp.data['attendance']['gross_duration_seconds'], 0)
        self.assertEqual(d_resp.data['activities']['total_duration_seconds'], 0)
        self.assertEqual(d_resp.data['habits']['completion_rate'], 0)

        # Empty weekly report
        w_resp = self.client.get('/api/v1/reports/weekly/?date=2026-10-10')
        self.assertEqual(w_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(w_resp.data['period'], 'weekly')

        # Empty monthly report
        m_resp = self.client.get('/api/v1/reports/monthly/?month=2026-10')
        self.assertEqual(m_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(m_resp.data['period'], 'monthly')

    def test_daily_report_with_data_and_trends(self):
        # Create yesterday session (6 hours = 21600s)
        yesterday = self.today - timedelta(days=1)
        AttendanceSession.objects.create(
            user=self.user,
            status=AttendanceSession.STATUS_COMPLETED,
            work_date=yesterday,
            start_time=datetime(2026, 10, 9, 9, 0, tzinfo=timezone.utc),
            end_time=datetime(2026, 10, 9, 15, 0, tzinfo=timezone.utc),
        )

        # Create today session (8 hours gross = 28800s, 1 hour break = 3600s, net = 25200s)
        session_today = AttendanceSession.objects.create(
            user=self.user,
            status=AttendanceSession.STATUS_COMPLETED,
            work_date=self.today,
            start_time=datetime(2026, 10, 10, 9, 0, tzinfo=timezone.utc),
            end_time=datetime(2026, 10, 10, 17, 0, tzinfo=timezone.utc),
        )
        BreakSession.objects.create(
            session=session_today,
            user=self.user,
            start_time=datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc),
            end_time=datetime(2026, 10, 10, 13, 0, tzinfo=timezone.utc),
        )

        # Today activity
        act = Activity.objects.create(user=self.user, name='Coding', category='Development', color='#3B82F6')
        ActivityEntry.objects.create(
            user=self.user,
            activity=act,
            work_date=self.today,
            start_time=datetime(2026, 10, 10, 10, 0, tzinfo=timezone.utc),
            end_time=datetime(2026, 10, 10, 11, 30, tzinfo=timezone.utc),
            duration_seconds=5400,
        )

        resp = self.client.get('/api/v1/reports/daily/?date=2026-10-10')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        att = resp.data['attendance']
        self.assertEqual(att['gross_duration_seconds'], 28800)
        self.assertEqual(att['break_duration_seconds'], 3600)
        self.assertEqual(att['net_duration_seconds'], 25200)

        acts = resp.data['activities']
        self.assertEqual(acts['total_duration_seconds'], 5400)
        self.assertEqual(len(acts['by_category']), 1)
        self.assertEqual(acts['by_category'][0]['category'], 'Development')

        trends = resp.data['trends']
        # Today net (25200) - Yesterday net (21600) = +3600
        self.assertEqual(trends['net_office_diff_seconds'], 3600)
