# apps/orders/serializers.py

from decimal import Decimal
from django.db import transaction
from django.db.models import Sum
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers
from apps.catalog.models import Category, Inventory, Product
from apps.users.models import UserAddress
from .models import Cart, CartItem, Order, OrderItem, Wishlist, WishlistItem


# ----- Product (minimal for nested) -----
class ProductMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ["id", "name", "price", "image_url", "in_stock"]
        read_only_fields = fields

    in_stock = serializers.BooleanField(read_only=True)


# ----- Cart -----
class CartItemSerializer(serializers.ModelSerializer):
    product = ProductMinimalSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(is_active=True),
        source="product",
        write_only=True,
    )

    class Meta:
        model = CartItem
        fields = ["id", "product", "product_id", "quantity"]
        read_only_fields = ["id", "product"]


class CartItemAddSerializer(serializers.Serializer):
    product_id = serializers.PrimaryKeyRelatedField(queryset=Product.objects.filter(is_active=True))
    quantity = serializers.IntegerField(min_value=1, default=1)


class CartItemUpdateSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1)


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    item_count = serializers.SerializerMethodField()
    total_amount = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ["id", "name", "is_active", "items", "item_count", "total_amount", "created_at", "updated_at"]
        read_only_fields = ["id", "items", "item_count", "total_amount", "created_at", "updated_at"]

    def get_item_count(self, obj):
        agg = obj.items.aggregate(total=Sum("quantity"))
        return agg["total"] or 0

    def get_total_amount(self, obj):
        total = 0
        for item in obj.items.select_related("product").all():
            total += float(item.product.price * item.quantity)
        return round(total, 2)


# ----- Wishlist -----
class WishlistItemSerializer(serializers.ModelSerializer):
    product = ProductMinimalSerializer(read_only=True)

    class Meta:
        model = WishlistItem
        fields = ["id", "product", "added_at"]


class WishlistSerializer(serializers.ModelSerializer):
    items = WishlistItemSerializer(many=True, read_only=True)
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = Wishlist
        fields = ["id", "name", "items", "item_count", "created_at", "updated_at"]
        read_only_fields = ["id", "items", "item_count", "created_at", "updated_at"]

    def get_item_count(self, obj):
        return obj.items.count()


# ----- Checkout -----
class CheckoutSerializer(serializers.Serializer):
    cart_id = serializers.PrimaryKeyRelatedField(queryset=Cart.objects.filter(is_active=True))
    address_id = serializers.PrimaryKeyRelatedField(
        queryset=UserAddress.objects.all(),
        required=False,
        allow_null=True,
    )
    shipping_address = serializers.CharField(required=False, allow_blank=False)
    city = serializers.CharField(max_length=100, required=False, allow_blank=False)
    state = serializers.CharField(max_length=100, required=False, allow_blank=False)
    pincode = serializers.CharField(max_length=10, required=False, allow_blank=False)

    def validate(self, attrs):
        cart = attrs["cart_id"]
        if cart.user_id != self.context["request"].user.id:
            raise serializers.ValidationError("Cart does not belong to you.")
        if not cart.items.exists():
            raise serializers.ValidationError("Cart is empty.")

        user = self.context["request"].user
        address = attrs.get("address_id")
        if address:
            if address.user_id != user.id:
                raise serializers.ValidationError({"address_id": "Address does not belong to you."})
            attrs["resolved_address"] = {
                "shipping_address": address.address_line,
                "city": address.city,
                "state": address.state,
                "pincode": address.pincode,
            }
            return attrs

        manual_fields = ["shipping_address", "city", "state", "pincode"]
        has_manual = all(attrs.get(field) for field in manual_fields)
        if has_manual:
            attrs["resolved_address"] = {
                "shipping_address": attrs["shipping_address"],
                "city": attrs["city"],
                "state": attrs["state"],
                "pincode": attrs["pincode"],
            }
            return attrs

        default_address = user.addresses.filter(is_default=True).first()
        if not default_address:
            raise serializers.ValidationError(
                "Provide address_id or full shipping address, or set a default address first."
            )

        attrs["resolved_address"] = {
            "shipping_address": default_address.address_line,
            "city": default_address.city,
            "state": default_address.state,
            "pincode": default_address.pincode,
        }
        return attrs


# ----- Order -----
class OrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = OrderItem
        fields = ["id", "product", "product_name", "quantity", "price_at_purchase", "total_price"]


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            "id", "order_number", "status", "payment_mode", "total_amount",
            "shipping_address", "city", "state", "pincode",
            "items", "created_at", "updated_at",
        ]


class BillingOrderItemWriteSerializer(serializers.Serializer):
    item_name = serializers.CharField(max_length=255)
    qty = serializers.IntegerField(min_value=1)
    mrp = serializers.DecimalField(max_digits=10, decimal_places=2)
    lot = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")
    exp = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    hsn = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    gst = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=Decimal("0"))
    cgst = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=Decimal("0"))
    sgst = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=Decimal("0"))
    net = serializers.DecimalField(max_digits=12, decimal_places=2)


class BillingOrderWriteSerializer(serializers.Serializer):
    bill_no = serializers.CharField(max_length=20)
    patient_name = serializers.CharField(max_length=255)
    patient_address = serializers.CharField()
    patient_dr = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    payment_mode = serializers.ChoiceField(choices=Order.PAYMENT_MODE_CHOICES, required=False, default="COD")

    items = BillingOrderItemWriteSerializer(many=True)

    total = serializers.DecimalField(max_digits=12, decimal_places=2)
    disc = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=Decimal("0"))
    taxable = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=Decimal("0"))
    gst = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=Decimal("0"))
    cgst = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=Decimal("0"))
    sgst = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=Decimal("0"))
    cess = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=Decimal("0"))
    igst = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=Decimal("0"))
    payable_amt = serializers.DecimalField(max_digits=12, decimal_places=2)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item is required.")
        return value

    def validate_bill_no(self, value):
        instance = self.instance
        exists_qs = Order.objects.filter(order_number=value)
        if instance:
            exists_qs = exists_qs.exclude(pk=instance.pk)
        if exists_qs.exists():
            raise serializers.ValidationError("Bill number already exists.")
        return value

    def _parse_expiry_to_date(self, exp_text):
        exp_text = (exp_text or "").strip()
        if not exp_text:
            return timezone.now().date()

        date_patterns = ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y")
        for pattern in date_patterns:
            try:
                from datetime import datetime
                return datetime.strptime(exp_text, pattern).date()
            except ValueError:
                continue

        if "/" in exp_text:
            parts = exp_text.split("/")
            if len(parts) == 2:
                month = int(parts[0])
                year = int(parts[1])
                if year < 100:
                    year += 2000
                if 1 <= month <= 12:
                    from calendar import monthrange
                    day = monthrange(year, month)[1]
                    from datetime import date
                    return date(year, month, day)

        return timezone.now().date()

    def _get_or_create_default_category(self):
        category, _ = Category.objects.get_or_create(
            name="General Medicine",
            defaults={"description": "Auto-created default category for billing orders."},
        )
        return category

    def _get_or_create_product(self, item_data):
        name = item_data["item_name"].strip()
        lot = (item_data.get("lot") or "").strip()

        product = Product.objects.filter(name__iexact=name).first()
        if product:
            product.price = item_data["mrp"]
            if lot:
                product.batch_number = lot
            product.is_active = True
            product.save(update_fields=["price", "batch_number", "is_active", "updated_at"])
            return product

        category = self._get_or_create_default_category()
        sku_seed = f"{name}-{lot or 'AUTO'}-{timezone.now().timestamp()}"
        import re
        normalized = re.sub(r"[^A-Za-z0-9]+", "-", sku_seed).strip("-").upper()
        sku = normalized[:50] if normalized else f"AUTO-{int(timezone.now().timestamp())}"

        return Product.objects.create(
            name=name,
            sku=sku,
            category=category,
            batch_number=lot,
            price=item_data["mrp"],
            stock_quantity=0,
            is_active=True,
        )

    def _create_or_update_inventory(self, product, item_data):
        lot = (item_data.get("lot") or "").strip() or "AUTO"
        exp = (item_data.get("exp") or "").strip()
        expiry_date = self._parse_expiry_to_date(exp)
        today = timezone.now().date()
        qty = item_data["qty"]

        inventory, created = Inventory.objects.get_or_create(
            medicine=product,
            batch_number=lot,
            location_code="STORE",
            defaults={
                "manufacturer": "",
                "manufacture_date": today,
                "expiry_date": expiry_date,
                "stock_quantity": qty,
                "purchase_price": item_data["mrp"],
                "selling_price": item_data["mrp"],
            },
        )
        if not created:
            inventory.expiry_date = expiry_date
            inventory.stock_quantity = max(inventory.stock_quantity, qty)
            inventory.purchase_price = item_data["mrp"]
            inventory.selling_price = item_data["mrp"]
            inventory.save(
                update_fields=["expiry_date", "stock_quantity", "purchase_price", "selling_price", "updated_at"]
            )

    def _write_order(self, instance=None):
        data = self.validated_data
        request = self.context["request"]
        items_data = data.get("items")
        order_user = self._resolve_order_user(request)

        with transaction.atomic():
            order = instance or Order(user=order_user)
            if "bill_no" in data:
                order.order_number = data["bill_no"]
            if "patient_name" in data:
                order.patient_name = data["patient_name"]
            if "patient_address" in data:
                order.patient_address = data["patient_address"]
                order.shipping_address = data["patient_address"]
            if "patient_dr" in data:
                order.patient_doctor = data.get("patient_dr", "")
            if "payment_mode" in data:
                order.payment_mode = data["payment_mode"]
            if "total" in data:
                order.total_amount = data["total"]
            if "disc" in data:
                order.discount_amount = data["disc"]
            if "taxable" in data:
                order.taxable_amount = data["taxable"]
            if "gst" in data:
                order.gst_amount = data["gst"]
            if "cgst" in data:
                order.cgst_amount = data["cgst"]
            if "sgst" in data:
                order.sgst_amount = data["sgst"]
            if "cess" in data:
                order.cess_amount = data["cess"]
            if "igst" in data:
                order.igst_amount = data["igst"]
            if "payable_amt" in data:
                order.payable_amount = data["payable_amt"]
            order.save()

            if items_data is not None and instance:
                order.items.all().delete()

            if items_data is not None:
                for item in items_data:
                    product = self._get_or_create_product(item)
                    self._create_or_update_inventory(product, item)
                    OrderItem.objects.create(
                        order=order,
                        product=product,
                        quantity=item["qty"],
                        mrp=item["mrp"],
                        lot=item.get("lot", ""),
                        exp=item.get("exp", ""),
                        hsn=item.get("hsn", ""),
                        gst=item.get("gst", Decimal("0")),
                        cgst=item.get("cgst", Decimal("0")),
                        sgst=item.get("sgst", Decimal("0")),
                        net=item["net"],
                        price_at_purchase=item["mrp"],
                        total_price=item["net"],
                    )

            return order

    def _resolve_order_user(self, request):
        if getattr(request.user, "is_authenticated", False):
            return request.user

        User = get_user_model()
        guest_user = User.objects.filter(username="walkin_customer").first()
        if guest_user:
            return guest_user

        guest_user = User.objects.create_user(
            username="walkin_customer",
            email="walkin_customer@local.store",
            mobile_number="9000000000",
            password=User.objects.make_random_password(),
            first_name="Walk-in",
            last_name="Customer",
        )
        guest_user.is_active = True
        guest_user.save(update_fields=["is_active"])
        return guest_user

    def create(self, validated_data):
        return self._write_order()

    def update(self, instance, validated_data):
        return self._write_order(instance=instance)


class BillingOrderReadItemSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="product.name", read_only=True)
    qty = serializers.IntegerField(source="quantity", read_only=True)

    class Meta:
        model = OrderItem
        fields = ["id", "item_name", "qty", "mrp", "lot", "exp", "hsn", "gst", "cgst", "sgst", "net"]


class BillingOrderReadSerializer(serializers.ModelSerializer):
    bill_no = serializers.CharField(source="order_number", read_only=True)
    patient_dr = serializers.CharField(source="patient_doctor", read_only=True)
    total = serializers.DecimalField(source="total_amount", max_digits=12, decimal_places=2, read_only=True)
    disc = serializers.DecimalField(source="discount_amount", max_digits=12, decimal_places=2, read_only=True)
    taxable = serializers.DecimalField(source="taxable_amount", max_digits=12, decimal_places=2, read_only=True)
    gst = serializers.DecimalField(source="gst_amount", max_digits=12, decimal_places=2, read_only=True)
    cgst = serializers.DecimalField(source="cgst_amount", max_digits=12, decimal_places=2, read_only=True)
    sgst = serializers.DecimalField(source="sgst_amount", max_digits=12, decimal_places=2, read_only=True)
    cess = serializers.DecimalField(source="cess_amount", max_digits=12, decimal_places=2, read_only=True)
    igst = serializers.DecimalField(source="igst_amount", max_digits=12, decimal_places=2, read_only=True)
    payable_amt = serializers.DecimalField(source="payable_amount", max_digits=12, decimal_places=2, read_only=True)
    items = BillingOrderReadItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            "id",
            "bill_no",
            "patient_name",
            "patient_address",
            "patient_dr",
            "payment_mode",
            "items",
            "total",
            "disc",
            "taxable",
            "gst",
            "cgst",
            "sgst",
            "cess",
            "igst",
            "payable_amt",
            "created_at",
            "updated_at",
        ]
