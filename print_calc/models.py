"""
Database models for the 3D Print Profit Calculator.

Contains machine specifications and saved commercial 3D print calculations
including batch plate quantities, multi-color AMS spool runs, purge waste,
hardware add-ons, and minimum order floor pricing.
"""

import json
import re
from decimal import Decimal, ROUND_HALF_UP
from django.contrib.auth.models import User
from django.core.validators import MaxValueValidator, MinValueValidator
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
        help_text="Total model filament used on build plate in grams",
    )
    print_time_hours = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
        help_text="Total print time for the build plate in hours",
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

    # Batch Printing & Labor Fields
    plate_quantity = models.PositiveIntegerField(
        default=1,
        validators=[MinValueValidator(1), MaxValueValidator(500)],
        help_text="Quantity of identical items printed on this build plate",
    )
    flat_setup_cost = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
        help_text="Flat batch setup/slicing/bed-prep labor divided across run",
    )
    per_unit_post_cost = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
        help_text="Per-unit post-processing/support removal/packaging cost",
    )

    # Multi-Color / AMS & Purge Waste Fields
    is_multicolor_run = models.BooleanField(
        default=False,
        help_text="Enable multi-spool AMS/MMU tracking (up to 16 spools)",
    )
    purge_grams = models.DecimalField(
        max_digits=6,
        decimal_places=1,
        default=Decimal("0.0"),
        validators=[MinValueValidator(Decimal("0.0"))],
        help_text="Flushed / purge & prime tower waste in grams",
    )
    spools_json = models.TextField(
        blank=True,
        default="[]",
        help_text="JSON array of multi-color spools and waste rate assignment",
    )

    # Hardware & Consumables Add-ons
    hardware_json = models.TextField(
        blank=True,
        default="[]",
        help_text="JSON array of hardware & consumable line items",
    )

    # Minimum Order Floor Charge
    apply_min_floor = models.BooleanField(
        default=False,
        help_text=(
            "Enforce minimum order floor charge so tiny prints stay profitable"
        ),
    )
    min_floor_charge = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=Decimal("4.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
        help_text="Minimum selling price floor threshold (default £4.00)",
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

    def _calculate_material_and_purge(self):
        """Returns (model_cost, purge_cost, model_g, purge_g, waste_pct)."""
        purge_g = Decimal(self.purge_grams or Decimal("0.0"))
        model_g = Decimal(self.filament_grams_used or 0)
        base_rate_kg = Decimal(self.spool_price_per_kg or Decimal("20.00"))

        spools = []
        if self.is_multicolor_run and self.spools_json:
            try:
                parsed = json.loads(self.spools_json)
                if isinstance(parsed, list):
                    spools = parsed[:16]
            except (ValueError, TypeError):
                spools = []

        if spools:
            calc_model_g = Decimal("0.0")
            calc_model_cost = Decimal("0.00")
            rates = []
            waste_rate_override = None

            for idx, sp in enumerate(spools):
                try:
                    g = max(Decimal("0.0"), Decimal(str(sp.get("grams", 0))))
                    r = max(
                        Decimal("0.01"),
                        Decimal(str(sp.get("cost_per_kg", base_rate_kg))),
                    )
                except Exception:
                    continue
                calc_model_g += g
                calc_model_cost += (r / Decimal("1000")) * g
                rates.append(r)
                if sp.get("is_waste_spool"):
                    waste_rate_override = r

            if calc_model_g > Decimal("0.0"):
                model_g = calc_model_g
                model_cost = calc_model_cost
            else:
                model_cost = (base_rate_kg / Decimal("1000")) * model_g

            if waste_rate_override is not None:
                purge_rate_kg = waste_rate_override
            elif rates:
                purge_rate_kg = sum(rates) / Decimal(len(rates))
            else:
                purge_rate_kg = base_rate_kg
        else:
            model_cost = (base_rate_kg / Decimal("1000")) * model_g
            purge_rate_kg = base_rate_kg

        purge_cost = (purge_rate_kg / Decimal("1000")) * purge_g
        total_plastic_g = model_g + purge_g
        if total_plastic_g > Decimal("0.0") and purge_g > Decimal("0.0"):
            waste_pct = (
                (purge_g / total_plastic_g) * Decimal("100")
            ).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
        else:
            waste_pct = Decimal("0.0")

        return model_cost, purge_cost, model_g, purge_g, waste_pct

    def _calculate_hardware_cost(self):
        """Sums (quantity * unit_price) across hardware_json line items."""
        if not self.hardware_json:
            return Decimal("0.00")
        try:
            items = json.loads(self.hardware_json)
            if not isinstance(items, list):
                return Decimal("0.00")
        except (ValueError, TypeError):
            return Decimal("0.00")

        total_hw = Decimal("0.00")
        for item in items:
            try:
                qty = max(Decimal("0"), Decimal(str(item.get("qty", 0))))
                price = max(
                    Decimal("0.00"), Decimal(str(item.get("unit_price", 0)))
                )
                total_hw += qty * price
            except Exception:
                continue
        return total_hw

    def calculate_pricing(self):
        """Calculates batch and per-unit costs and retail prices."""
        two_places = Decimal("0.01")
        qty = max(1, int(self.plate_quantity or 1))
        qty_dec = Decimal(qty)

        (
            model_filament_cost,
            purge_cost,
            model_g,
            purge_g,
            waste_pct,
        ) = self._calculate_material_and_purge()
        filament_cost = model_filament_cost + purge_cost

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

        print_production_cost = (
            filament_cost + electricity_cost + depreciation_cost
        ) * failure_multiplier

        setup_cost = Decimal(self.flat_setup_cost or Decimal("0.00"))
        post_unit_cost = Decimal(self.per_unit_post_cost or Decimal("0.00"))
        post_batch_cost = post_unit_cost * qty_dec
        hardware_batch_cost = self._calculate_hardware_cost()

        plate_total_cost = (
            print_production_cost
            + setup_cost
            + post_batch_cost
            + hardware_batch_cost
        ).quantize(two_places, rounding=ROUND_HALF_UP)

        markup_multiplier = Decimal("1") + (
            Decimal(self.markup_percentage) / Decimal("100")
        )

        plate_retail_raw = (plate_total_cost * markup_multiplier).quantize(
            two_places, rounding=ROUND_HALF_UP
        )

        floor_val = Decimal(self.min_floor_charge or Decimal("4.00")).quantize(
            two_places, rounding=ROUND_HALF_UP
        )
        floor_applied = False
        if self.apply_min_floor and plate_retail_raw < floor_val:
            plate_retail = floor_val
            floor_applied = True
        else:
            plate_retail = plate_retail_raw

        plate_profit = (plate_retail - plate_total_cost).quantize(
            two_places, rounding=ROUND_HALF_UP
        )

        unit_cost = (plate_total_cost / qty_dec).quantize(
            two_places, rounding=ROUND_HALF_UP
        )
        unit_retail = (plate_retail / qty_dec).quantize(
            two_places, rounding=ROUND_HALF_UP
        )
        unit_profit = (unit_retail - unit_cost).quantize(
            two_places, rounding=ROUND_HALF_UP
        )

        self.total_cost = plate_total_cost
        self.recommended_retail_price = plate_retail
        self.profit_per_item = plate_profit

        if plate_retail > Decimal("0.00"):
            gross_margin_pct = (
                (plate_profit / plate_retail) * Decimal("100")
            ).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
        else:
            gross_margin_pct = Decimal("0.0")

        return {
            "filament_cost": filament_cost.quantize(
                two_places, rounding=ROUND_HALF_UP
            ),
            "model_filament_cost": model_filament_cost.quantize(
                two_places, rounding=ROUND_HALF_UP
            ),
            "purge_cost": purge_cost.quantize(
                two_places, rounding=ROUND_HALF_UP
            ),
            "waste_pct": waste_pct,
            "electricity_cost": electricity_cost.quantize(
                two_places, rounding=ROUND_HALF_UP
            ),
            "depreciation_cost": depreciation_cost.quantize(
                two_places, rounding=ROUND_HALF_UP
            ),
            "setup_cost": setup_cost.quantize(
                two_places, rounding=ROUND_HALF_UP
            ),
            "post_batch_cost": post_batch_cost.quantize(
                two_places, rounding=ROUND_HALF_UP
            ),
            "hardware_cost": hardware_batch_cost.quantize(
                two_places, rounding=ROUND_HALF_UP
            ),
            "failure_buffer_pct": 15 if is_high_temp else 5,
            "plate_quantity": qty,
            "total_cost": self.total_cost,
            "retail_price": self.recommended_retail_price,
            "profit": self.profit_per_item,
            "unit_cost": unit_cost,
            "unit_retail": unit_retail,
            "unit_profit": unit_profit,
            "floor_applied": floor_applied,
            "min_floor_charge": floor_val,
            "markup_percentage": self.markup_percentage,
            "gross_margin_pct": gross_margin_pct,
        }

    def get_spools_breakdown(self):
        """Returns parsed multi-color spools with color dots and costs."""
        if not self.is_multicolor_run or not self.spools_json:
            return []
        try:
            parsed = json.loads(self.spools_json)
            if not isinstance(parsed, list):
                return []
        except (ValueError, TypeError):
            return []

        color_map = {
            "red": "#dc2626",
            "blue": "#2563eb",
            "green": "#16a34a",
            "black": "#111827",
            "white": "#f8fafc",
            "yellow": "#eab308",
            "orange": "#ea580c",
            "purple": "#9333ea",
            "pink": "#db2777",
            "gold": "#ca8a04",
            "silver": "#9ca3af",
            "grey": "#6b7280",
            "gray": "#6b7280",
            "cyan": "#0891b2",
            "brown": "#78350f",
        }
        fallback_palette = [
            "#084298",
            "#0f5132",
            "#dc2626",
            "#d97706",
            "#7c3aed",
            "#0891b2",
            "#be185d",
            "#374151",
        ]
        two_places = Decimal("0.01")
        base_rate_kg = Decimal(self.spool_price_per_kg or Decimal("20.00"))
        result = []

        for idx, sp in enumerate(parsed[:16]):
            if not isinstance(sp, dict):
                continue
            label = str(sp.get("label") or f"Spool {idx + 1}")
            try:
                grams = max(
                    Decimal("0.0"), Decimal(str(sp.get("grams", 0)))
                ).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
                rate = max(
                    Decimal("0.01"),
                    Decimal(str(sp.get("cost_per_kg", base_rate_kg))),
                ).quantize(two_places, rounding=ROUND_HALF_UP)
            except Exception:
                continue

            spool_cost = ((rate / Decimal("1000")) * grams).quantize(
                two_places, rounding=ROUND_HALF_UP
            )
            hex_match = re.search(r"(#[0-9A-Fa-f]{6})\b", label)
            if hex_match:
                hex_color = hex_match.group(1)
            else:
                lower_lbl = label.lower()
                matched_hex = None
                for cname, chex in color_map.items():
                    if cname in lower_lbl:
                        matched_hex = chex
                        break
                hex_color = (
                    matched_hex
                    or fallback_palette[idx % len(fallback_palette)]
                )

            result.append(
                {
                    "label": label,
                    "grams": grams,
                    "cost_per_kg": rate,
                    "spool_cost": spool_cost,
                    "hex_color": hex_color,
                }
            )
        return result

    def get_catalogue_summary(self):
        """Returns complete cost breakdown, spools, and quote text."""
        two_places = Decimal("0.01")
        pricing = self.calculate_pricing()
        is_high_temp = self.filament_type in ["ABS", "TPU"]
        buffer_mult = Decimal("1.15") if is_high_temp else Decimal("1.05")

        raw_material = pricing["filament_cost"]
        raw_machine = (
            pricing["electricity_cost"] + pricing["depreciation_cost"]
        )
        material_buffered = (raw_material * buffer_mult).quantize(
            two_places, rounding=ROUND_HALF_UP
        )
        machine_buffered = (raw_machine * buffer_mult).quantize(
            two_places, rounding=ROUND_HALF_UP
        )
        labor_cost = (
            pricing["setup_cost"] + pricing["post_batch_cost"]
        ).quantize(two_places, rounding=ROUND_HALF_UP)
        hardware_cost = pricing["hardware_cost"]
        extras_cost = (labor_cost + hardware_cost).quantize(
            two_places, rounding=ROUND_HALF_UP
        )

        spools = self.get_spools_breakdown()
        printer_name = (
            str(self.printer) if self.printer else "Standard 3D Printer"
        )
        date_str = (
            self.created_on.strftime("%d %b %Y")
            if self.created_on
            else "Today"
        )
        qty = pricing["plate_quantity"]

        lines = [
            f"3D PRINT QUOTE: {self.item_name}",
            f"Date: {date_str}",
            f"Printer: {printer_name} ({self.filament_type})",
            f"Print Time: {self.print_time_hours} hrs | Batch Qty: {qty}",
            (
                f"Material Weight: {self.filament_grams_used}g model"
                + (
                    f" + {self.purge_grams}g purge/waste"
                    if self.purge_grams and self.purge_grams > 0
                    else ""
                )
            ),
        ]
        if spools:
            spool_parts = [
                f"{s['label']} ({s['grams']}g @ £{s['cost_per_kg']}/kg)"
                for s in spools
            ]
            lines.append("Spools: " + ", ".join(spool_parts))

        lines.extend(
            [
                "---",
                f"Material Cost: £{material_buffered}",
                f"Machine Cost: £{machine_buffered}",
                f"Hands-on Labor & Hardware: £{extras_cost}",
                f"Total Production Cost: £{pricing['total_cost']}",
                f"Suggested Selling Price: £{pricing['retail_price']}",
            ]
        )
        if qty > 1:
            lines.append(
                f"Price Per Individual Unit (1 of {qty}): "
                f"£{pricing['unit_retail']} (Cost: £{pricing['unit_cost']})"
            )

        return {
            **pricing,
            "material_cost_buffered": material_buffered,
            "machine_cost_buffered": machine_buffered,
            "hands_on_labor_cost": labor_cost,
            "extras_cost": extras_cost,
            "spools": spools,
            "printer_display": printer_name,
            "quote_text": "\n".join(lines),
        }

    def save(self, *args, **kwargs):
        """Calculates pricing metrics before saving the record."""
        self.calculate_pricing()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.item_name} (£{self.recommended_retail_price})"
