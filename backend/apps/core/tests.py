from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status


class CoreApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_health_check(self):
        response = self.client.get('/api/v1/health/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'healthy')
        self.assertIn('timestamp', response.data)

    def test_auth_token_registration_and_login(self):
        # Register user
        response = self.client.post('/api/v1/auth/token/', {
            'username': 'testuser',
            'password': 'password123',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        token = response.data['token']

        # Log in again with same credentials
        response2 = self.client.post('/api/v1/auth/token/', {
            'username': 'testuser',
            'password': 'password123',
        })
        self.assertEqual(response2.status_code, status.HTTP_200_OK)
        self.assertEqual(response2.data['token'], token)

        # Log in with wrong password
        response_wrong = self.client.post('/api/v1/auth/token/', {
            'username': 'testuser',
            'password': 'wrongpassword',
        })
        self.assertEqual(response_wrong.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_preferences(self):
        user = User.objects.create_user(username='prefuser', password='password123')
        self.client.force_authenticate(user=user)

        response = self.client.get('/api/v1/preferences/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['office_name'], 'Office')

        update_resp = self.client.put('/api/v1/preferences/', {
            'office_name': 'Downtown HQ',
            'theme': 'dark',
            'wifi_ssid': 'Office-WiFi-5G',
        })
        self.assertEqual(update_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(update_resp.data['office_name'], 'Downtown HQ')
        self.assertEqual(update_resp.data['wifi_ssid'], 'Office-WiFi-5G')
