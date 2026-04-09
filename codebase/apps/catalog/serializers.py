from rest_framework import serializers
from .models import Category, Company, Inventory, Product, Salt


class CategorySerializer(serializers.ModelSerializer):
    product_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ["id", "name", "slug", "description", "product_count"]

    def get_product_count(self, obj):
        return obj.products.filter(is_active=True).count()


class CompanySerializer(serializers.ModelSerializer):
    product_count = serializers.SerializerMethodField()

    class Meta:
        model = Company
        fields = ["id", "name", "product_count"]

    def get_product_count(self, obj):
        return obj.products.filter(is_active=True).count()


class ProductListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list view with filters/pagination"""
    category_name = serializers.CharField(source="category.name", read_only=True)
    company_name = serializers.SerializerMethodField()
    in_stock = serializers.BooleanField(read_only=True)
    salts = serializers.StringRelatedField(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "sku",
            "batch_number",
            "ingredients_list",
            "concerns_list",
            "prevents_list",
            "needs_list",
            "strength",
            "size",
            "prescription_required",
            "category",
            "category_name",
            "company",
            "company_name",
            "salts",
            "price",
            "stock_quantity",
            "unit",
            "in_stock",
            "image_url",
            "is_active",
        ]

    def get_company_name(self, obj):
        if obj.company:
            return obj.company.name
        return obj.company_name


class ProductDetailSerializer(serializers.ModelSerializer):
    """Full serializer for single product view"""
    category_name = serializers.CharField(source="category.name", read_only=True)
    company_name = serializers.SerializerMethodField()
    in_stock = serializers.BooleanField(read_only=True)
    salts = serializers.StringRelatedField(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "sku",
            "batch_number",
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
            "company_name",
            "salts",
            "price",
            "stock_quantity",
            "unit",
            "in_stock",
            "image_url",
            "is_active",
            "created_at",
            "updated_at",
        ]

    def get_company_name(self, obj):
        if obj.company:
            return obj.company.name
        return obj.company_name


class SaltSerializer(serializers.ModelSerializer):
    class Meta:
        model = Salt
        fields = ["id", "name", "description"]


class InventorySerializer(serializers.ModelSerializer):
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
