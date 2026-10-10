from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.contrib.auth.models import User
from django.utils import timezone
from apps.core.models import UserPreferences
from apps.core.serializers import UserPreferencesSerializer, UserSerializer


class HealthCheckView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({
            "status": "healthy",
            "timestamp": timezone.now().isoformat(),
            "service": "personal-time-ledger-backend",
            "version": "1.0.0"
        })


class AuthTokenView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '').strip()

        if not username or not password:
            return Response(
                {"status": "error", "message": "Username and password are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Personal ledger single-user onboarding / authentication
        user, created = User.objects.get_or_create(username=username)
        if created:
            user.set_password(password)
            user.save()
            # Create default preferences
            UserPreferences.objects.create(user=user)
        else:
            if not user.check_password(password):
                return Response(
                    {"status": "error", "message": "Invalid credentials."},
                    status=status.HTTP_401_UNAUTHORIZED
                )

        token, _ = Token.objects.get_or_create(user=user)
        # Ensure preferences exist
        if not hasattr(user, 'preferences'):
            UserPreferences.objects.create(user=user)

        return Response({
            "status": "success",
            "token": token.key,
            "user": UserSerializer(user).data
        })


class UserPreferencesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        prefs, _ = UserPreferences.objects.get_or_create(user=request.user)
        serializer = UserPreferencesSerializer(prefs)
        return Response(serializer.data)

    def put(self, request):
        prefs, _ = UserPreferences.objects.get_or_create(user=request.user)
        serializer = UserPreferencesSerializer(prefs, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
