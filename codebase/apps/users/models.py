from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    mobile_number = models.CharField(max_length=15, unique=True)
    location = models.CharField(max_length=255, blank=True, null=True)
    is_otp_authenticated = models.BooleanField(default=False)

    def __str__(self):
        return self.username
