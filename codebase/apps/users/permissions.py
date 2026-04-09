from rest_framework.permissions import BasePermission


class IsAdminRole(BasePermission):
    message = "Admin access required."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (getattr(user, "role", "") == "ADMIN" or user.is_staff or user.is_superuser)
        )
