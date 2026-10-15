"""
URL routing patterns for the print_calc application.

Includes routes for the calculator, user catalogue, editing prints,
and standard Django authentication (login, logout, signup).
"""

from django.contrib.auth import views as auth_views
from django.urls import path
from . import views

urlpatterns = [
    # Main calculator and dashboard
    path("", views.calculator_view, name="calculator"),
    path("catalogue/", views.catalogue_view, name="catalogue"),
    path("edit/<int:pk>/", views.edit_print_view, name="edit_print"),
    path("delete/<int:pk>/", views.delete_print_view, name="delete_print"),
    # Standard Built-in Authentication
    path(
        "login/",
        auth_views.LoginView.as_view(
            template_name="print_calc/login.html",
        ),
        name="login",
    ),
    path(
        "logout/",
        auth_views.LogoutView.as_view(
            template_name="print_calc/logout.html",
        ),
        name="logout",
    ),
    path("signup/", views.signup_view, name="signup"),
]
