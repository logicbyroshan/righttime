import uuid
from datetime import date
from django.db import transaction
from django.utils import timezone
from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from apps.habits.models import Habit, HabitCompletion
from apps.habits.serializers import (
    HabitSerializer,
    HabitCompletionSerializer,
    HabitCompletionCreateSerializer,
)
from apps.habits.streaks import calculate_habit_streaks


class HabitListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = Habit.objects.filter(user=request.user, is_deleted=False)
        include_archived = request.query_params.get('include_archived', 'false').lower() == 'true'
        if not include_archived:
            qs = qs.filter(is_archived=False)

        ref_date = date.today()
        date_str = request.query_params.get('date')
        if date_str:
            try:
                ref_date = date.fromisoformat(date_str)
            except ValueError:
                pass

        results = []
        for h in qs:
            streak_data = calculate_habit_streaks(h, today=ref_date)
            data = HabitSerializer(h).data
            data.update(streak_data)
            results.append(data)

        return Response(results)

    def post(self, request):
        data = request.data.copy()
        habit_id = data.get('id') or uuid.uuid4()
        existing = Habit.objects.filter(id=habit_id, user=request.user).first()
        if existing:
            serializer = HabitSerializer(existing, data=data, partial=True)
            if serializer.is_valid():
                saved = serializer.save()
                streak_data = calculate_habit_streaks(saved)
                resp = HabitSerializer(saved).data
                resp.update(streak_data)
                return Response(resp, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        serializer = HabitSerializer(data=data)
        if serializer.is_valid():
            saved = serializer.save(id=habit_id, user=request.user)
            streak_data = calculate_habit_streaks(saved)
            resp = HabitSerializer(saved).data
            resp.update(streak_data)
            return Response(resp, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class HabitDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        habit = Habit.objects.filter(pk=pk, user=request.user, is_deleted=False).first()
        if not habit:
            return Response({"status": "error", "message": "Habit not found."}, status=status.HTTP_404_NOT_FOUND)
        streak_data = calculate_habit_streaks(habit)
        resp = HabitSerializer(habit).data
        resp.update(streak_data)
        return Response(resp)

    def put(self, request, pk):
        habit = Habit.objects.filter(pk=pk, user=request.user).first()
        if not habit:
            return Response({"status": "error", "message": "Habit not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = HabitSerializer(habit, data=request.data, partial=True)
        if serializer.is_valid():
            saved = serializer.save()
            streak_data = calculate_habit_streaks(saved)
            resp = HabitSerializer(saved).data
            resp.update(streak_data)
            return Response(resp)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        habit = Habit.objects.filter(pk=pk, user=request.user).first()
        if not habit:
            return Response({"status": "error", "message": "Habit not found."}, status=status.HTTP_404_NOT_FOUND)
        habit.is_deleted = True
        habit.save()
        return Response({"status": "success", "message": "Habit deleted."}, status=status.HTTP_204_NO_CONTENT)


class HabitCompletionListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = HabitCompletion.objects.filter(user=request.user, is_deleted=False)
        habit_id = request.query_params.get('habit_id')
        if habit_id:
            qs = qs.filter(habit_id=habit_id)
        local_date = request.query_params.get('date')
        if local_date:
            qs = qs.filter(local_date=local_date)
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        if start_date:
            qs = qs.filter(local_date__gte=start_date)
        if end_date:
            qs = qs.filter(local_date__lte=end_date)

        serializer = HabitCompletionSerializer(qs, many=True)
        return Response(serializer.data)

    @transaction.atomic
    def post(self, request):
        serializer = HabitCompletionCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        comp_id = data.get('id') or uuid.uuid4()
        habit_id = data['habit_id']
        local_date = data['local_date']
        completed = data.get('completed', True)
        count = data.get('count', 1)
        notes = data.get('notes', '')

        habit = Habit.objects.filter(id=habit_id, user=request.user).first()
        if not habit:
            return Response({"status": "error", "message": "Habit not found or access denied."}, status=status.HTTP_404_NOT_FOUND)

        # Enforce unique completion per habit and local_date via get_or_create or update
        completion, created = HabitCompletion.objects.get_or_create(
            user=request.user,
            habit=habit,
            local_date=local_date,
            defaults={
                'id': comp_id,
                'completed': completed,
                'count': count,
                'notes': notes,
                'is_deleted': False,
            }
        )

        if not created:
            completion.completed = completed
            completion.count = count
            if notes:
                completion.notes = notes
            completion.is_deleted = False
            completion.save()

        # Recalculate streak
        streak_data = calculate_habit_streaks(habit, today=local_date)

        return Response({
            "status": "success",
            "completion": HabitCompletionSerializer(completion).data,
            "habit_streaks": streak_data,
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class HabitCompletionDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        comp = HabitCompletion.objects.filter(pk=pk, user=request.user).first()
        if not comp:
            return Response({"status": "error", "message": "Habit completion not found."}, status=status.HTTP_404_NOT_FOUND)
        comp.is_deleted = True
        comp.completed = False
        comp.save()
        return Response({"status": "success", "message": "Completion deleted."}, status=status.HTTP_204_NO_CONTENT)
