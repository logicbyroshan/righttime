import uuid
from datetime import datetime, date
from dateutil import parser
from django.db import transaction
from django.utils import timezone
from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.sync.models import SyncLog
from apps.attendance.models import (
    AttendanceSession,
    BreakSession,
    AttendanceEvent,
    AttendanceCorrection,
)
from apps.attendance.serializers import AttendanceSessionSerializer
from apps.activities.models import Activity, ActivityEntry
from apps.activities.serializers import ActivitySerializer, ActivityEntrySerializer
from apps.habits.models import Habit, HabitCompletion
from apps.habits.serializers import HabitSerializer, HabitCompletionSerializer


def parse_dt(val):
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    try:
        return parser.isoparse(val)
    except Exception:
        return None


def parse_date(val):
    if not val:
        return None
    if isinstance(val, date):
        return val
    try:
        if isinstance(val, str) and 'T' in val:
            return parser.isoparse(val).date()
        return date.fromisoformat(str(val)[:10])
    except Exception:
        return None


class SyncView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        data = request.data
        user = request.user
        device_id = data.get('device_id', '')
        last_sync_str = data.get('last_sync_timestamp')
        last_sync_dt = parse_dt(last_sync_str)

        counts = {
            'attendance_sessions': 0,
            'attendance_events': 0,
            'break_sessions': 0,
            'attendance_corrections': 0,
            'activities': 0,
            'activity_entries': 0,
            'habits': 0,
            'habit_completions': 0,
        }

        # 1. Activities upsert
        for act_data in data.get('activities', []):
            act_id = act_data.get('id')
            if not act_id:
                continue
            activity, created = Activity.objects.get_or_create(
                id=act_id,
                user=user,
                defaults={
                    'name': act_data.get('name', 'Untitled'),
                    'category': act_data.get('category', 'General'),
                    'color': act_data.get('color', '#3B82F6'),
                    'is_archived': act_data.get('is_archived', False),
                    'is_deleted': act_data.get('is_deleted', False),
                }
            )
            if not created:
                activity.name = act_data.get('name', activity.name)
                activity.category = act_data.get('category', activity.category)
                activity.color = act_data.get('color', activity.color)
                activity.is_archived = act_data.get('is_archived', activity.is_archived)
                activity.is_deleted = act_data.get('is_deleted', activity.is_deleted)
                activity.save()
            counts['activities'] += 1

        # 2. Activity entries upsert
        for ent_data in data.get('activity_entries', []):
            ent_id = ent_data.get('id')
            act_id = ent_data.get('activity') or ent_data.get('activity_id')
            if not ent_id or not act_id:
                continue
            activity = Activity.objects.filter(id=act_id, user=user).first()
            if not activity:
                continue

            start_time = parse_dt(ent_data.get('start_time')) or timezone.now()
            end_time = parse_dt(ent_data.get('end_time'))
            work_date = parse_date(ent_data.get('work_date')) or start_time.date()
            duration_seconds = ent_data.get('duration_seconds', 0)
            is_running = ent_data.get('is_running', False)
            notes = ent_data.get('notes', '')
            is_deleted = ent_data.get('is_deleted', False)

            entry, created = ActivityEntry.objects.get_or_create(
                id=ent_id,
                user=user,
                defaults={
                    'activity': activity,
                    'start_time': start_time,
                    'end_time': end_time,
                    'duration_seconds': duration_seconds,
                    'work_date': work_date,
                    'notes': notes,
                    'is_running': is_running,
                    'is_deleted': is_deleted,
                }
            )
            if not created:
                entry.activity = activity
                entry.start_time = start_time
                entry.end_time = end_time
                entry.duration_seconds = duration_seconds
                entry.work_date = work_date
                entry.notes = notes
                entry.is_running = is_running
                entry.is_deleted = is_deleted
                entry.save()
            counts['activity_entries'] += 1

        # 3. Attendance Sessions upsert
        for sess_data in data.get('attendance_sessions', []):
            s_id = sess_data.get('id')
            if not s_id:
                continue
            start_time = parse_dt(sess_data.get('start_time')) or timezone.now()
            end_time = parse_dt(sess_data.get('end_time'))
            work_date = parse_date(sess_data.get('work_date')) or start_time.date()
            status_val = sess_data.get('status', AttendanceSession.STATUS_IN_PROGRESS)
            notes = sess_data.get('notes', '')
            is_incomplete = sess_data.get('is_incomplete', False)
            is_corrected = sess_data.get('is_corrected', False)
            is_deleted = sess_data.get('is_deleted', False)

            session, created = AttendanceSession.objects.get_or_create(
                id=s_id,
                user=user,
                defaults={
                    'status': status_val,
                    'start_time': start_time,
                    'end_time': end_time,
                    'work_date': work_date,
                    'notes': notes,
                    'is_incomplete': is_incomplete,
                    'is_corrected': is_corrected,
                    'is_deleted': is_deleted,
                }
            )
            if not created:
                session.status = status_val
                session.start_time = start_time
                session.end_time = end_time
                session.work_date = work_date
                session.notes = notes
                session.is_incomplete = is_incomplete
                session.is_corrected = is_corrected
                session.is_deleted = is_deleted
                session.save()
            counts['attendance_sessions'] += 1

        # 4. Break Sessions upsert
        for brk_data in data.get('break_sessions', []):
            b_id = brk_data.get('id')
            s_id = brk_data.get('session') or brk_data.get('session_id')
            if not b_id or not s_id:
                continue
            session = AttendanceSession.objects.filter(id=s_id, user=user).first()
            if not session:
                continue
            start_time = parse_dt(brk_data.get('start_time')) or timezone.now()
            end_time = parse_dt(brk_data.get('end_time'))
            notes = brk_data.get('notes', '')
            is_deleted = brk_data.get('is_deleted', False)

            brk, created = BreakSession.objects.get_or_create(
                id=b_id,
                user=user,
                defaults={
                    'session': session,
                    'start_time': start_time,
                    'end_time': end_time,
                    'notes': notes,
                    'is_deleted': is_deleted,
                }
            )
            if not created:
                brk.start_time = start_time
                brk.end_time = end_time
                brk.notes = notes
                brk.is_deleted = is_deleted
                brk.save()
            counts['break_sessions'] += 1

        # 5. Attendance Events upsert
        for ev_data in data.get('attendance_events', []):
            e_id = ev_data.get('id')
            s_id = ev_data.get('session') or ev_data.get('session_id')
            if not e_id or not s_id:
                continue
            session = AttendanceSession.objects.filter(id=s_id, user=user).first()
            if not session:
                continue
            AttendanceEvent.objects.get_or_create(
                id=e_id,
                user=user,
                defaults={
                    'session': session,
                    'event_type': ev_data.get('event_type'),
                    'timestamp': parse_dt(ev_data.get('timestamp')) or timezone.now(),
                    'notes': ev_data.get('notes', ''),
                }
            )
            counts['attendance_events'] += 1

        # 6. Attendance Corrections upsert
        for corr_data in data.get('attendance_corrections', []):
            c_id = corr_data.get('id')
            s_id = corr_data.get('session') or corr_data.get('session_id')
            if not c_id or not s_id:
                continue
            session = AttendanceSession.objects.filter(id=s_id, user=user).first()
            if not session:
                continue
            AttendanceCorrection.objects.get_or_create(
                id=c_id,
                user=user,
                defaults={
                    'session': session,
                    'reason': corr_data.get('reason', ''),
                    'field_name': corr_data.get('field_name', ''),
                    'old_value': corr_data.get('old_value', ''),
                    'new_value': corr_data.get('new_value', ''),
                }
            )
            counts['attendance_corrections'] += 1

        # 7. Habits upsert
        for hab_data in data.get('habits', []):
            h_id = hab_data.get('id')
            if not h_id:
                continue
            habit, created = Habit.objects.get_or_create(
                id=h_id,
                user=user,
                defaults={
                    'name': hab_data.get('name', 'Untitled'),
                    'description': hab_data.get('description', ''),
                    'target_count': hab_data.get('target_count', 1),
                    'unit': hab_data.get('unit', 'times'),
                    'color': hab_data.get('color', '#10B981'),
                    'is_archived': hab_data.get('is_archived', False),
                    'is_deleted': hab_data.get('is_deleted', False),
                }
            )
            if not created:
                habit.name = hab_data.get('name', habit.name)
                habit.description = hab_data.get('description', habit.description)
                habit.target_count = hab_data.get('target_count', habit.target_count)
                habit.unit = hab_data.get('unit', habit.unit)
                habit.color = hab_data.get('color', habit.color)
                habit.is_archived = hab_data.get('is_archived', habit.is_archived)
                habit.is_deleted = hab_data.get('is_deleted', habit.is_deleted)
                habit.save()
            counts['habits'] += 1

        # 8. Habit Completions upsert
        for comp_data in data.get('habit_completions', []):
            c_id = comp_data.get('id')
            h_id = comp_data.get('habit') or comp_data.get('habit_id')
            local_date = parse_date(comp_data.get('local_date'))
            if not c_id or not h_id or not local_date:
                continue
            habit = Habit.objects.filter(id=h_id, user=user).first()
            if not habit:
                continue
            completed = comp_data.get('completed', True)
            count = comp_data.get('count', 1)
            notes = comp_data.get('notes', '')
            is_deleted = comp_data.get('is_deleted', False)

            comp, created = HabitCompletion.objects.get_or_create(
                user=user,
                habit=habit,
                local_date=local_date,
                defaults={
                    'id': c_id,
                    'completed': completed,
                    'count': count,
                    'notes': notes,
                    'is_deleted': is_deleted,
                }
            )
            if not created:
                comp.completed = completed
                comp.count = count
                comp.notes = notes
                comp.is_deleted = is_deleted
                comp.save()
            counts['habit_completions'] += 1

        total_received = sum(counts.values())

        # Record SyncLog
        SyncLog.objects.create(
            user=user,
            device_id=device_id,
            client_sync_time=last_sync_dt,
            server_sync_time=timezone.now(),
            records_received=total_received,
            records_applied=total_received,
            status='SUCCESS',
            details=counts
        )

        # Retrieve server changes if last_sync_dt is provided
        server_changes = {}
        if last_sync_dt:
            server_changes = {
                'attendance_sessions': AttendanceSessionSerializer(
                    AttendanceSession.objects.filter(user=user, updated_at__gt=last_sync_dt), many=True
                ).data,
                'activities': ActivitySerializer(
                    Activity.objects.filter(user=user, updated_at__gt=last_sync_dt), many=True
                ).data,
                'activity_entries': ActivityEntrySerializer(
                    ActivityEntry.objects.filter(user=user, updated_at__gt=last_sync_dt), many=True
                ).data,
                'habits': HabitSerializer(
                    Habit.objects.filter(user=user, updated_at__gt=last_sync_dt), many=True
                ).data,
                'habit_completions': HabitCompletionSerializer(
                    HabitCompletion.objects.filter(user=user, updated_at__gt=last_sync_dt), many=True
                ).data,
            }

        return Response({
            'status': 'success',
            'server_time': timezone.now().isoformat(),
            'processed_counts': counts,
            'server_changes': server_changes,
        }, status=status.HTTP_200_OK)
