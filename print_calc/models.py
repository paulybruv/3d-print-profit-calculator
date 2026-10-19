"""
Database models for the 3D Print Profit Calculator.

Contains machine specifications and saved custom print calculations.
"""

from decimal import Decimal, ROUND_HALF_UP
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator
from django.db import models


class PrinterMachine(models.Model):
    """Stores 3D printer models, power draw, and hourly depreciation."""

    name = models.CharField(max_length=100, unique=True)
    brand = models.CharField(max_length=50, blank=True, default="")
    average_watts_pla = models.PositiveIntegerField(
        help_text="Average watts used printing PLA/standard filaments"
    )
    average_watts_abs = models.PositiveIntegerField(
        help_text="Average watts used printing ABS/high-temp filaments"
    )
    default_watts = models.PositiveIntegerField(
        default=100,
        help_text="Default wattage populated when selecting this printer",
    )
    depreciation_per_hour = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Hourly machine wear and depreciation in £/hr",
    )
    cost_basis_note = models.CharField(
        max_length=150,
        blank=True,
        default="",
        help_text="Purchase cost and lifespan basis for depreciation",
    )

    def __str__(self):
        if (
            self.brand
            and self.brand not in ["Resin", "Custom"]
            and not self.name.startswith(self.brand)
        ):
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
        help_text="Select a preset printer to auto-fill wattage & wear",
    )
    machine_watts = models.PositiveIntegerField(
        blank=True,
        null=True,
        validators=[MinValueValidator(1)],
        help_text="Average power draw in Watts (auto-filled, editable)",
    )
    hourly_depreciation = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        blank=True,
        null=True,
        validators=[MinValueValidator(Decimal("0.00"))],
        help_text="Hourly machine wear/depreciation in £/hr (editable)",
    )
    filament_type = models.CharField(
        max_length=20, choices=FILAMENT_CHOICES, default="PLA"
    )
    spool_price_per_kg = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
        help_text="Cost per 1kg spool in £",
    )
    filament_grams_used = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text="Total filament used in grams",
    )
    print_time_hours = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
        help_text="Total print time in hours",
    )
    electricity_rate_kwh = models.DecimalField(
        max_digits=6,
        decimal_places=3,
        default=Decimal("0.263"),
        validators=[MinValueValidator(Decimal("0.001"))],
        help_text=(
            "Cost per kWh (e.g. 0.263 for UK, 0.185 for US, 0.28 for EU)"
        ),
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

    def calculate_pricing(self):
        """Calculates costs and retail prices using Decimal precision."""
        two_places = Decimal("0.01")

        filament_cost = (
            self.spool_price_per_kg / Decimal("1000")
        ) * Decimal(self.filament_grams_used)

        is_high_temp = self.filament_type in ["ABS", "TPU"]
        if self.machine_watts:
            watts = self.machine_watts
        elif self.printer:
            watts = (
                self.printer.average_watts_abs
                if is_high_temp
                else self.printer.average_watts_pla
            )
        else:
            watts = 150 if is_high_temp else 100

        if self.hourly_depreciation is not None:
            depreciation_rate = self.hourly_depreciation
        elif self.printer:
            depreciation_rate = self.printer.depreciation_per_hour
        else:
            depreciation_rate = Decimal("0.00")

        electricity_cost = (
            (Decimal(watts) / Decimal("1000"))
            * self.print_time_hours
            * self.electricity_rate_kwh
        )

        depreciation_cost = self.print_time_hours * depreciation_rate

        failure_multiplier = (
            Decimal("1.15") if is_high_temp else Decimal("1.05")
        )

        calculated_cost = (
            (filament_cost + electricity_cost + depreciation_cost)
            * failure_multiplier
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

        if calculated_retail > Decimal("0.00"):
            gross_margin_pct = (
                (self.profit_per_item / calculated_retail) * Decimal("100")
            ).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
        else:
            gross_margin_pct = Decimal("0.0")

        return {
            "filament_cost": filament_cost.quantize(
                two_places, rounding=ROUND_HALF_UP
            ),
            "electricity_cost": electricity_cost.quantize(
                two_places, rounding=ROUND_HALF_UP
            ),
            "depreciation_cost": depreciation_cost.quantize(
                two_places, rounding=ROUND_HALF_UP
            ),
            "failure_buffer_pct": 15 if is_high_temp else 5,
            "total_cost": self.total_cost,
            "retail_price": self.recommended_retail_price,
            "profit": self.profit_per_item,
            "markup_percentage": self.markup_percentage,
            "gross_margin_pct": gross_margin_pct,
        }

    def save(self, *args, **kwargs):
        """Calculates pricing metrics before saving the record."""
        self.calculate_pricing()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.item_name} (£{self.recommended_retail_price})"
