from django.contrib.auth.models import User
from django.db import models


class PrinterMachine(models.Model):
    """Stores 3D printer models and average power consumption in watts."""

    name = models.CharField(max_length=100, unique=True)
    brand = models.CharField(max_length=50)
    average_watts_pla = models.PositiveIntegerField(
        help_text="Average watts used printing PLA/PETG"
    )
    average_watts_abs = models.PositiveIntegerField(
        help_text="Average watts used printing ABS/high-temp filaments"
    )

    def __str__(self):
        return f"{self.brand} {self.name}"


class SavedPrint(models.Model):
    """Stores custom 3D print pricing calculations and retail costs."""

    FILAMENT_CHOICES = [
        ("PLA", "PLA"),
        ("PETG", "PETG"),
        ("ABS", "ABS / ASA"),
        ("TPU", "TPU (Flexible)"),
    ]

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="saved_prints"
    )
    item_name = models.CharField(
        max_length=150, help_text="e.g., Articulated Flexi Dragon"
    )
    printer = models.ForeignKey(
        PrinterMachine,
        on_delete=models.SET_NULL,
        null=True,
        help_text="Machine used for this print",
    )
    filament_type = models.CharField(
        max_length=20, choices=FILAMENT_CHOICES, default="PLA"
    )
    spool_price_per_kg = models.DecimalField(
        max_digits=6, decimal_places=2, help_text="Cost per 1kg spool in £"
    )
    filament_grams_used = models.PositiveIntegerField(
        help_text="Total filament used in grams"
    )
    print_time_hours = models.DecimalField(
        max_digits=5, decimal_places=2, help_text="Total print time in hours"
    )
    electricity_rate_kwh = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=0.25,
        help_text="Cost per kWh in £",
    )
    markup_percentage = models.PositiveIntegerField(
        default=100, help_text="Desired profit markup %"
    )

    total_cost = models.DecimalField(
        max_digits=8, decimal_places=2, blank=True, null=True
    )
    recommended_retail_price = models.DecimalField(
        max_digits=8, decimal_places=2, blank=True, null=True
    )
    profit_per_item = models.DecimalField(
        max_digits=8, decimal_places=2, blank=True, null=True
    )
    created_on = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        """Calculates costs and retail prices using custom logic."""
        filament_cost = (
            float(self.spool_price_per_kg) / 1000
        ) * self.filament_grams_used

        watts = (
            self.printer.average_watts_abs
            if self.filament_type in ["ABS", "TPU"]
            else self.printer.average_watts_pla
        )
        electricity_cost = (
            (float(watts) / 1000)
            * float(self.print_time_hours)
            * float(self.electricity_rate_kwh)
        )

        failure_multiplier = (
            1.15 if self.filament_type in ["ABS", "TPU"] else 1.05
        )
        self.total_cost = round(
            (filament_cost + electricity_cost) * failure_multiplier, 2
        )

        self.recommended_retail_price = round(
            float(self.total_cost)
            * (1 + (float(self.markup_percentage) / 100)),
            2,
        )
        self.profit_per_item = round(
            float(self.recommended_retail_price) - float(self.total_cost), 2
        )

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.item_name} (£{self.recommended_retail_price})"
