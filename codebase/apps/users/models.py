from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import Q
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


class UserAddress(models.Model):
    user = models.ForeignKey(
        "CustomUser",
        on_delete=models.CASCADE,
        related_name="addresses",
    )
    label = models.CharField(max_length=50, blank=True, default="")
    address_line = models.CharField(max_length=255)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    pincode = models.CharField(max_length=10)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user"],
                condition=Q(is_default=True),
                name="unique_default_address_per_user",
            )
        ]

    def __str__(self):
        default_tag = " (default)" if self.is_default else ""
        return f"{self.user.username} - {self.address_line}{default_tag}"


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


class UserIllness(models.Model):
    """User's illness/condition (if any)."""
    user = models.ForeignKey(
        "CustomUser",
        on_delete=models.CASCADE,
        related_name="illnesses",
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        verbose_name_plural = "User illnesses"

    def __str__(self):
        return f"{self.name} - {self.user.username}"


class UserNote(models.Model):
    """User's personal notes."""
    user = models.ForeignKey(
        "CustomUser",
        on_delete=models.CASCADE,
        related_name="notes",
    )
    title = models.CharField(max_length=255)
    content = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.title


class UserRoutineMedicine(models.Model):
    """User's routine medicines (cart-like list of regular medicines)."""
    user = models.ForeignKey(
        "CustomUser",
        on_delete=models.CASCADE,
        related_name="routine_medicines",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.CASCADE,
        related_name="routine_users",
    )
    quantity = models.PositiveIntegerField(default=1)
    frequency = models.CharField(max_length=100, blank=True)  # e.g. "daily", "twice a day"
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        unique_together = [["user", "product"]]

    def __str__(self):
        return f"{self.product.name} - {self.user.username}"
