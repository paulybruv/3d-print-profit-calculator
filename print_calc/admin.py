from django.contrib import admin
from .models import PrinterMachine, SavedPrint


@admin.register(PrinterMachine)
class PrinterMachineAdmin(admin.ModelAdmin):
    list_display = (
        "brand",
        "name",
        "average_watts_pla",
        "average_watts_abs",
    )
    search_fields = ("name", "brand")


@admin.register(SavedPrint)
class SavedPrintAdmin(admin.ModelAdmin):
    list_display = (
        "item_name",
        "user",
        "filament_type",
        "total_cost",
        "recommended_retail_price",
        "created_on",
    )
    list_filter = ("filament_type", "created_on")
    search_fields = ("item_name", "user__username")