from django.urls import path
from .views import ProductListView, ProductDetailView, ProductSubstituteView, CategoryListView, CompanyListView

urlpatterns = [
    path("products/", ProductListView.as_view()),
    path("products/<int:pk>/", ProductDetailView.as_view()),
    path("products/<int:pk>/substitutes/", ProductSubstituteView.as_view()),
    path("categories/", CategoryListView.as_view()),
    path("companies/", CompanyListView.as_view()),
]
