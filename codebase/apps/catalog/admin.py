from django.contrib import admin
from .models import Category, Company, Product


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "created_at"]
    prepopulated_fields = {"slug": ("name",)}
    search_fields = ["name"]


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ["name", "created_at"]
    search_fields = ["name"]


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ["name", "category", "company", "price", "stock_quantity", "unit", "is_active"]
    list_filter = ["category", "company", "is_active"]
    search_fields = ["name", "sku", "description"]
    list_editable = ["price", "stock_quantity", "is_active"]
    autocomplete_fields = ["category", "company"]
