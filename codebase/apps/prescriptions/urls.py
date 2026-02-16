# apps/prescriptions/urls.py

from django.urls import path
from .views import UploadPrescriptionView

urlpatterns = [
    path("upload/", UploadPrescriptionView.as_view(), name="upload-prescription"),
]
