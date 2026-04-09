from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth import authenticate
from django.contrib.auth.hashers import make_password

User = get_user_model()
from apps.catalog.models import Product
from .models import UserAddress, UserIllness, UserNote, UserRoutineMedicine


class SignupSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            "username",
            "password",
            "email",
            "mobile_number",
        ]

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email already registered.")
        return value

    def validate_mobile_number(self, value):
        if User.objects.filter(mobile_number=value).exists():
            raise serializers.ValidationError("Mobile number already registered.")
        return value

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Username already taken.")
        return value

    def create(self, validated_data):
        validated_data["password"] = make_password(validated_data["password"])
        validated_data["role"] = "CUSTOMER"
        validated_data["is_mobile_verified"] = False

        user = User.objects.create(**validated_data)
        return user

class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        identifier = data.get("identifier")
        password = data.get("password")

        user = None

        # Check if email
        if "@" in identifier:
            user = User.objects.filter(email=identifier).first()
        else:
            user = User.objects.filter(username=identifier).first()

        if not user:
            raise serializers.ValidationError("No user found, please sign up")

        if not user.check_password(password):
            raise serializers.ValidationError("Invalid credentials")

        if not user.is_mobile_verified:
            raise serializers.ValidationError("Mobile not verified")

        data["user"] = user
        return data

class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "mobile_number",
            "role",
            "address_line",
            "city",
            "state",
            "pincode",
            "is_mobile_verified",
            "is_email_verified",
            "date_joined",
        ]
        read_only_fields = ["id", "username", "role", "is_mobile_verified", "is_email_verified", "date_joined"]


class UserAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserAddress
        fields = [
            "id",
            "label",
            "address_line",
            "city",
            "state",
            "pincode",
            "is_default",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


# ----- User detail (profile + related) -----
class UserIllnessSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserIllness
        fields = ["id", "name", "description", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class UserNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserNote
        fields = ["id", "title", "content", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class UserRoutineMedicineSerializer(serializers.ModelSerializer):
    product_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(is_active=True), source="product", write_only=True
    )
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_price = serializers.DecimalField(
        source="product.price", max_digits=10, decimal_places=2, read_only=True
    )

    class Meta:
        model = UserRoutineMedicine
        fields = [
            "id", "product", "product_id", "product_name", "product_price",
            "quantity", "frequency", "notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "product", "product_name", "product_price", "created_at", "updated_at"]
