from io import BytesIO
import logging
from django.db import transaction
from django.http import HttpResponse
from django.core.mail import EmailMessage
from rest_framework import status, serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions

from apps.catalog.models import Product
from apps.users.models import UserAddress
from apps.users.serializers import UserAddressSerializer
from .models import Cart, CartItem, Order, OrderItem, Wishlist, WishlistItem
from .serializers import (
    CartSerializer,
    CartItemAddSerializer,
    CartItemUpdateSerializer,
    WishlistSerializer,
    CheckoutSerializer,
    OrderSerializer,
    BillingOrderWriteSerializer,
    BillingOrderReadSerializer,
)
from .utils import generate_order_number

WISHLIST_MAX = 5
logger = logging.getLogger(__name__)


def _render_order_bill_pdf(order):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.pdfgen import canvas
    except Exception as exc:
        raise RuntimeError("PDF generator dependency missing. Install reportlab.") from exc

    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    x_left = 12 * mm
    x_right = width - (12 * mm)
    y = height - (14 * mm)

    p.setFont("Helvetica-Bold", 13)
    p.drawString(x_left, y, "Pooja Medicos - Bill")
    p.setFont("Helvetica", 9)
    y -= 6 * mm
    p.drawString(x_left, y, f"Bill No: {order.order_number}")
    p.drawRightString(x_right, y, f"Date: {order.created_at.date()}")

    y -= 7 * mm
    p.drawString(x_left, y, f"Patient: {order.patient_name or '-'}")
    y -= 5 * mm
    p.drawString(x_left, y, f"Address: {order.patient_address or '-'}")
    y -= 5 * mm
    p.drawString(x_left, y, f"Doctor: {order.patient_doctor or '-'}")

    y -= 8 * mm
    p.setFont("Helvetica-Bold", 8)
    p.rect(x_left, y - 7 * mm, x_right - x_left, 7 * mm)
    p.drawString(x_left + 2 * mm, y - 5 * mm, "Item")
    p.drawString(x_left + 64 * mm, y - 5 * mm, "Qty")
    p.drawString(x_left + 78 * mm, y - 5 * mm, "MRP")
    p.drawString(x_left + 95 * mm, y - 5 * mm, "LOT")
    p.drawString(x_left + 120 * mm, y - 5 * mm, "EXP")
    p.drawString(x_left + 138 * mm, y - 5 * mm, "HSN")
    p.drawRightString(x_right - 2 * mm, y - 5 * mm, "NET")

    p.setFont("Helvetica", 8)
    y -= 7 * mm
    for item in order.items.select_related("product").all():
        if y < 35 * mm:
            p.showPage()
            y = height - (20 * mm)
        p.rect(x_left, y - 6.5 * mm, x_right - x_left, 6.5 * mm)
        p.drawString(x_left + 2 * mm, y - 4.7 * mm, item.product.name[:34])
        p.drawString(x_left + 66 * mm, y - 4.7 * mm, str(item.quantity))
        p.drawString(x_left + 78 * mm, y - 4.7 * mm, str(item.mrp))
        p.drawString(x_left + 95 * mm, y - 4.7 * mm, (item.lot or "")[:10])
        p.drawString(x_left + 120 * mm, y - 4.7 * mm, (item.exp or "")[:10])
        p.drawString(x_left + 138 * mm, y - 4.7 * mm, (item.hsn or "")[:12])
        p.drawRightString(x_right - 2 * mm, y - 4.7 * mm, str(item.net))
        y -= 6.5 * mm

    y -= 7 * mm
    p.setFont("Helvetica-Bold", 9)
    p.drawRightString(x_right, y, f"TOTAL: {order.total_amount}")
    y -= 5 * mm
    p.drawRightString(x_right, y, f"DISCOUNT: {order.discount_amount}")
    y -= 5 * mm
    p.drawRightString(x_right, y, f"GST: {order.gst_amount} | CGST: {order.cgst_amount} | SGST: {order.sgst_amount}")
    y -= 5 * mm
    p.drawRightString(x_right, y, f"PAYABLE AMOUNT: {order.payable_amount}")

    p.save()
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes


def _send_bill_whatsapp_dummy(whatsapp_number, order_number):
    logger.info("[DUMMY WHATSAPP] bill sent to %s for order %s", whatsapp_number, order_number)
    return True


# ----- Cart APIs -----
class CartListCreateView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        carts = Cart.objects.filter(user=request.user, is_active=True).prefetch_related("items__product")
        serializer = CartSerializer(carts, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = CartSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class CartDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get_cart(self, pk):
        cart = Cart.objects.filter(pk=pk, user=self.request.user, is_active=True).prefetch_related("items__product").first()
        if not cart:
            return None
        return cart

    def get(self, request, pk):
        cart = self.get_cart(pk)
        if not cart:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = CartSerializer(cart)
        return Response(serializer.data)

    def patch(self, request, pk):
        cart = self.get_cart(pk)
        if not cart:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = CartSerializer(cart, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        cart = self.get_cart(pk)
        if not cart:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        cart.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CartItemAddView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, cart_pk):
        cart = Cart.objects.filter(pk=cart_pk, user=request.user, is_active=True).first()
        if not cart:
            return Response({"detail": "Cart not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = CartItemAddSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.validated_data["product_id"]
        quantity = serializer.validated_data.get("quantity", 1)
        cart_item, created = CartItem.objects.get_or_create(
            cart=cart, product=product,
            defaults={"quantity": quantity}
        )
        if not created:
            cart_item.quantity += quantity
            cart_item.save()
        from .serializers import CartSerializer
        cart_serializer = CartSerializer(Cart.objects.prefetch_related("items__product").get(pk=cart.pk))
        return Response(cart_serializer.data, status=status.HTTP_200_OK)


class CartItemUpdateView(APIView):
    permission_classes = [permissions.AllowAny]

    def patch(self, request, cart_pk, item_pk):
        cart = Cart.objects.filter(pk=cart_pk, user=request.user, is_active=True).first()
        if not cart:
            return Response({"detail": "Cart not found."}, status=status.HTTP_404_NOT_FOUND)
        cart_item = CartItem.objects.filter(cart=cart, pk=item_pk).first()
        if not cart_item:
            return Response({"detail": "Cart item not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = CartItemUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        cart_item.quantity = serializer.validated_data["quantity"]
        cart_item.save()
        from .serializers import CartSerializer
        cart_serializer = CartSerializer(Cart.objects.prefetch_related("items__product").get(pk=cart.pk))
        return Response(cart_serializer.data)


class CartItemRemoveView(APIView):
    permission_classes = [permissions.AllowAny]

    def delete(self, request, cart_pk, item_pk):
        cart = Cart.objects.filter(pk=cart_pk, user=request.user, is_active=True).first()
        if not cart:
            return Response({"detail": "Cart not found."}, status=status.HTTP_404_NOT_FOUND)
        cart_item = CartItem.objects.filter(cart=cart, pk=item_pk).first()
        if not cart_item:
            return Response({"detail": "Cart item not found."}, status=status.HTTP_404_NOT_FOUND)
        cart_item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ----- Wishlist APIs (max 5) -----
class WishlistListCreateView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        wishlists = Wishlist.objects.filter(user=request.user).prefetch_related("items__product")
        serializer = WishlistSerializer(wishlists, many=True)
        return Response(serializer.data)

    def post(self, request):
        count = Wishlist.objects.filter(user=request.user).count()
        if count >= WISHLIST_MAX:
            return Response(
                {"detail": f"You can have at most {WISHLIST_MAX} wishlists."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = WishlistSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class WishlistDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get_wishlist(self, pk):
        return Wishlist.objects.filter(pk=pk, user=self.request.user).prefetch_related("items__product").first()

    def get(self, request, pk):
        wl = self.get_wishlist(pk)
        if not wl:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = WishlistSerializer(wl)
        return Response(serializer.data)

    def delete(self, request, pk):
        wl = self.get_wishlist(pk)
        if not wl:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        wl.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WishlistAddProductView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, pk):
        wl = Wishlist.objects.filter(pk=pk, user=request.user).first()
        if not wl:
            return Response({"detail": "Wishlist not found."}, status=status.HTTP_404_NOT_FOUND)
        product_id = request.data.get("product_id")
        if not product_id:
            return Response({"detail": "product_id required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            product = Product.objects.get(pk=product_id, is_active=True)
        except Product.DoesNotExist:
            return Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        WishlistItem.objects.get_or_create(wishlist=wl, product=product)
        serializer = WishlistSerializer(Wishlist.objects.prefetch_related("items__product").get(pk=wl.pk))
        return Response(serializer.data)


class WishlistRemoveProductView(APIView):
    permission_classes = [permissions.AllowAny]

    def delete(self, request, pk, product_id):
        wl = Wishlist.objects.filter(pk=pk, user=request.user).first()
        if not wl:
            return Response({"detail": "Wishlist not found."}, status=status.HTTP_404_NOT_FOUND)
        item = WishlistItem.objects.filter(wishlist=wl, product_id=product_id).first()
        if not item:
            return Response({"detail": "Product not in wishlist."}, status=status.HTTP_404_NOT_FOUND)
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ----- Checkout (create Order + OrderItems from one Cart) -----
class CheckoutView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        addresses = UserAddress.objects.filter(user=request.user)
        default_address = addresses.filter(is_default=True).first()
        return Response(
            {
                "default_address": UserAddressSerializer(default_address).data if default_address else None,
                "addresses": UserAddressSerializer(addresses, many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        serializer = CheckoutSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        cart = serializer.validated_data["cart_id"]
        resolved_address = serializer.validated_data["resolved_address"]
        shipping_address = resolved_address["shipping_address"]
        city = resolved_address["city"]
        state = resolved_address["state"]
        pincode = resolved_address["pincode"]

        with transaction.atomic():
            order_number = generate_order_number()
            order = Order.objects.create(
                user=request.user,
                order_number=order_number,
                status="PENDING",
                total_amount=0,
                shipping_address=shipping_address,
                city=city,
                state=state,
                pincode=pincode,
            )
            total = 0
            for item in cart.items.select_related("product").select_for_update():
                product = item.product
                if product.stock_quantity < item.quantity:
                    raise serializers.ValidationError(
                        {"detail": f"Insufficient stock for {product.name}. Available: {product.stock_quantity}"}
                    )
                product.stock_quantity -= item.quantity
                product.save(update_fields=["stock_quantity"])
                line_total = product.price * item.quantity
                OrderItem.objects.create(
                    order=order,
                    product=product,
                    quantity=item.quantity,
                    price_at_purchase=product.price,
                    total_price=line_total,
                )
                total += line_total
            order.total_amount = total
            order.save(update_fields=["total_amount"])
            cart.order = order
            cart.is_active = False
            cart.save(update_fields=["order", "is_active"])

        order_serializer = OrderSerializer(Order.objects.prefetch_related("items__product").get(pk=order.pk))
        return Response(order_serializer.data, status=status.HTTP_201_CREATED)


# ----- Order APIs -----
class OrderListView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        if request.user.is_authenticated:
            orders = Order.objects.filter(user=request.user)
        else:
            orders = Order.objects.all()
        orders = orders.prefetch_related("items__product").order_by("-created_at")
        serializer = BillingOrderReadSerializer(orders, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = BillingOrderWriteSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        response_serializer = BillingOrderReadSerializer(order)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class OrderDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        if request.user.is_authenticated:
            order = Order.objects.filter(pk=pk, user=request.user).prefetch_related("items__product").first()
        else:
            order = Order.objects.filter(pk=pk).prefetch_related("items__product").first()
        if not order:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = BillingOrderReadSerializer(order)
        return Response(serializer.data)

    def patch(self, request, pk):
        if request.user.is_authenticated:
            order = Order.objects.filter(pk=pk, user=request.user).prefetch_related("items__product").first()
        else:
            order = Order.objects.filter(pk=pk).prefetch_related("items__product").first()
        if not order:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = BillingOrderWriteSerializer(
            order,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        updated_order = serializer.save()
        response_serializer = BillingOrderReadSerializer(updated_order)
        return Response(response_serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        if request.user.is_authenticated:
            order = Order.objects.filter(pk=pk, user=request.user).first()
        else:
            order = Order.objects.filter(pk=pk).first()
        if not order:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        order.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class OrderBillDownloadView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        order = Order.objects.filter(pk=pk).prefetch_related("items__product").first()
        if not order:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            pdf_bytes = _render_order_bill_pdf(order)
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="bill_{order.order_number}.pdf"'
        return response


class OrderBillShareView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, pk):
        order = Order.objects.filter(pk=pk).prefetch_related("items__product").first()
        if not order:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        email = (request.data.get("email") or "customer@example.com").strip()
        whatsapp = (request.data.get("whatsapp") or "+919999999999").strip()
        send_email = bool(request.data.get("send_email", False))
        send_whatsapp = bool(request.data.get("send_whatsapp", False))

        if not send_email and not send_whatsapp:
            if email:
                send_email = True
            if whatsapp:
                send_whatsapp = True

        if not send_email and not send_whatsapp:
            return Response(
                {"detail": "Provide at least one channel: email or whatsapp."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            pdf_bytes = _render_order_bill_pdf(order)
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        email_sent = False
        whatsapp_sent = False
        email_error = ""

        if send_email:
            try:
                message = EmailMessage(
                    subject=f"Bill for Order {order.order_number}",
                    body="Please find attached your bill PDF.",
                    to=[email],
                )
                message.attach(
                    filename=f"bill_{order.order_number}.pdf",
                    content=pdf_bytes,
                    mimetype="application/pdf",
                )
                message.send(fail_silently=False)
                email_sent = True
            except Exception as exc:
                email_error = str(exc)

        if send_whatsapp:
            whatsapp_sent = _send_bill_whatsapp_dummy(whatsapp, order.order_number)

        return Response(
            {
                "order_id": order.id,
                "bill_no": order.order_number,
                "requested_channels": {
                    "email": send_email,
                    "whatsapp": send_whatsapp,
                },
                "email": {
                    "to": email,
                    "sent": email_sent,
                    "error": email_error,
                },
                "whatsapp": {
                    "to": whatsapp,
                    "sent": whatsapp_sent,
                    "mode": "dummy",
                },
            },
            status=status.HTTP_200_OK,
        )

