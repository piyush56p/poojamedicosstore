from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth.models import User


class AuthAPITestCase(APITestCase):

    def setUp(self):
        self.signup_url = "/api/signup/"
        self.login_url = "/api/login/"
        self.protected_url = "/api/profile/"  # example protected endpoint

        self.user_data = {
            "username": "testuser",
            "password": "testpassword123",
            "latitude": 28.6139,
            "longitude": 77.2090
        }

    # ----------------------------
    # SIGNUP TEST
    # ----------------------------
    def test_user_signup_success(self):
        response = self.client.post(self.signup_url, self.user_data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(User.objects.get().username, "testuser")

    def test_user_signup_duplicate(self):
        User.objects.create_user(username="testuser", password="testpassword123")

        response = self.client.post(self.signup_url, self.user_data, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ----------------------------
    # LOGIN TEST
    # ----------------------------
    def test_user_login_success(self):
        User.objects.create_user(username="testuser", password="testpassword123")

        response = self.client.post(self.login_url, {
            "username": "testuser",
            "password": "testpassword123"
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_user_login_invalid_credentials(self):
        User.objects.create_user(username="testuser", password="testpassword123")

        response = self.client.post(self.login_url, {
            "username": "testuser",
            "password": "wrongpassword"
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # ----------------------------
    # PROTECTED ROUTE TEST
    # ----------------------------
    def test_protected_route_requires_auth(self):
        response = self.client.get(self.protected_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_protected_route_with_token(self):
        User.objects.create_user(username="testuser", password="testpassword123")

        login_response = self.client.post(self.login_url, {
            "username": "testuser",
            "password": "testpassword123"
        }, format='json')

        access_token = login_response.data["access"]

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        response = self.client.get(self.protected_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
