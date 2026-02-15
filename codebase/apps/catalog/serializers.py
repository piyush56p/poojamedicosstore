from rest_framework import serializers
from .models import Category, Company, Product


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
    company_name = serializers.CharField(source="company.name", read_only=True, allow_null=True)
    in_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "sku",
            "category",
            "category_name",
            "company",
            "company_name",
            "price",
            "stock_quantity",
            "unit",
            "in_stock",
            "image_url",
            "is_active",
        ]


class ProductDetailSerializer(serializers.ModelSerializer):
    """Full serializer for single product view"""
    category_name = serializers.CharField(source="category.name", read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True, allow_null=True)
    in_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "sku",
            "description",
            "category",
            "category_name",
            "company",
            "company_name",
            "price",
            "stock_quantity",
            "unit",
            "in_stock",
            "image_url",
            "is_active",
            "created_at",
            "updated_at",
        ]
