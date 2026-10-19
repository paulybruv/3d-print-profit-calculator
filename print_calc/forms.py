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
    """Form for capturing commercial 3D print pricing parameters."""

    class Meta:
        model = SavedPrint
        fields = [
            "item_name",
            "plate_quantity",
            "flat_setup_cost",
            "per_unit_post_cost",
            "printer",
            "machine_watts",
            "hourly_depreciation",
            "filament_type",
            "spool_price_per_kg",
            "filament_grams_used",
            "is_multicolor_run",
            "purge_grams",
            "spools_json",
            "print_time_hours",
            "electricity_rate_kwh",
            "hardware_json",
            "markup_percentage",
            "apply_min_floor",
            "min_floor_charge",
        ]
        labels = {
            "item_name": "Project / Model Name",
            "plate_quantity": "Quantity on Build Plate",
            "flat_setup_cost": "Flat Batch Setup / Prep Labor",
            "per_unit_post_cost": "Per-Unit Post-Processing / Packaging",
            "printer": "Printer Hardware Model",
            "machine_watts": "Machine Wattage (Watts)",
            "hourly_depreciation": "Hourly Wear / Depreciation (£/hr)",
            "filament_type": "Primary Filament Material",
            "spool_price_per_kg": "Spool Cost per kg",
            "filament_grams_used": "Model Filament Weight (Grams)",
            "is_multicolor_run": "Multi-Color / AMS Run?",
            "purge_grams": "Purge / Waste (Grams)",
            "print_time_hours": "Total Plate Print Time (Hours)",
            "electricity_rate_kwh": "Electricity Cost per kWh",
            "markup_percentage": "Target Markup Percentage",
            "apply_min_floor": (
                "Apply Minimum Order Floor Charge (£4.00 default)"
            ),
            "min_floor_charge": "Minimum Order Floor Charge",
        }
        widgets = {
            "item_name": forms.TextInput(
                attrs={
                    "class": "form-control",
                    "placeholder": "e.g., Articulated Flexi Dragon",
                }
            ),
            "plate_quantity": forms.NumberInput(
                attrs={"class": "form-control", "min": "1", "max": "500"}
            ),
            "flat_setup_cost": forms.NumberInput(
                attrs={
                    "class": "form-control",
                    "step": "0.01",
                    "min": "0.00",
                }
            ),
            "per_unit_post_cost": forms.NumberInput(
                attrs={
                    "class": "form-control",
                    "step": "0.01",
                    "min": "0.00",
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
            "is_multicolor_run": forms.CheckboxInput(
                attrs={"class": "form-check-input", "role": "switch"}
            ),
            "purge_grams": forms.NumberInput(
                attrs={"class": "form-control", "step": "0.1", "min": "0.0"}
            ),
            "spools_json": forms.HiddenInput(),
            "print_time_hours": forms.NumberInput(
                attrs={"class": "form-control", "step": "0.01", "min": "0.01"}
            ),
            "electricity_rate_kwh": forms.NumberInput(
                attrs={
                    "class": "form-control",
                    "step": "0.001",
                    "min": "0.001",
                }
            ),
            "hardware_json": forms.HiddenInput(),
            "markup_percentage": forms.NumberInput(
                attrs={"class": "form-control", "min": "0"}
            ),
            "apply_min_floor": forms.CheckboxInput(
                attrs={"class": "form-check-input", "role": "switch"}
            ),
            "min_floor_charge": forms.NumberInput(
                attrs={"class": "form-control", "step": "0.01", "min": "0.00"}
            ),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if "item_name" in self.fields:
            self.fields["item_name"].help_text = ""
        for optional_field in [
            "plate_quantity",
            "flat_setup_cost",
            "per_unit_post_cost",
            "is_multicolor_run",
            "purge_grams",
            "spools_json",
            "hardware_json",
            "apply_min_floor",
            "min_floor_charge",
        ]:
            if optional_field in self.fields:
                self.fields[optional_field].required = False

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

    def clean_plate_quantity(self):
        val = self.cleaned_data.get("plate_quantity")
        return val if val is not None else 1

    def clean_flat_setup_cost(self):
        val = self.cleaned_data.get("flat_setup_cost")
        return val if val is not None else 0

    def clean_per_unit_post_cost(self):
        val = self.cleaned_data.get("per_unit_post_cost")
        return val if val is not None else 0

    def clean_purge_grams(self):
        val = self.cleaned_data.get("purge_grams")
        return val if val is not None else 0

    def clean_min_floor_charge(self):
        val = self.cleaned_data.get("min_floor_charge")
        return val if val is not None else 4
