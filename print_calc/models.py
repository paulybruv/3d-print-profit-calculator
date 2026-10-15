"""
Database models for the 3D Print Profit Calculator.

Contains machine specifications and saved custom print calculations.
"""

from decimal import Decimal, ROUND_HALF_UP
from django.contrib.auth.models import User
from django.db import models


class PrinterMachine(models.Model):
    """Stores 3D printer models and average power consumption in watts."""

    name = models.CharField(max_length=100, unique=True)
    brand = models.CharField(max_length=50, blank=True, default="")
    average_watts_pla = models.PositiveIntegerField(
        help_text="Average watts used printing PLA/PETG"
    )
    average_watts_abs = models.PositiveIntegerField(
        help_text="Average watts used printing ABS/high-temp filaments"
    )

    def __str__(self):
        if self.brand:
            return f"{self.brand} {self.name}"
        return self.name


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
        default=Decimal("0.25"),
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
        """Calculates costs and retail prices using Decimal precision."""
        two_places = Decimal("0.01")

        filament_cost = (
            self.spool_price_per_kg / Decimal("1000")
        ) * Decimal(self.filament_grams_used)

        watts = (
            self.printer.average_watts_abs
            if self.filament_type in ["ABS", "TPU"]
            else self.printer.average_watts_pla
        )
        electricity_cost = (
            (Decimal(watts) / Decimal("1000"))
            * self.print_time_hours
            * self.electricity_rate_kwh
        )

        failure_multiplier = (
            Decimal("1.15")
            if self.filament_type in ["ABS", "TPU"]
            else Decimal("1.05")
        )

        calculated_cost = (
            (filament_cost + electricity_cost) * failure_multiplier
        ).quantize(two_places, rounding=ROUND_HALF_UP)

        markup_multiplier = Decimal("1") + (
            Decimal(self.markup_percentage) / Decimal("100")
        )

        calculated_retail = (
            calculated_cost * markup_multiplier
        ).quantize(two_places, rounding=ROUND_HALF_UP)

        self.total_cost = calculated_cost
        self.recommended_retail_price = calculated_retail
        self.profit_per_item = calculated_retail - calculated_cost

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.item_name} (£{self.recommended_retail_price})"
