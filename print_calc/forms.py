from django import forms
from .models import PrinterMachine, SavedPrint

BRAND_ORDER = [
    "Bambu Lab",
    "Prusa",
    "Creality",
    "Elegoo",
    "Anycubic",
    "Resin",
    "Custom",
]


class SavedPrintForm(forms.ModelForm):
    """Form for capturing 3D print parameters with brand-grouped printers."""

    class Meta:
        model = SavedPrint
        fields = [
            "item_name",
            "printer",
            "machine_watts",
            "hourly_depreciation",
            "filament_type",
            "spool_price_per_kg",
            "filament_grams_used",
            "print_time_hours",
            "electricity_rate_kwh",
            "markup_percentage",
        ]
        labels = {
            "printer": "Printer Hardware Model",
            "machine_watts": "Machine Wattage (Watts)",
            "hourly_depreciation": "Hourly Wear / Depreciation (£/hr)",
            "electricity_rate_kwh": "Electricity Cost per kWh",
        }
        widgets = {
            "item_name": forms.TextInput(
                attrs={
                    "class": "form-control",
                    "placeholder": "e.g., Flexi Dragon",
                }
            ),
            "printer": forms.Select(attrs={"class": "form-select"}),
            "machine_watts": forms.NumberInput(
                attrs={
                    "class": "form-control",
                    "min": "1",
                    "placeholder": "Auto-filled by printer",
                }
            ),
            "hourly_depreciation": forms.NumberInput(
                attrs={
                    "class": "form-control",
                    "step": "0.01",
                    "min": "0.00",
                    "placeholder": "Auto-filled by printer",
                }
            ),
            "filament_type": forms.Select(attrs={"class": "form-select"}),
            "spool_price_per_kg": forms.NumberInput(
                attrs={"class": "form-control", "step": "0.01", "min": "0.01"}
            ),
            "filament_grams_used": forms.NumberInput(
                attrs={"class": "form-control", "min": "1"}
            ),
            "print_time_hours": forms.NumberInput(
                attrs={"class": "form-control", "step": "0.1", "min": "0.01"}
            ),
            "electricity_rate_kwh": forms.NumberInput(
                attrs={
                    "class": "form-control",
                    "step": "0.001",
                    "min": "0.001",
                }
            ),
            "markup_percentage": forms.NumberInput(
                attrs={"class": "form-control", "min": "0"}
            ),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        printers = list(PrinterMachine.objects.all().order_by("id"))
        grouped = {}
        for printer in printers:
            group_name = printer.brand or "Other"
            grouped.setdefault(group_name, []).append(
                (printer.pk, str(printer))
            )

        ordered_groups = []
        for brand in BRAND_ORDER:
            if brand in grouped:
                ordered_groups.append((brand, grouped.pop(brand)))
        for remaining_brand, items in grouped.items():
            ordered_groups.append((remaining_brand, items))

        self.fields["printer"].choices = [
            ("", "--- Select a 3D Printer ---"),
            *ordered_groups,
        ]
