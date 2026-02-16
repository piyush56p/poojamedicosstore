# apps/orders/utils.py
from django.utils import timezone
from .models import Order


def generate_order_number():
    today = timezone.now().date()
    date_str = today.strftime("%Y%m%d")

    prefix = f"PM{date_str}"

    last_order = Order.objects.filter(
        order_number__startswith=prefix
    ).order_by("-order_number").first()

    if last_order:
        last_number = int(last_order.order_number.split("-")[-1])
        new_number = last_number + 1
    else:
        new_number = 1

    return f"{prefix}-{new_number:04d}"
