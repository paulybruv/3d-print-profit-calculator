from django.urls import path
from . import views

urlpatterns = [
    path('', views.calculator_view, name='calculator'),
    path('catalogue/', views.catalogue_view, name='catalogue'),
]
