# apps/prescriptions/urls.py

from django.urls import path
from .views import (
    UploadPrescriptionView,
    PrescriptionListView,
    PrescriptionDetailView,
    PrescriptionAnalyzeView,
)

urlpatterns = [
    path("upload/", UploadPrescriptionView.as_view(), name="upload-prescription"),
    path("", PrescriptionListView.as_view(), name="prescription-list"),
    path("<int:pk>/", PrescriptionDetailView.as_view(), name="prescription-detail"),
    path("<int:pk>/analyze/", PrescriptionAnalyzeView.as_view(), name="prescription-analyze"),
]
