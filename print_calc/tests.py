"""
Automated unit tests for the print_calc application.

Covers models, calculation logic, authentication flows, view access,
and complete CRUD operations for saved prints.
"""

from decimal import Decimal
from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse
from .forms import SavedPrintForm
from .models import PrinterMachine, SavedPrint


class PrinterMachineModelTests(TestCase):
    """Unit tests for the PrinterMachine database model."""

    def setUp(self):
        """Set up reusable test printer instances."""
        self.printer = PrinterMachine.objects.create(
            brand="Bambu Lab",
            name="P1S",
            average_watts_pla=110,
            average_watts_abs=160,
        )

    def test_printer_string_representation(self):
        """Verify the __str__ method returns the full printer name."""
        self.assertEqual(str(self.printer), "Bambu Lab P1S")


class SavedPrintModelTests(TestCase):
    """Unit tests for SavedPrint model calculation logic."""

    def setUp(self):
        """Set up test user, printer, and initial print calculation."""
        self.user = User.objects.create_user(
            username="maker_test",
            password="SecurePassword123!",
        )
        self.printer = PrinterMachine.objects.create(
            brand="Atomstack",
            name="X7",
            average_watts_pla=100,
            average_watts_abs=150,
        )

    def test_pla_failure_multiplier_calculation(self):
        """
        Verify that PLA filament uses the 5% failure risk buffer (1.05x).
        """
        saved_print = SavedPrint(
            user=self.user,
            printer=self.printer,
            item_name="PLA Flexi Dragon",
            filament_type="PLA",
            spool_price_per_kg=Decimal("20.00"),
            filament_grams_used=100,
            print_time_hours=Decimal("2.00"),
            electricity_rate_kwh=Decimal("0.30"),
            markup_percentage=50,
        )
        saved_print.save()

        # Filament: (20.00 / 1000) * 100 = 2.00
        # Power: (100 / 1000) * 2.00 * 0.30 = 0.06
        # Subtotal: 2.06 -> Buffer (1.05x): 2.163 -> Rounded: 2.16
        self.assertEqual(saved_print.total_cost, Decimal("2.16"))

        # Retail (50% markup): 2.16 * 1.5 = 3.24
        self.assertEqual(
            saved_print.recommended_retail_price, Decimal("3.24")
        )
        self.assertEqual(saved_print.profit_per_item, Decimal("1.08"))

    def test_abs_failure_multiplier_calculation(self):
        """
        Verify that ABS filament uses high-temp watts and 15% buffer (1.15x).
        """
        saved_print = SavedPrint(
            user=self.user,
            printer=self.printer,
            item_name="ABS Enclosure Bracket",
            filament_type="ABS",
            spool_price_per_kg=Decimal("20.00"),
            filament_grams_used=100,
            print_time_hours=Decimal("2.00"),
            electricity_rate_kwh=Decimal("0.30"),
            markup_percentage=100,
        )
        saved_print.save()

        # Filament: (20.00 / 1000) * 100 = 2.00
        # Power (150W ABS): (150 / 1000) * 2.00 * 0.30 = 0.09
        # Subtotal: 2.09 -> Buffer (1.15x): 2.4035 -> Rounded: 2.40
        self.assertEqual(saved_print.total_cost, Decimal("2.40"))
        self.assertEqual(
            saved_print.recommended_retail_price, Decimal("4.80")
        )
        self.assertEqual(saved_print.profit_per_item, Decimal("2.40"))

    def test_negative_form_values_rejected(self):
        """Ensure SavedPrintForm rejects negative numeric inputs."""
        form = SavedPrintForm(
            data={
                "printer": self.printer.id,
                "item_name": "Invalid Print",
                "filament_type": "PLA",
                "spool_price_per_kg": "-15.00",
                "filament_grams_used": 50,
                "print_time_hours": "1.50",
                "electricity_rate_kwh": "0.25",
                "markup_percentage": 50,
            }
        )
        self.assertFalse(form.is_valid())
        self.assertIn("spool_price_per_kg", form.errors)


class ViewAccessTests(TestCase):
    """Test URL routing and access controls across public and private views."""

    def setUp(self):
        """Create a user and printer machine for testing access."""
        self.user = User.objects.create_user(
            username="shopper",
            password="SecurePassword123!",
        )
        self.printer = PrinterMachine.objects.create(
            brand="Generic",
            name="Test Printer",
            average_watts_pla=100,
            average_watts_abs=150,
        )

    def test_calculator_page_loads_for_anonymous_user(self):
        """Verify the public calculator returns status code 200."""
        response = self.client.get(reverse("calculator"))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "print_calc/calculator.html")

    def test_catalogue_redirects_unauthenticated_user(self):
        """Ensure logged-out users are redirected to login."""
        response = self.client.get(reverse("catalogue"))
        self.assertEqual(response.status_code, 302)
        self.assertIn(reverse("login"), response.url)

    def test_catalogue_loads_for_authenticated_user(self):
        """Ensure logged-in users can access their catalogue view."""
        self.client.login(username="shopper", password="SecurePassword123!")
        response = self.client.get(reverse("catalogue"))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "print_calc/catalogue.html")


class CrudOperationTests(TestCase):
    """Verifies complete Create, Read, Update, Delete cycles."""

    def setUp(self):
        """Set up user, printer, and initial item."""
        self.user = User.objects.create_user(
            username="crud_user",
            password="SecurePassword123!",
        )
        self.printer = PrinterMachine.objects.create(
            brand="Prusa",
            name="MK4S",
            average_watts_pla=90,
            average_watts_abs=140,
        )
        self.print_item = SavedPrint.objects.create(
            user=self.user,
            printer=self.printer,
            item_name="Desk Organizer",
            filament_type="PLA",
            spool_price_per_kg=Decimal("18.00"),
            filament_grams_used=50,
            print_time_hours=Decimal("1.50"),
            electricity_rate_kwh=Decimal("0.28"),
            markup_percentage=40,
        )

    def test_edit_print_updates_record(self):
        """Test updating an existing print via POST request."""
        self.client.login(username="crud_user", password="SecurePassword123!")
        edit_url = reverse("edit_print", args=[self.print_item.id])

        post_data = {
            "printer": self.printer.id,
            "item_name": "Updated Desk Organizer",
            "filament_type": "PLA",
            "spool_price_per_kg": "22.00",
            "filament_grams_used": 60,
            "print_time_hours": "2.00",
            "electricity_rate_kwh": "0.28",
            "markup_percentage": 50,
        }
        response = self.client.post(edit_url, post_data)
        self.assertRedirects(response, reverse("catalogue"))

        self.print_item.refresh_from_db()
        self.assertEqual(self.print_item.item_name, "Updated Desk Organizer")

    def test_delete_print_removes_record_via_post(self):
        """Ensure POST to delete view removes the print item."""
        self.client.login(username="crud_user", password="SecurePassword123!")
        delete_url = reverse("delete_print", args=[self.print_item.id])

        response = self.client.post(delete_url)
        self.assertRedirects(response, reverse("catalogue"))
        self.assertFalse(
            SavedPrint.objects.filter(id=self.print_item.id).exists()
        )
