from django.urls import path
from apps.core.views import HealthCheckView, AuthTokenView, UserPreferencesView
from apps.attendance.views import (
    AttendanceSessionListCreateView,
    AttendanceSessionDetailView,
    ProcessAttendanceEventView,
    CorrectAttendanceSessionView,
    PendingSuggestionListCreateView,
    PendingSuggestionDetailView,
)
from apps.activities.views import (
    ActivityListCreateView,
    ActivityDetailView,
    ActivityEntryListCreateView,
    ActivityEntryDetailView,
)
from apps.habits.views import (
    HabitListCreateView,
    HabitDetailView,
    HabitCompletionListCreateView,
    HabitCompletionDetailView,
)
from apps.reports.views import DailyReportView, WeeklyReportView, MonthlyReportView
from apps.sync.views import SyncView

urlpatterns = [
    # Core & Health
    path('health/', HealthCheckView.as_view(), name='api-health'),
    path('auth/token/', AuthTokenView.as_view(), name='api-auth-token'),
    path('preferences/', UserPreferencesView.as_view(), name='api-preferences'),

    # Attendance
    path('attendance/', AttendanceSessionListCreateView.as_view(), name='api-attendance-list'),
    path('attendance/<uuid:pk>/', AttendanceSessionDetailView.as_view(), name='api-attendance-detail'),
    path('attendance/events/', ProcessAttendanceEventView.as_view(), name='api-attendance-events'),
    path('attendance/<uuid:pk>/correct/', CorrectAttendanceSessionView.as_view(), name='api-attendance-correct'),
    path('attendance/suggestions/', PendingSuggestionListCreateView.as_view(), name='api-attendance-suggestions-list'),
    path('attendance/suggestions/<uuid:pk>/', PendingSuggestionDetailView.as_view(), name='api-attendance-suggestions-detail'),

    # Activities
    path('activities/', ActivityListCreateView.as_view(), name='api-activities-list'),
    path('activities/<uuid:pk>/', ActivityDetailView.as_view(), name='api-activities-detail'),
    path('activities/entries/', ActivityEntryListCreateView.as_view(), name='api-activities-entries-list'),
    path('activities/entries/<uuid:pk>/', ActivityEntryDetailView.as_view(), name='api-activities-entries-detail'),

    # Habits
    path('habits/', HabitListCreateView.as_view(), name='api-habits-list'),
    path('habits/<uuid:pk>/', HabitDetailView.as_view(), name='api-habits-detail'),
    path('habits/completions/', HabitCompletionListCreateView.as_view(), name='api-habits-completions-list'),
    path('habits/completions/<uuid:pk>/', HabitCompletionDetailView.as_view(), name='api-habits-completions-detail'),

    # Reports
    path('reports/daily/', DailyReportView.as_view(), name='api-reports-daily'),
    path('reports/weekly/', WeeklyReportView.as_view(), name='api-reports-weekly'),
    path('reports/monthly/', MonthlyReportView.as_view(), name='api-reports-monthly'),

    # Synchronization
    path('sync/', SyncView.as_view(), name='api-sync'),
]
