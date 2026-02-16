# apps/prescriptions/views.py

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from .models import Prescription
from rest_framework.parsers import MultiPartParser, FormParser

class UploadPrescriptionView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        image = request.FILES.get("image")

        if not image:
            return Response(
                {"error": "Image is required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        prescription = Prescription.objects.create(
            user=request.user,
            image=image
        )

        return Response({
            "message": "Prescription uploaded successfully",
            "id": prescription.id
        })
