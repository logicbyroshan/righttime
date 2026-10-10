import uuid
from django.db import transaction
from django.utils import timezone
from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from apps.activities.models import Activity, ActivityEntry
from apps.activities.serializers import (
    ActivitySerializer,
    ActivityEntrySerializer,
    ActivityEntryCreateUpdateSerializer,
)


class ActivityListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = Activity.objects.filter(user=request.user, is_deleted=False)
        include_archived = request.query_params.get('include_archived', 'false').lower() == 'true'
        if not include_archived:
            qs = qs.filter(is_archived=False)
        serializer = ActivitySerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        data = request.data.copy()
        act_id = data.get('id') or uuid.uuid4()
        existing = Activity.objects.filter(id=act_id, user=request.user).first()
        if existing:
            serializer = ActivitySerializer(existing, data=data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        serializer = ActivitySerializer(data=data)
        if serializer.is_valid():
            serializer.save(id=act_id, user=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ActivityDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        act = Activity.objects.filter(pk=pk, user=request.user, is_deleted=False).first()
        if not act:
            return Response({"status": "error", "message": "Activity not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ActivitySerializer(act).data)

    def put(self, request, pk):
        act = Activity.objects.filter(pk=pk, user=request.user).first()
        if not act:
            return Response({"status": "error", "message": "Activity not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ActivitySerializer(act, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        act = Activity.objects.filter(pk=pk, user=request.user).first()
        if not act:
            return Response({"status": "error", "message": "Activity not found."}, status=status.HTTP_404_NOT_FOUND)
        act.is_deleted = True
        act.save()
        return Response({"status": "success", "message": "Activity deleted."}, status=status.HTTP_204_NO_CONTENT)


class ActivityEntryListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = ActivityEntry.objects.filter(user=request.user, is_deleted=False)
        work_date = request.query_params.get('date')
        if work_date:
            qs = qs.filter(work_date=work_date)
        activity_id = request.query_params.get('activity_id')
        if activity_id:
            qs = qs.filter(activity_id=activity_id)
        is_running = request.query_params.get('is_running')
        if is_running is not None:
            qs = qs.filter(is_running=is_running.lower() == 'true')

        serializer = ActivityEntrySerializer(qs, many=True)
        return Response(serializer.data)

    @transaction.atomic
    def post(self, request):
        data = request.data.copy()
        entry_id = data.get('id') or uuid.uuid4()
        is_running = data.get('is_running', False)
        if isinstance(is_running, str):
            is_running = is_running.lower() == 'true'

        # Check if already exists (idempotent upsert)
        existing = ActivityEntry.objects.filter(id=entry_id, user=request.user).first()
        if existing:
            serializer = ActivityEntryCreateUpdateSerializer(existing, data=data, partial=True)
            if serializer.is_valid():
                saved = serializer.save()
                return Response(ActivityEntrySerializer(saved).data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Overlapping active timers check
        if is_running:
            active_existing = ActivityEntry.objects.filter(
                user=request.user,
                is_running=True,
                is_deleted=False
            ).first()
            if active_existing:
                return Response(
                    {"status": "error", "message": "Another activity timer is already running."},
                    status=status.HTTP_400_BAD_REQUEST
                )

        serializer = ActivityEntryCreateUpdateSerializer(data=data)
        if serializer.is_valid():
            # Validate activity ownership
            act_id = serializer.validated_data['activity'].id
            activity = Activity.objects.filter(id=act_id, user=request.user).first()
            if not activity:
                return Response(
                    {"status": "error", "message": "Invalid activity or activity does not belong to you."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            work_date = serializer.validated_data.get('work_date')
            if not work_date:
                start_time = serializer.validated_data.get('start_time') or timezone.now()
                work_date = start_time.date()

            saved = serializer.save(id=entry_id, user=request.user, work_date=work_date)
            return Response(ActivityEntrySerializer(saved).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ActivityEntryDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        entry = ActivityEntry.objects.filter(pk=pk, user=request.user, is_deleted=False).first()
        if not entry:
            return Response({"status": "error", "message": "Activity entry not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ActivityEntrySerializer(entry).data)

    def put(self, request, pk):
        entry = ActivityEntry.objects.filter(pk=pk, user=request.user).first()
        if not entry:
            return Response({"status": "error", "message": "Activity entry not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ActivityEntryCreateUpdateSerializer(entry, data=request.data, partial=True)
        if serializer.is_valid():
            saved = serializer.save()
            return Response(ActivityEntrySerializer(saved).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        entry = ActivityEntry.objects.filter(pk=pk, user=request.user).first()
        if not entry:
            return Response({"status": "error", "message": "Activity entry not found."}, status=status.HTTP_404_NOT_FOUND)
        entry.is_deleted = True
        entry.save()
        return Response({"status": "success", "message": "Activity entry deleted."}, status=status.HTTP_204_NO_CONTENT)
