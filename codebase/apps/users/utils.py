"""
Utility functions for the users app.
"""
import logging
from django.conf import settings

logger = logging.getLogger(__name__)


def send_otp_sms(mobile_number: str, otp_code: str) -> bool:
    """
    Send OTP via SMS to the given mobile number.
    In development/debug mode, logs the OTP to console for testing.
    In production, integrate with an SMS provider (Twilio, MSG91, etc.).
    """
    if getattr(settings, "DEBUG", False):
        logger.info(f"OTP for {mobile_number}: {otp_code}")
        print(f"[DEV] OTP for {mobile_number}: {otp_code}")
        return True

    # TODO: Integrate with SMS provider (Twilio, MSG91, etc.)
    # Example with Twilio:
    # from twilio.rest import Client
    # client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    # client.messages.create(to=mobile_number, from_=settings.TWILIO_PHONE, body=f"Your OTP is: {otp_code}")
    logger.info(f"OTP for {mobile_number}: {otp_code}")
    return True
