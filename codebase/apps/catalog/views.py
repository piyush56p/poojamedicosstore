from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from django.db.models import Q
from django.core.paginator import Paginator, EmptyPage

from .models import Category, Company, Product
from .serializers import CategorySerializer, CompanySerializer, ProductListSerializer, ProductDetailSerializer


class ProductListView(APIView):
    """GET products with filters and pagination. Public - no auth required."""
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        queryset = Product.objects.filter(is_active=True).select_related("category", "company")

        # Filters
        search = request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(description__icontains=search)
                | Q(sku__icontains=search)
                | Q(salts__name__icontains=search)
            )

        category_id = request.query_params.get("category")
        if category_id:
            queryset = queryset.filter(category_id=category_id)

        company_id = request.query_params.get("company")
        if company_id:
            queryset = queryset.filter(company_id=company_id)

        min_price = request.query_params.get("min_price")
        if min_price is not None:
            try:
                queryset = queryset.filter(price__gte=float(min_price))
            except (ValueError, TypeError):
                pass

        max_price = request.query_params.get("max_price")
        if max_price is not None:
            try:
                queryset = queryset.filter(price__lte=float(max_price))
            except (ValueError, TypeError):
                pass

        in_stock = request.query_params.get("in_stock")
        if in_stock and str(in_stock).lower() in ("true", "1", "yes"):
            queryset = queryset.filter(stock_quantity__gt=0)
        strength = request.query_params.get("strength", "").strip()
        if strength:
            queryset = queryset.filter(strength__icontains=strength)
        queryset = queryset.distinct()

        # Pagination
        page_size = min(int(request.query_params.get("page_size", 20)), 100)
        page_number = request.query_params.get("page", 1)
        paginator = Paginator(queryset, page_size)

        try:
            page = paginator.page(page_number)
        except EmptyPage:
            page = paginator.page(1)

        serializer = ProductListSerializer(page.object_list, many=True)

        return Response({
            "count": paginator.count,
            "total_pages": paginator.num_pages,
            "current_page": page.number,
            "page_size": page_size,
            "results": serializer.data,
        }, status=status.HTTP_200_OK)


class ProductDetailView(APIView):
    """GET single product by ID."""
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        try:
            product = Product.objects.get(pk=pk, is_active=True)
        except Product.DoesNotExist:
            return Response({"message": "Product not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = ProductDetailSerializer(product)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ProductSubstituteView(APIView):
    """Get substitute medicines by same salt(s) and strength with stock."""
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        try:
            product = Product.objects.prefetch_related("salts").get(pk=pk)
        except Product.DoesNotExist:
            return Response({"message": "Product not found"}, status=status.HTTP_404_NOT_FOUND)

        salt_ids = list(product.salts.values_list("id", flat=True))
        if not salt_ids:
            return Response({"count": 0, "results": []}, status=status.HTTP_200_OK)

        substitutes = (
            Product.objects.filter(salts__id__in=salt_ids, stock_quantity__gt=0, is_active=True)
            .exclude(pk=product.pk)
            .filter(strength=product.strength)
            .select_related("category", "company")
            .distinct()
        )
        serializer = ProductListSerializer(substitutes, many=True)
        return Response({"count": len(serializer.data), "results": serializer.data}, status=status.HTTP_200_OK)


class CategoryListView(APIView):
    """GET all categories (for filter dropdowns)."""
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        categories = Category.objects.all().order_by("name")
        serializer = CategorySerializer(categories, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class CompanyListView(APIView):
    """GET all companies (for filter dropdowns)."""
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        companies = Company.objects.all().order_by("name")
        serializer = CompanySerializer(companies, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
