from django.urls import path
from .views import ProductListView, ProductDetailView, CategoryListView, CompanyListView

urlpatterns = [
    path("products/", ProductListView.as_view()),
    path("products/<int:pk>/", ProductDetailView.as_view()),
    path("categories/", CategoryListView.as_view()),
    path("companies/", CompanyListView.as_view()),
]
