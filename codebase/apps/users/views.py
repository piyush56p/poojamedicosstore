from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()
from .serializers import SignupSerializer, LoginSerializer, ProfileSerializer
from .models import OTP
from .utils import send_otp_sms


class SignupView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save(role="CUSTOMER")

            # Generate OTP
            otp_code = OTP.generate_otp()
            OTP.objects.create(user=user, otp_code=otp_code)

            send_otp_sms(user.mobile_number, otp_code)

            return Response({
                "message": "User registered. Please verify OTP sent to mobile.",
            }, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class VerifyOTPView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        # Accept both "mobile" and "mobile_number" for consistency with signup
        mobile = (request.data.get("mobile") or request.data.get("mobile_number")) or ""
        otp_input = (request.data.get("otp") or "").strip()
        mobile = str(mobile).strip()

        if not mobile or not otp_input:
            return Response(
                {"message": "mobile and otp are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user = User.objects.get(mobile_number=mobile)
        except User.DoesNotExist:
            return Response(
                {"message": "No user found with this mobile number. Please sign up first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        otp_queryset = OTP.objects.filter(
            user=user,
            otp_code=otp_input,
            is_used=False,
        ).order_by("-created_at")

        if not otp_queryset.exists():
            return Response(
                {"message": "Invalid OTP or OTP already used"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        otp_obj = otp_queryset.first()

        if otp_obj.is_expired():
            return Response({"message": "OTP expired"}, status=status.HTTP_400_BAD_REQUEST)

        otp_obj.is_used = True
        otp_obj.save()

        user.is_mobile_verified = True
        user.save()

        return Response({"message": "Mobile verified successfully"}, status=status.HTTP_200_OK)

class MobileOTPLoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        mobile = request.data.get("mobile_number")
        otp_input = request.data.get("otp")

        try:
            user = User.objects.get(mobile_number=mobile)

            otp_obj = OTP.objects.filter(
                user=user,
                otp_code=otp_input,
                is_used=False
            ).latest("created_at")

            if otp_obj.is_expired():
                return Response({"message": "OTP expired"}, status=400)

            otp_obj.is_used = True
            otp_obj.save()

            refresh = RefreshToken.for_user(user)

            return Response({
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "message": "Login successful"
            })

        except:
            return Response({"message": "Invalid OTP"}, status=400)

class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)

        if serializer.is_valid():
            user = serializer.validated_data["user"]
            refresh = RefreshToken.for_user(user)

            return Response({
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "message": "Login successful",
                "status": status.HTTP_200_OK,
            }, status=status.HTTP_200_OK)

        # Extract error message from serializer (user not found vs invalid password)
        errors = serializer.errors
        message = (
            errors.get("non_field_errors", [None])[0]
            or errors.get("identifier", [None])[0]
            or "Invalid credentials"
        )
        return Response(
            {"message": message, "status": status.HTTP_400_BAD_REQUEST},
            status=status.HTTP_400_BAD_REQUEST,
        )

class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = ProfileSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)