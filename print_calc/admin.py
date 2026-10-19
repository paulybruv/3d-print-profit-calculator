"""
Admin configuration for the print_calc application.

Registers PrinterMachine and SavedPrint models with customized list displays,
filters, and search fields to support backend data administration.
"""

from django.contrib import admin
from .models import PrinterMachine, SavedPrint


@admin.register(PrinterMachine)
class PrinterMachineAdmin(admin.ModelAdmin):
    """Admin interface configuration for PrinterMachine hardware specs."""

    list_display = (
        "name",
        "brand",
        "default_watts",
        "average_watts_pla",
        "average_watts_abs",
        "depreciation_per_hour",
    )
    list_filter = ("brand",)
    search_fields = ("name", "brand")
    ordering = ("brand", "name")


@admin.register(SavedPrint)
class SavedPrintAdmin(admin.ModelAdmin):
    """Admin interface configuration for user-saved print calculations."""

    list_display = (
        "item_name",
        "user",
        "printer",
        "filament_type",
        "total_cost",
        "recommended_retail_price",
        "profit_per_item",
        "created_on",
    )
    list_filter = ("filament_type", "printer", "created_on")
    search_fields = ("item_name", "user__username")
    readonly_fields = (
        "total_cost",
        "recommended_retail_price",
        "profit_per_item",
        "created_on",
    )
    ordering = ("-created_on",)
