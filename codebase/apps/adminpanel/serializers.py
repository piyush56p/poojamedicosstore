from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.catalog.models import Category, Company, Inventory, Product, Salt

from .models import StockBillUpload
from apps.orders.models import Order, OrderItem
from apps.prescriptions.models import Prescription
from apps.users.models import UserAddress

User = get_user_model()

INTERNAL_TO_ADMIN_STATUS = {
    "PENDING": "PENDING",
    "CONFIRMED": "APPROVED",
    "SHIPPED": "DISPATCHED",
    "DELIVERED": "DELIVERED",
    "CANCELLED": "CANCELLED",
}

ADMIN_TO_INTERNAL_STATUS = {
    "PENDING": "PENDING",
    "APPROVED": "CONFIRMED",
    "DISPATCHED": "SHIPPED",
    "DELIVERED": "DELIVERED",
    "CANCELLED": "CANCELLED",
    # Also accept internal names in case admin UI sends them.
    "CONFIRMED": "CONFIRMED",
    "SHIPPED": "SHIPPED",
}

ALLOWED_STATUS_TRANSITIONS = {
    "PENDING": {"CONFIRMED"},
    "CONFIRMED": {"SHIPPED"},
    "SHIPPED": {"DELIVERED"},
    "DELIVERED": set(),
    "CANCELLED": set(),
}

FAQ_SCHEMA_KEYS = [
    "what_is_this_medicine_for",
    "how_to_take_this_medicine",
    "what_are_the_common_side_effects",
    "can_i_take_it_with_other_medicines",
    "what_if_i_miss_a_dose",
]


class AdminUserAddressSerializer(serializers.ModelSerializer):
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


class AdminCustomerListSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "mobile_number",
            "role",
            "is_active",
            "is_mobile_verified",
            "date_joined",
        ]


class AdminOrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = OrderItem
        fields = ["id", "product", "product_name", "quantity", "price_at_purchase", "total_price"]


class AdminOrderSerializer(serializers.ModelSerializer):
    items = AdminOrderItemSerializer(many=True, read_only=True)
    customer_id = serializers.IntegerField(source="user.id", read_only=True)
    customer_name = serializers.CharField(source="user.username", read_only=True)
    admin_status = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "order_number",
            "status",
            "admin_status",
            "payment_mode",
            "customer_id",
            "customer_name",
            "total_amount",
            "shipping_address",
            "city",
            "state",
            "pincode",
            "items",
            "created_at",
            "updated_at",
        ]

    def get_admin_status(self, obj):
        return INTERNAL_TO_ADMIN_STATUS.get(obj.status, obj.status)


class AdminPrescriptionSerializer(serializers.ModelSerializer):
    customer_id = serializers.IntegerField(source="user.id", read_only=True)
    customer_name = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Prescription
        fields = [
            "id",
            "customer_id",
            "customer_name",
            "image",
            "status",
            "extracted_text",
            "ai_suggested_medicines",
            "uploaded_at",
            "reviewed_at",
        ]


class AdminCustomerDetailSerializer(serializers.ModelSerializer):
    addresses = AdminUserAddressSerializer(many=True, read_only=True)
    prescriptions = AdminPrescriptionSerializer(many=True, read_only=True)
    orders = AdminOrderSerializer(many=True, read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "mobile_number",
            "role",
            "is_active",
            "is_mobile_verified",
            "is_email_verified",
            "date_joined",
            "address_line",
            "city",
            "state",
            "pincode",
            "addresses",
            "prescriptions",
            "orders",
        ]


class AdminCustomerUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "first_name",
            "last_name",
            "email",
            "mobile_number",
            "is_active",
            "is_mobile_verified",
            "is_email_verified",
            "address_line",
            "city",
            "state",
            "pincode",
        ]


class AdminOrderItemInputSerializer(serializers.Serializer):
    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=Product.objects.filter(is_active=True),
    )
    quantity = serializers.IntegerField(min_value=1)


class AdminOrderCreateSerializer(serializers.Serializer):
    customer_id = serializers.PrimaryKeyRelatedField(source="user", queryset=User.objects.all())
    payment_mode = serializers.ChoiceField(choices=["COD", "PREPAID"], default="COD", required=False)
    shipping_address = serializers.CharField()
    city = serializers.CharField(max_length=100)
    state = serializers.CharField(max_length=100)
    pincode = serializers.CharField(max_length=10)
    items = AdminOrderItemInputSerializer(many=True)

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError("At least one item is required.")
        return items


class AdminOrderUpdateSerializer(serializers.ModelSerializer):
    customer_id = serializers.PrimaryKeyRelatedField(
        source="user",
        queryset=User.objects.all(),
        required=False,
    )
    payment_mode = serializers.ChoiceField(choices=["COD", "PREPAID"], required=False)
    items = AdminOrderItemInputSerializer(many=True, required=False)

    class Meta:
        model = Order
        fields = ["customer_id", "payment_mode", "shipping_address", "city", "state", "pincode", "items"]

    def validate_items(self, items):
        if items is not None and len(items) == 0:
            raise serializers.ValidationError("If provided, items cannot be empty.")
        return items


class AdminOrderStatusUpdateSerializer(serializers.Serializer):
    status = serializers.CharField()

    def validate_status(self, value):
        normalized = str(value).strip().upper()
        mapped = ADMIN_TO_INTERNAL_STATUS.get(normalized)
        if not mapped:
            raise serializers.ValidationError("Invalid status.")
        return mapped


class AdminInventoryCategorySerializer(serializers.ModelSerializer):
    product_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ["id", "name", "slug", "description", "product_count", "created_at"]
        read_only_fields = ["id", "slug", "product_count", "created_at"]

    def get_product_count(self, obj):
        return obj.products.count()


class AdminInventoryCompanySerializer(serializers.ModelSerializer):
    product_count = serializers.SerializerMethodField()

    class Meta:
        model = Company
        fields = ["id", "name", "product_count", "created_at"]
        read_only_fields = ["id", "product_count", "created_at"]

    def get_product_count(self, obj):
        return obj.products.count()


class AdminInventoryProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    resolved_company_name = serializers.SerializerMethodField()
    in_stock = serializers.BooleanField(read_only=True)
    salts = serializers.PrimaryKeyRelatedField(queryset=Salt.objects.all(), many=True, required=False)
    salt_names = serializers.StringRelatedField(source="salts", many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "sku",
            "batch_number",
            "company_name",
            "resolved_company_name",
            "description",
            "ingredients_list",
            "concerns_list",
            "prevents_list",
            "needs_list",
            "product_details",
            "in_depth_information",
            "allergic_warning",
            "otc_information",
            "habit_forming_information",
            "diet_lifestyle_advice",
            "consume_type",
            "safety_advice",
            "faqs",
            "country_of_origin",
            "strength",
            "size",
            "prescription_required",
            "uses",
            "directions_for_use",
            "category",
            "category_name",
            "company",
            "salts",
            "salt_names",
            "price",
            "stock_quantity",
            "unit",
            "in_stock",
            "image_url",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "category_name",
            "resolved_company_name",
            "in_stock",
            "salt_names",
            "price",
            "stock_quantity",
        ]

    def get_resolved_company_name(self, obj):
        if obj.company:
            return obj.company.name
        return obj.company_name

    def validate(self, attrs):
        category = attrs.get("category") or getattr(self.instance, "category", None)
        unit = attrs.get("unit") or getattr(self.instance, "unit", None)
        size = attrs.get("size")
        faqs = attrs.get("faqs")
        if size is None and self.instance is not None:
            size = self.instance.size

        if faqs is not None:
            if not isinstance(faqs, dict):
                raise serializers.ValidationError({"faqs": "FAQs must be a JSON object with 5 standard keys."})
            missing = [k for k in FAQ_SCHEMA_KEYS if k not in faqs]
            extra = [k for k in faqs.keys() if k not in FAQ_SCHEMA_KEYS]
            if missing or extra:
                raise serializers.ValidationError(
                    {
                        "faqs": {
                            "required_keys": FAQ_SCHEMA_KEYS,
                            "missing_keys": missing,
                            "extra_keys": extra,
                        }
                    }
                )

        if category:
            category_name = (category.name or "").strip().lower()
            if category_name in {"tablet", "capsule"}:
                if unit not in {"piece", "strip"}:
                    raise serializers.ValidationError(
                        {"unit": "For tablet/capsule medicines, unit must be 'piece' (single) or 'strip'."}
                    )

                if unit == "piece":
                    expected = f"1 {category_name}"
                    provided = (size or "").strip().lower()
                    if provided != expected:
                        raise serializers.ValidationError(
                            {"size": f"For single {category_name}, size must be '{expected}'."}
                        )

        return attrs

    def create(self, validated_data):
        salts = validated_data.pop("salts", [])
        obj = super().create(validated_data)
        if salts:
            obj.salts.set(salts)
        return obj

    def update(self, instance, validated_data):
        salts = validated_data.pop("salts", None)
        obj = super().update(instance, validated_data)
        if salts is not None:
            obj.salts.set(salts)
        return obj


class AdminInventoryBatchSerializer(serializers.ModelSerializer):
    medicine_name = serializers.CharField(source="medicine.name", read_only=True)

    class Meta:
        model = Inventory
        fields = [
            "id",
            "medicine",
            "medicine_name",
            "batch_number",
            "manufacturer",
            "manufacture_date",
            "expiry_date",
            "location_code",
            "stock_quantity",
            "purchase_price",
            "selling_price",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "medicine_name"]


class AdminSaltSerializer(serializers.ModelSerializer):
    medicine_count = serializers.SerializerMethodField()

    class Meta:
        model = Salt
        fields = ["id", "name", "description", "medicine_count", "created_at"]
        read_only_fields = ["id", "medicine_count", "created_at"]

    def get_medicine_count(self, obj):
        return obj.medicines.count()


class StockBillUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockBillUpload
        fields = [
            "id",
            "pdf_file",
            "original_filename",
            "status",
            "result_summary",
            "parsed_lines",
            "error_message",
            "uploaded_at",
            "processed_at",
        ]
        read_only_fields = [
            "id",
            "original_filename",
            "status",
            "result_summary",
            "parsed_lines",
            "error_message",
            "uploaded_at",
            "processed_at",
        ]
