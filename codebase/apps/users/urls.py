from django.urls import path
from .views import (
    SignupView,
    LoginView,
    ProfileView,
    ProfileDetailView,
    VerifyOTPView,
    MobileOTPLoginView,
    UserIllnessListCreateView,
    UserIllnessDetailView,
    UserNoteListCreateView,
    UserNoteDetailView,
    UserRoutineMedicineListCreateView,
    UserRoutineMedicineDetailView,
    UserAddressListCreateView,
    UserAddressDetailView,
    UserAddressSetDefaultView,
)

urlpatterns = [
    path("signup/", SignupView.as_view()),
    path("verify-otp/", VerifyOTPView.as_view()),
    path("login/", LoginView.as_view()),
    path("mobile-login/", MobileOTPLoginView.as_view()),
    path("profile/", ProfileView.as_view(), name="profile"),
    path("profile/detail/", ProfileDetailView.as_view(), name="profile-detail"),
    # Addresses
    path("addresses/", UserAddressListCreateView.as_view()),
    path("addresses/<int:pk>/", UserAddressDetailView.as_view()),
    path("addresses/<int:pk>/set-default/", UserAddressSetDefaultView.as_view()),
    # Illnesses
    path("illnesses/", UserIllnessListCreateView.as_view()),
    path("illnesses/<int:pk>/", UserIllnessDetailView.as_view()),
    # Notes
    path("notes/", UserNoteListCreateView.as_view()),
    path("notes/<int:pk>/", UserNoteDetailView.as_view()),
    # Routine medicines
    path("routine-medicines/", UserRoutineMedicineListCreateView.as_view()),
    path("routine-medicines/<int:pk>/", UserRoutineMedicineDetailView.as_view()),
]
