from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()
from .serializers import (
    SignupSerializer,
    LoginSerializer,
    ProfileSerializer,
    UserAddressSerializer,
    UserIllnessSerializer,
    UserNoteSerializer,
    UserRoutineMedicineSerializer,
)
from .models import OTP, UserAddress, UserIllness, UserNote, UserRoutineMedicine
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
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        serializer = ProfileSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request):
        serializer = ProfileSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


class ProfileDetailView(APIView):
    """GET: User details including profile, illnesses, notes, routine medicines, prescriptions."""
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        user = request.user
        profile_data = ProfileSerializer(user).data
        illnesses = UserIllnessSerializer(user.illnesses.all(), many=True).data
        notes = UserNoteSerializer(user.notes.all(), many=True).data
        routine_medicines = UserRoutineMedicineSerializer(
            user.routine_medicines.select_related("product").all(), many=True
        ).data
        addresses_qs = user.addresses.all()
        addresses_data = UserAddressSerializer(addresses_qs, many=True).data
        default_address = addresses_qs.filter(is_default=True).first()
        from apps.prescriptions.models import Prescription
        from apps.prescriptions.serializers import PrescriptionSerializer
        prescriptions = Prescription.objects.filter(user=user).order_by("-uploaded_at")
        prescriptions_data = PrescriptionSerializer(
            prescriptions, many=True, context={"request": request}
        ).data
        return Response({
            "profile": profile_data,
            "illnesses": illnesses,
            "notes": notes,
            "routine_medicines": routine_medicines,
            "addresses": addresses_data,
            "default_address": UserAddressSerializer(default_address).data if default_address else None,
            "prescriptions": prescriptions_data,
        }, status=status.HTTP_200_OK)


class UserAddressListCreateView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        addresses = UserAddress.objects.filter(user=request.user)
        serializer = UserAddressSerializer(addresses, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = UserAddressSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        requested_default = serializer.validated_data.get("is_default", False)
        if requested_default:
            UserAddress.objects.filter(user=request.user, is_default=True).update(is_default=False)

        if not requested_default and not UserAddress.objects.filter(user=request.user, is_default=True).exists():
            requested_default = True

        address = serializer.save(user=request.user, is_default=requested_default)
        return Response(UserAddressSerializer(address).data, status=status.HTTP_201_CREATED)


class UserAddressDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get_object(self, request, pk):
        return UserAddress.objects.filter(pk=pk, user=request.user).first()

    def get(self, request, pk):
        address = self.get_object(request, pk)
        if not address:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(UserAddressSerializer(address).data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        address = self.get_object(request, pk)
        if not address:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = UserAddressSerializer(address, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        requested_default = serializer.validated_data.get("is_default")
        if requested_default is True:
            UserAddress.objects.filter(user=request.user, is_default=True).exclude(pk=address.pk).update(is_default=False)

        updated = serializer.save()
        return Response(UserAddressSerializer(updated).data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        address = self.get_object(request, pk)
        if not address:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        was_default = address.is_default
        address.delete()

        if was_default:
            next_address = UserAddress.objects.filter(user=request.user).first()
            if next_address:
                next_address.is_default = True
                next_address.save(update_fields=["is_default"])

        return Response(status=status.HTTP_204_NO_CONTENT)


class UserAddressSetDefaultView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, pk):
        address = UserAddress.objects.filter(pk=pk, user=request.user).first()
        if not address:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        UserAddress.objects.filter(user=request.user, is_default=True).exclude(pk=address.pk).update(is_default=False)
        if not address.is_default:
            address.is_default = True
            address.save(update_fields=["is_default"])

        return Response(UserAddressSerializer(address).data, status=status.HTTP_200_OK)


# ----- User Illness CRUD -----
class UserIllnessListCreateView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        items = UserIllness.objects.filter(user=request.user)
        serializer = UserIllnessSerializer(items, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = UserIllnessSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class UserIllnessDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get_object(self, request, pk):
        return UserIllness.objects.filter(pk=pk, user=request.user).first()

    def get(self, request, pk):
        obj = self.get_object(request, pk)
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = UserIllnessSerializer(obj)
        return Response(serializer.data)

    def put(self, request, pk):
        obj = self.get_object(request, pk)
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = UserIllnessSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def patch(self, request, pk):
        obj = self.get_object(request, pk)
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = UserIllnessSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        obj = self.get_object(request, pk)
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ----- User Notes CRUD -----
class UserNoteListCreateView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        items = UserNote.objects.filter(user=request.user)
        serializer = UserNoteSerializer(items, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = UserNoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class UserNoteDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get_object(self, request, pk):
        return UserNote.objects.filter(pk=pk, user=request.user).first()

    def get(self, request, pk):
        obj = self.get_object(request, pk)
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = UserNoteSerializer(obj)
        return Response(serializer.data)

    def put(self, request, pk):
        obj = self.get_object(request, pk)
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = UserNoteSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def patch(self, request, pk):
        obj = self.get_object(request, pk)
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = UserNoteSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        obj = self.get_object(request, pk)
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ----- User Routine Medicines CRUD -----
class UserRoutineMedicineListCreateView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        items = UserRoutineMedicine.objects.filter(user=request.user).select_related("product")
        serializer = UserRoutineMedicineSerializer(items, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = UserRoutineMedicineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class UserRoutineMedicineDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get_object(self, request, pk):
        return UserRoutineMedicine.objects.filter(pk=pk, user=request.user).select_related("product").first()

    def get(self, request, pk):
        obj = self.get_object(request, pk)
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = UserRoutineMedicineSerializer(obj)
        return Response(serializer.data)

    def put(self, request, pk):
        obj = self.get_object(request, pk)
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = UserRoutineMedicineSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def patch(self, request, pk):
        obj = self.get_object(request, pk)
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = UserRoutineMedicineSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        obj = self.get_object(request, pk)
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

