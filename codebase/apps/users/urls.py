from django.urls import path
from .views import SignupView, LoginView, ProfileView, VerifyOTPView, MobileOTPLoginView

urlpatterns = [
    path("signup/", SignupView.as_view()),
    path("verify-otp/", VerifyOTPView.as_view()),
    path("login/", LoginView.as_view()),
    path("mobile-login/", MobileOTPLoginView.as_view()),
    path("profile/", ProfileView.as_view(), name="profile"),
]
