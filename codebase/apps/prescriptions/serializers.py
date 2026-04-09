# apps/prescriptions/serializers.py

from rest_framework import serializers
from .models import Prescription


class PrescriptionSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Prescription
        fields = [
            "id",
            "image",
            "image_url",
            "status",
            "extracted_text",
            "ai_suggested_medicines",
            "uploaded_at",
            "reviewed_at",
        ]
        read_only_fields = fields

    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None


class PrescriptionUploadSerializer(serializers.Serializer):
    image = serializers.ImageField()
