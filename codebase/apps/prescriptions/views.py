# apps/prescriptions/views.py

from rest_framework.views import APIView
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser

from .models import Prescription
from .serializers import PrescriptionSerializer
from .ai import analyze_prescription_image

ALLOWED_IMAGE_TYPES = ("image/jpeg", "image/jpg", "image/png", "image/webp")


class UploadPrescriptionView(APIView):
    permission_classes = [permissions.AllowAny]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        image = request.FILES.get("image")
        if not image:
            return Response(
                {"error": "Image file is required. Use form-data key 'image'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if image.content_type not in ALLOWED_IMAGE_TYPES:
            return Response(
                {"error": "Invalid file type. Allowed: JPEG, PNG, WebP."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        prescription = Prescription.objects.create(user=request.user, image=image)

        # AI analysis is best-effort: upload should still succeed if AI is unavailable.
        try:
            result = analyze_prescription_image(prescription.image.path)
            prescription.extracted_text = result.get("extracted_text", "")
            prescription.ai_suggested_medicines = result.get("medicines", [])
            if result.get("ai_used"):
                prescription.status = "PROCESSED"
            prescription.save(update_fields=["extracted_text", "ai_suggested_medicines", "status"])
        except Exception:
            prescription.extracted_text = ""
            prescription.ai_suggested_medicines = []
            prescription.save(update_fields=["extracted_text", "ai_suggested_medicines"])

        serializer = PrescriptionSerializer(prescription, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PrescriptionListView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        prescriptions = Prescription.objects.filter(user=request.user).order_by("-uploaded_at")
        serializer = PrescriptionSerializer(prescriptions, many=True, context={"request": request})
        return Response(serializer.data)


class PrescriptionDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        prescription = Prescription.objects.filter(pk=pk, user=request.user).first()
        if not prescription:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = PrescriptionSerializer(prescription, context={"request": request})
        return Response(serializer.data)

    def delete(self, request, pk):
        prescription = Prescription.objects.filter(pk=pk, user=request.user).first()
        if not prescription:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        prescription.image.delete(save=False)
        prescription.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PrescriptionAnalyzeView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, pk):
        prescription = Prescription.objects.filter(pk=pk, user=request.user).first()
        if not prescription:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            result = analyze_prescription_image(prescription.image.path)
        except Exception as exc:
            return Response(
                {"detail": f"AI analysis failed: {str(exc)}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        prescription.extracted_text = result.get("extracted_text", "")
        prescription.ai_suggested_medicines = result.get("medicines", [])
        if result.get("ai_used"):
            prescription.status = "PROCESSED"
        prescription.save(update_fields=["extracted_text", "ai_suggested_medicines", "status"])

        serializer = PrescriptionSerializer(prescription, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

