"""
URL configuration for the main config project.

Routes traffic to the Django admin site and includes URL patterns
from the print_calc application.
"""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("print_calc.urls")),
]
