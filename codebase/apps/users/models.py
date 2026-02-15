from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone
import random
from datetime import timedelta


class CustomUser(AbstractUser):

    ROLE_CHOICES = (
        ('ADMIN', 'Admin'),
        ('CUSTOMER', 'Customer'),
    )

    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default='CUSTOMER'
    )

    email = models.EmailField(unique=True)
    mobile_number = models.CharField(max_length=15, unique=True)

    is_mobile_verified = models.BooleanField(default=False)
    is_email_verified = models.BooleanField(default=False)

    address_line = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    state = models.CharField(max_length=100, blank=True, null=True)
    pincode = models.CharField(max_length=10, blank=True, null=True)

    # 👇 ADD THESE TWO LINES
    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["email", "mobile_number"]

    def __str__(self):
        return f"{self.username} ({self.role})"


class OTP(models.Model):
    user = models.ForeignKey("CustomUser", on_delete=models.CASCADE)
    otp_code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    is_used = models.BooleanField(default=False)

    def is_expired(self):
        return timezone.now() > self.created_at + timedelta(minutes=5)

    @staticmethod
    def generate_otp():
        return str(random.randint(100000, 999999))