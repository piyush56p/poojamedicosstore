"""
Custom middleware for the config project.
"""
import logging

logger = logging.getLogger(__name__)


class RequestLoggingMiddleware:
    """Log each incoming request (method + path) to the terminal."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        logger.info("%s %s -> %s", request.method, request.path, response.status_code)
        print(f"[API] {request.method} {request.path} -> {response.status_code}")
        return response
