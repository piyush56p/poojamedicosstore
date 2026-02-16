from django.db import transaction
from apps.orders.models import Order, OrderItem
from apps.payments.models import Payment
from apps.catalog.models import Product
from utils import generate_order_number

@transaction.atomic
def create_order(user, cart_items):

    order = Order.objects.create(
        user=user,
        order_number=generate_order_number(),
        shipping_address=user.address_line,
        city=user.city,
        state=user.state,
        pincode=user.pincode,
    )

    total = 0

    for item in cart_items:

        product = Product.objects.select_for_update().get(id=item.product.id)

        if product.stock_quantity < item.quantity:
            raise Exception("Insufficient stock")

        product.stock_quantity -= item.quantity
        product.save()

        item_total = product.price * item.quantity

        OrderItem.objects.create(
            order=order,
            product=product,
            quantity=item.quantity,
            price_at_purchase=product.price,
            total_price=item_total,
        )

        total += item_total

    order.total_amount = total
    order.save()

    return order
