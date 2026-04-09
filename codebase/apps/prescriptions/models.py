import os
import uuid
from django.db import models
from django.conf import settings


def user_prescription_path(instance, filename):
    # media/users/<user_id>/prescriptions/prescription_<unique>.ext
    ext = os.path.splitext(filename)[1].lower() or ".jpeg"
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        ext = ".jpeg"
    unique = uuid.uuid4().hex[:12]
    return f"users/{instance.user.id}/prescriptions/prescription_{unique}{ext}"


class Prescription(models.Model):

    STATUS_CHOICES = [
        ("PENDING", "Pending Review"),
        ("APPROVED", "Approved"),
        ("REJECTED", "Rejected"),
        ("PROCESSED", "Processed"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="prescriptions"
    )

    image = models.ImageField(upload_to=user_prescription_path)

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="PENDING"
    )

    extracted_text = models.TextField(blank=True, null=True)  # For Gemini OCR later
    ai_suggested_medicines = models.JSONField(blank=True, null=True)

    uploaded_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Prescription #{self.id} - {self.user.username}"
