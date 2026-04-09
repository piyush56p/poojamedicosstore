# apps/orders/urls.py

from django.urls import path
from .views import (
    CartListCreateView,
    CartDetailView,
    CartItemAddView,
    CartItemUpdateView,
    CartItemRemoveView,
    WishlistListCreateView,
    WishlistDetailView,
    WishlistAddProductView,
    WishlistRemoveProductView,
    CheckoutView,
    OrderListView,
    OrderDetailView,
    OrderBillDownloadView,
    OrderBillShareView,
)

urlpatterns = [
    # Carts
    path("carts/", CartListCreateView.as_view()),
    path("carts/<int:pk>/", CartDetailView.as_view()),
    path("carts/<int:cart_pk>/items/", CartItemAddView.as_view()),
    path("carts/<int:cart_pk>/items/<int:item_pk>/", CartItemUpdateView.as_view()),
    path("carts/<int:cart_pk>/items/<int:item_pk>/remove/", CartItemRemoveView.as_view()),
    # Wishlists (max 5)
    path("wishlists/", WishlistListCreateView.as_view()),
    path("wishlists/<int:pk>/", WishlistDetailView.as_view()),
    path("wishlists/<int:pk>/products/", WishlistAddProductView.as_view()),
    path("wishlists/<int:pk>/products/<int:product_id>/", WishlistRemoveProductView.as_view()),
    # Checkout & Orders
    path("checkout/", CheckoutView.as_view()),
    path("orders/", OrderListView.as_view()),
    path("orders/<int:pk>/", OrderDetailView.as_view()),
    path("orders/<int:pk>/bill/download/", OrderBillDownloadView.as_view()),
    path("orders/<int:pk>/bill/share/", OrderBillShareView.as_view()),
]
