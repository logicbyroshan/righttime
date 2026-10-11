import uuid
from django.db import transaction
from django.utils import timezone
from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from apps.attendance.models import (
    AttendanceSession,
    BreakSession,
    AttendanceEvent,
    AttendanceCorrection,
    PendingSuggestion,
)
from apps.attendance.serializers import (
    AttendanceSessionSerializer,
    ProcessAttendanceEventSerializer,
    CorrectionRequestSerializer,
    PendingSuggestionSerializer,
)


class AttendanceSessionListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = AttendanceSession.objects.filter(user=request.user, is_deleted=False)
        work_date = request.query_params.get('date')
        if work_date:
            qs = qs.filter(work_date=work_date)
        status_param = request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        if start_date:
            qs = qs.filter(work_date__gte=start_date)
        if end_date:
            qs = qs.filter(work_date__lte=end_date)

        serializer = AttendanceSessionSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        # Allow creating session directly (used in offline sync / direct creation)
        data = request.data.copy()
        session_id = data.get('id') or uuid.uuid4()
        start_time = data.get('start_time') or timezone.now()
        work_date = data.get('work_date')
        if not work_date:
            work_date = timezone.localdate() if hasattr(timezone, 'localdate') else timezone.now().date()

        # Idempotent check
        existing = AttendanceSession.objects.filter(id=session_id, user=request.user).first()
        if existing:
            return Response(AttendanceSessionSerializer(existing).data, status=status.HTTP_200_OK)

        session = AttendanceSession.objects.create(
            id=session_id,
            user=request.user,
            status=data.get('status', AttendanceSession.STATUS_IN_PROGRESS),
            start_time=start_time,
            end_time=data.get('end_time'),
            work_date=work_date,
            notes=data.get('notes', ''),
            is_incomplete=data.get('is_incomplete', False),
            is_corrected=data.get('is_corrected', False),
        )
        return Response(AttendanceSessionSerializer(session).data, status=status.HTTP_201_CREATED)


class AttendanceSessionDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        session = AttendanceSession.objects.filter(pk=pk, user=request.user, is_deleted=False).first()
        if not session:
            return Response({"status": "error", "message": "Attendance session not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(AttendanceSessionSerializer(session).data)


class ProcessAttendanceEventView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = ProcessAttendanceEventSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        event_id = data.get('id') or uuid.uuid4()
        event_type = data['event_type']
        event_time = data.get('timestamp') or timezone.now()
        notes = data.get('notes', '')
        user = request.user

        # Idempotency check: if event with this id was already processed for this user
        existing_event = AttendanceEvent.objects.filter(id=event_id, user=user).first()
        if existing_event:
            return Response({
                "status": "success",
                "message": "Event already processed (idempotent).",
                "session": AttendanceSessionSerializer(existing_event.session).data
            }, status=status.HTTP_200_OK)

        active_session = AttendanceSession.objects.filter(
            user=user,
            status=AttendanceSession.STATUS_IN_PROGRESS,
            is_deleted=False
        ).first()

        if event_type == AttendanceEvent.EVENT_CHECK_IN:
            if active_session:
                return Response(
                    {"status": "error", "message": "An office session is already active."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            work_date = data.get('work_date') or event_time.date()
            source = data.get('source', 'MANUAL')
            detected_at = data.get('detected_at')
            confirmed_at = data.get('confirmed_at')
            network_match = data.get('network_match', True)
            session = AttendanceSession.objects.create(
                user=user,
                status=AttendanceSession.STATUS_IN_PROGRESS,
                start_time=event_time,
                work_date=work_date,
                notes=notes,
                source=source,
                detected_at=detected_at,
                confirmed_at=confirmed_at,
                network_match=network_match,
            )
            AttendanceEvent.objects.create(
                id=event_id,
                session=session,
                user=user,
                event_type=event_type,
                timestamp=event_time,
                notes=notes,
                source=source,
                detected_at=detected_at,
                confirmed_at=confirmed_at,
                network_match=network_match,
            )
            return Response({
                "status": "success",
                "session": AttendanceSessionSerializer(session).data
            }, status=status.HTTP_201_CREATED)

        elif event_type == AttendanceEvent.EVENT_START_BREAK:
            if not active_session:
                return Response(
                    {"status": "error", "message": "No active office session found."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            open_break = active_session.breaks.filter(end_time__isnull=True, is_deleted=False).first()
            if open_break:
                return Response(
                    {"status": "error", "message": "A break is already active."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            BreakSession.objects.create(
                session=active_session,
                user=user,
                start_time=event_time,
                notes=notes,
            )
            AttendanceEvent.objects.create(
                id=event_id,
                session=active_session,
                user=user,
                event_type=event_type,
                timestamp=event_time,
                notes=notes,
            )
            return Response({
                "status": "success",
                "session": AttendanceSessionSerializer(active_session).data
            }, status=status.HTTP_200_OK)

        elif event_type == AttendanceEvent.EVENT_END_BREAK:
            if not active_session:
                return Response(
                    {"status": "error", "message": "No active office session found."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            open_break = active_session.breaks.filter(end_time__isnull=True, is_deleted=False).first()
            if not open_break:
                return Response(
                    {"status": "error", "message": "No active break found to end."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            open_break.end_time = event_time
            if notes:
                open_break.notes = f"{open_break.notes} {notes}".strip()
            open_break.save()

            AttendanceEvent.objects.create(
                id=event_id,
                session=active_session,
                user=user,
                event_type=event_type,
                timestamp=event_time,
                notes=notes,
            )
            return Response({
                "status": "success",
                "session": AttendanceSessionSerializer(active_session).data
            }, status=status.HTTP_200_OK)

        elif event_type == AttendanceEvent.EVENT_CHECK_OUT:
            if not active_session:
                return Response(
                    {"status": "error", "message": "No active office session found to check out."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            open_break = active_session.breaks.filter(end_time__isnull=True, is_deleted=False).first()
            if open_break:
                return Response(
                    {"status": "error", "message": "A break is currently open. Please end the break explicitly before checking out."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            source = data.get('source', 'MANUAL')
            detected_at = data.get('detected_at')
            confirmed_at = data.get('confirmed_at')
            network_match = data.get('network_match', True)
            active_session.end_time = event_time
            active_session.status = AttendanceSession.STATUS_COMPLETED
            if notes:
                active_session.notes = f"{active_session.notes} {notes}".strip()
            if source != 'MANUAL':
                active_session.source = source
            if confirmed_at:
                active_session.confirmed_at = confirmed_at
            active_session.save()

            AttendanceEvent.objects.create(
                id=event_id,
                session=active_session,
                user=user,
                event_type=event_type,
                timestamp=event_time,
                notes=notes,
                source=source,
                detected_at=detected_at,
                confirmed_at=confirmed_at,
                network_match=network_match,
            )
            return Response({
                "status": "success",
                "session": AttendanceSessionSerializer(active_session).data
            }, status=status.HTTP_200_OK)

        return Response({"status": "error", "message": "Unknown event type."}, status=status.HTTP_400_BAD_REQUEST)


class CorrectAttendanceSessionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        session = AttendanceSession.objects.filter(pk=pk, user=request.user, is_deleted=False).first()
        if not session:
            return Response({"status": "error", "message": "Attendance session not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = CorrectionRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        reason = data['reason']

        if 'start_time' in data and data['start_time']:
            old_val = str(session.start_time)
            session.start_time = data['start_time']
            AttendanceCorrection.objects.create(
                session=session,
                user=request.user,
                reason=reason,
                field_name='start_time',
                old_value=old_val,
                new_value=str(session.start_time),
            )

        if 'end_time' in data:
            old_val = str(session.end_time) if session.end_time else 'None'
            session.end_time = data['end_time']
            if session.end_time:
                session.status = AttendanceSession.STATUS_COMPLETED
            AttendanceCorrection.objects.create(
                session=session,
                user=request.user,
                reason=reason,
                field_name='end_time',
                old_value=old_val,
                new_value=str(session.end_time),
            )

        if 'notes' in data and data['notes'] is not None:
            old_val = session.notes
            session.notes = data['notes']
            AttendanceCorrection.objects.create(
                session=session,
                user=request.user,
                reason=reason,
                field_name='notes',
                old_value=old_val,
                new_value=session.notes,
            )

        session.is_corrected = True
        session.save()

        # Also log a correction event
        AttendanceEvent.objects.create(
            session=session,
            user=request.user,
            event_type=AttendanceEvent.EVENT_CORRECTION,
            timestamp=timezone.now(),
            notes=f"Correction: {reason}",
        )

        return Response(AttendanceSessionSerializer(session).data)


class PendingSuggestionListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = PendingSuggestion.objects.filter(user=request.user, is_deleted=False)
        status_param = request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        serializer = PendingSuggestionSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        data = request.data.copy()
        s_id = data.get('id') or uuid.uuid4()
        existing = PendingSuggestion.objects.filter(id=s_id, user=request.user).first()
        if existing:
            return Response(PendingSuggestionSerializer(existing).data, status=status.HTTP_200_OK)

        serializer = PendingSuggestionSerializer(data=data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        suggestion = PendingSuggestion.objects.create(
            id=s_id,
            user=request.user,
            event_type=serializer.validated_data['event_type'],
            detected_at=serializer.validated_data['detected_at'],
            source=serializer.validated_data.get('source', 'WIFI_AUTO'),
            network_match=serializer.validated_data.get('network_match', True),
            status=serializer.validated_data.get('status', PendingSuggestion.STATUS_PENDING),
            notes=serializer.validated_data.get('notes', ''),
        )
        return Response(PendingSuggestionSerializer(suggestion).data, status=status.HTTP_201_CREATED)


class PendingSuggestionDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        suggestion = PendingSuggestion.objects.filter(pk=pk, user=request.user, is_deleted=False).first()
        if not suggestion:
            return Response({"status": "error", "message": "Suggestion not found."}, status=status.HTTP_404_NOT_FOUND)

        action = request.data.get('action')
        now = timezone.now()

        if action == 'confirm':
            if suggestion.status != PendingSuggestion.STATUS_PENDING:
                return Response(
                    {"status": "error", "message": f"Cannot confirm suggestion with status {suggestion.status}."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            active_session = AttendanceSession.objects.filter(
                user=request.user,
                status=AttendanceSession.STATUS_IN_PROGRESS,
                is_deleted=False
            ).first()

            if suggestion.event_type == PendingSuggestion.TYPE_ARRIVAL:
                if active_session:
                    return Response({"status": "error", "message": "An office session is already active."}, status=status.HTTP_400_BAD_REQUEST)
                session = AttendanceSession.objects.create(
                    user=request.user,
                    status=AttendanceSession.STATUS_IN_PROGRESS,
                    start_time=now,
                    work_date=now.date(),
                    notes=f"[Wi-Fi Suggestion] {suggestion.notes}".strip(),
                    source='WIFI_SUGGESTION',
                    detected_at=suggestion.detected_at,
                    confirmed_at=now,
                    network_match=suggestion.network_match,
                )
                AttendanceEvent.objects.create(
                    session=session,
                    user=request.user,
                    event_type=AttendanceEvent.EVENT_CHECK_IN,
                    timestamp=now,
                    notes="Confirmed from Wi-Fi arrival suggestion",
                    source='WIFI_SUGGESTION',
                    detected_at=suggestion.detected_at,
                    confirmed_at=now,
                    network_match=suggestion.network_match,
                )
            elif suggestion.event_type == PendingSuggestion.TYPE_DEPARTURE:
                if not active_session:
                    return Response({"status": "error", "message": "No active office session found to check out."}, status=status.HTTP_400_BAD_REQUEST)
                open_break = active_session.breaks.filter(end_time__isnull=True, is_deleted=False).first()
                if open_break:
                    return Response({"status": "error", "message": "A break is currently open. Please end your break before confirming departure."}, status=status.HTTP_400_BAD_REQUEST)
                active_session.status = AttendanceSession.STATUS_COMPLETED
                active_session.end_time = now
                active_session.source = 'WIFI_SUGGESTION'
                active_session.confirmed_at = now
                active_session.save()
                AttendanceEvent.objects.create(
                    session=active_session,
                    user=request.user,
                    event_type=AttendanceEvent.EVENT_CHECK_OUT,
                    timestamp=now,
                    notes="Confirmed from Wi-Fi departure suggestion",
                    source='WIFI_SUGGESTION',
                    detected_at=suggestion.detected_at,
                    confirmed_at=now,
                    network_match=suggestion.network_match,
                )

            suggestion.status = PendingSuggestion.STATUS_CONFIRMED
            suggestion.confirmed_at = now
            suggestion.save()

        elif action == 'dismiss':
            suggestion.status = PendingSuggestion.STATUS_DISMISSED
            suggestion.notes = request.data.get('reason', suggestion.notes)
            suggestion.save()

        elif action == 'snooze':
            suggestion.status = PendingSuggestion.STATUS_SNOOZED
            suggestion.notes = request.data.get('notes', suggestion.notes)
            suggestion.save()

        elif action == 'cancel':
            suggestion.status = PendingSuggestion.STATUS_CANCELLED
            suggestion.notes = request.data.get('reason', suggestion.notes)
            suggestion.save()

        else:
            return Response({"status": "error", "message": "Invalid action."}, status=status.HTTP_400_BAD_REQUEST)

        return Response(PendingSuggestionSerializer(suggestion).data)
