from rest_framework import serializers
from django.contrib.auth.models import User
from apps.core.models import UserPreferences


class UserPreferencesSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserPreferences
        fields = [
            'workday_start',
            'workday_end',
            'office_name',
            'timezone',
            'theme',
            'wifi_ssid',
            'wifi_bssid',
            'updated_at',
        ]


class UserSerializer(serializers.ModelSerializer):
    preferences = UserPreferencesSerializer(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'preferences']


class AuthTokenRequestSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    password = serializers.CharField(required=True)
