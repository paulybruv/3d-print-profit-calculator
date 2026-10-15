"""
URL routing patterns for the print_calc application.

Maps root routes for calculator, catalogue, and edit views.
"""

from django.urls import path
from . import views

urlpatterns = [
    path("", views.calculator_view, name="calculator"),
    path("catalogue/", views.catalogue_view, name="catalogue"),
    path("edit/<int:pk>/", views.edit_print_view, name="edit_print"),
]
