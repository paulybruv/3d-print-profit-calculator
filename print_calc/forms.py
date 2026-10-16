from django import forms
from .models import SavedPrint


class SavedPrintForm(forms.ModelForm):
    """Form for capturing 3D print parameters."""

    class Meta:
        model = SavedPrint
        fields = [
            "item_name",
            "printer",
            "filament_type",
            "spool_price_per_kg",
            "filament_grams_used",
            "print_time_hours",
            "electricity_rate_kwh",
            "markup_percentage",
        ]
        widgets = {
            "item_name": forms.TextInput(
                attrs={
                    "class": "form-control",
                    "placeholder": "e.g., Flexi Dragon",
                }
            ),
            "printer": forms.Select(attrs={"class": "form-select"}),
            "filament_type": forms.Select(attrs={"class": "form-select"}),
            "spool_price_per_kg": forms.NumberInput(
                attrs={"class": "form-control", "step": "0.01"}
            ),
            "filament_grams_used": forms.NumberInput(
                attrs={"class": "form-control"}
            ),
            "print_time_hours": forms.NumberInput(
                attrs={"class": "form-control", "step": "0.1"}
            ),
            "electricity_rate_kwh": forms.NumberInput(
                attrs={"class": "form-control", "step": "0.01"}
            ),
            "markup_percentage": forms.NumberInput(
                attrs={"class": "form-control"}
            ),
        }
