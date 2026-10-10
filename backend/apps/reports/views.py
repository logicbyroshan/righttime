from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Sum
from apps.attendance.models import AttendanceSession
from apps.activities.models import Activity, ActivityEntry
from apps.habits.models import Habit, HabitCompletion
from apps.habits.streaks import calculate_habit_streaks


def get_attendance_metrics(user, start_date, end_date):
    sessions = AttendanceSession.objects.filter(
        user=user,
        work_date__gte=start_date,
        work_date__lte=end_date,
        is_deleted=False
    )
    gross_seconds = 0
    break_seconds = 0
    net_seconds = 0
    completed_count = 0
    incomplete_count = 0

    for s in sessions:
        gross_seconds += s.gross_duration_seconds
        break_seconds += s.total_break_seconds
        net_seconds += s.net_duration_seconds
        if s.status == AttendanceSession.STATUS_COMPLETED:
            completed_count += 1
        else:
            incomplete_count += 1

    return {
        'session_count': sessions.count(),
        'completed_count': completed_count,
        'incomplete_count': incomplete_count,
        'gross_duration_seconds': gross_seconds,
        'break_duration_seconds': break_seconds,
        'net_duration_seconds': net_seconds,
    }


def get_activity_metrics(user, start_date, end_date):
    entries = ActivityEntry.objects.filter(
        user=user,
        work_date__gte=start_date,
        work_date__lte=end_date,
        is_deleted=False
    ).select_related('activity')

    total_seconds = 0
    cat_map = {}
    act_map = {}

    for e in entries:
        dur = e.duration_seconds
        total_seconds += dur
        cat = e.activity.category or 'General'
        cat_map[cat] = cat_map.get(cat, 0) + dur

        aid = str(e.activity.id)
        if aid not in act_map:
            act_map[aid] = {
                'id': aid,
                'name': e.activity.name,
                'category': cat,
                'color': e.activity.color,
                'duration_seconds': 0,
                'entry_count': 0,
            }
        act_map[aid]['duration_seconds'] += dur
        act_map[aid]['entry_count'] += 1

    by_category = [
        {
            'category': k,
            'duration_seconds': v,
            'percentage': round((v / total_seconds * 100), 1) if total_seconds > 0 else 0
        }
        for k, v in sorted(cat_map.items(), key=lambda x: x[1], reverse=True)
    ]

    by_activity = sorted(act_map.values(), key=lambda x: x['duration_seconds'], reverse=True)

    return {
        'total_duration_seconds': total_seconds,
        'by_category': by_category,
        'by_activity': by_activity,
    }


def get_habit_metrics(user, start_date, end_date, ref_date=None):
    habits = Habit.objects.filter(user=user, is_deleted=False, is_archived=False)
    total_habits = habits.count()

    # Calculate days in interval
    delta_days = (end_date - start_date).days + 1
    total_possible = total_habits * delta_days

    completions = HabitCompletion.objects.filter(
        user=user,
        local_date__gte=start_date,
        local_date__lte=end_date,
        completed=True,
        is_deleted=False
    )
    completed_count = completions.count()
    completion_rate = round((completed_count / total_possible * 100), 1) if total_possible > 0 else 0

    habit_items = []
    for h in habits:
        streak_info = calculate_habit_streaks(h, today=ref_date or end_date)
        period_completions = completions.filter(habit=h).count()
        habit_items.append({
            'id': str(h.id),
            'name': h.name,
            'color': h.color,
            'current_streak': streak_info['current_streak'],
            'best_streak': streak_info['best_streak'],
            'period_completions': period_completions,
            'target_days': delta_days,
            'rate': round((period_completions / delta_days * 100), 1) if delta_days > 0 else 0,
        })

    return {
        'total_habits': total_habits,
        'completed_count': completed_count,
        'total_possible': total_possible,
        'completion_rate': completion_rate,
        'habits': habit_items,
    }


class DailyReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        date_str = request.query_params.get('date')
        if date_str:
            try:
                target_date = date.fromisoformat(date_str)
            except ValueError:
                target_date = date.today()
        else:
            target_date = date.today()

        prev_date = target_date - timedelta(days=1)

        current_att = get_attendance_metrics(request.user, target_date, target_date)
        prev_att = get_attendance_metrics(request.user, prev_date, prev_date)

        current_act = get_activity_metrics(request.user, target_date, target_date)
        prev_act = get_activity_metrics(request.user, prev_date, prev_date)

        current_hab = get_habit_metrics(request.user, target_date, target_date, ref_date=target_date)
        prev_hab = get_habit_metrics(request.user, prev_date, prev_date, ref_date=prev_date)

        trends = {
            'net_office_diff_seconds': current_att['net_duration_seconds'] - prev_att['net_duration_seconds'],
            'activity_diff_seconds': current_act['total_duration_seconds'] - prev_act['total_duration_seconds'],
            'habit_rate_diff': round(current_hab['completion_rate'] - prev_hab['completion_rate'], 1),
        }

        return Response({
            'period': 'daily',
            'date': str(target_date),
            'previous_date': str(prev_date),
            'attendance': current_att,
            'activities': current_act,
            'habits': current_hab,
            'trends': trends,
        })


class WeeklyReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        date_str = request.query_params.get('start_date') or request.query_params.get('date')
        if date_str:
            try:
                ref_date = date.fromisoformat(date_str)
            except ValueError:
                ref_date = date.today()
        else:
            ref_date = date.today()

        # Start of week (Monday)
        start_date = ref_date - timedelta(days=ref_date.weekday())
        end_date = start_date + timedelta(days=6)

        prev_start = start_date - timedelta(days=7)
        prev_end = start_date - timedelta(days=1)

        current_att = get_attendance_metrics(request.user, start_date, end_date)
        prev_att = get_attendance_metrics(request.user, prev_start, prev_end)

        current_act = get_activity_metrics(request.user, start_date, end_date)
        prev_act = get_activity_metrics(request.user, prev_start, prev_end)

        current_hab = get_habit_metrics(request.user, start_date, end_date, ref_date=end_date)
        prev_hab = get_habit_metrics(request.user, prev_start, prev_end, ref_date=prev_end)

        trends = {
            'net_office_diff_seconds': current_att['net_duration_seconds'] - prev_att['net_duration_seconds'],
            'activity_diff_seconds': current_act['total_duration_seconds'] - prev_act['total_duration_seconds'],
            'habit_rate_diff': round(current_hab['completion_rate'] - prev_hab['completion_rate'], 1),
        }

        return Response({
            'period': 'weekly',
            'start_date': str(start_date),
            'end_date': str(end_date),
            'previous_start_date': str(prev_start),
            'previous_end_date': str(prev_end),
            'attendance': current_att,
            'activities': current_act,
            'habits': current_hab,
            'trends': trends,
        })


class MonthlyReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        month_str = request.query_params.get('month') or request.query_params.get('date')
        today = date.today()
        if month_str:
            try:
                if len(month_str) == 7:  # YYYY-MM
                    start_date = date.fromisoformat(f"{month_str}-01")
                else:
                    d = date.fromisoformat(month_str)
                    start_date = date(d.year, d.month, 1)
            except ValueError:
                start_date = date(today.year, today.month, 1)
        else:
            start_date = date(today.year, today.month, 1)

        next_month = start_date + relativedelta(months=1)
        end_date = next_month - timedelta(days=1)

        prev_start = start_date - relativedelta(months=1)
        prev_end = start_date - timedelta(days=1)

        current_att = get_attendance_metrics(request.user, start_date, end_date)
        prev_att = get_attendance_metrics(request.user, prev_start, prev_end)

        current_act = get_activity_metrics(request.user, start_date, end_date)
        prev_act = get_activity_metrics(request.user, prev_start, prev_end)

        current_hab = get_habit_metrics(request.user, start_date, end_date, ref_date=end_date)
        prev_hab = get_habit_metrics(request.user, prev_start, prev_end, ref_date=prev_end)

        trends = {
            'net_office_diff_seconds': current_att['net_duration_seconds'] - prev_att['net_duration_seconds'],
            'activity_diff_seconds': current_act['total_duration_seconds'] - prev_act['total_duration_seconds'],
            'habit_rate_diff': round(current_hab['completion_rate'] - prev_hab['completion_rate'], 1),
        }

        return Response({
            'period': 'monthly',
            'month': start_date.strftime('%Y-%m'),
            'start_date': str(start_date),
            'end_date': str(end_date),
            'previous_month': prev_start.strftime('%Y-%m'),
            'previous_start_date': str(prev_start),
            'previous_end_date': str(prev_end),
            'attendance': current_att,
            'activities': current_act,
            'habits': current_hab,
            'trends': trends,
        })
