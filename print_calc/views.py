"""
Views for the 3D Print Calculator application.

Handles calculations, saved catalogue items, editing prints,
and user registration using standard Django auth forms.
"""

from django.contrib import messages
from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.signals import user_logged_in, user_logged_out
from django.dispatch import receiver
from django.shortcuts import get_object_or_404, redirect, render
from .forms import SavedPrintForm
from .models import PrinterMachine, SavedPrint


def get_printer_watts_map():
    """Returns a dictionary mapping printer IDs to specs for live JS."""
    return {
        str(printer.id): {
            "default_watts": printer.default_watts,
            "pla": printer.average_watts_pla,
            "abs": printer.average_watts_abs,
            "depreciation": str(printer.depreciation_per_hour),
            "note": printer.cost_basis_note,
        }
        for printer in PrinterMachine.objects.all()
    }


@receiver(user_logged_in)
def notify_user_login(sender, request, user, **kwargs):
    """Displays a confirmation message when a user signs in."""
    if request:
        messages.success(
            request,
            f"Welcome back, {user.username}! You are signed in.",
            fail_silently=True,
        )


@receiver(user_logged_out)
def notify_user_logout(sender, request, user, **kwargs):
    """Displays a confirmation message when a user signs out."""
    if request:
        messages.info(
            request,
            "You have been safely signed out.",
            fail_silently=True,
        )


def calculator_view(request):
    """
    Public calculator view.

    Saves directly to user account if logged in, or displays
    a live in-memory estimate if anonymous.
    """
    calculated_result = None

    if request.method == "POST":
        form = SavedPrintForm(request.POST)
        if form.is_valid():
            print_item = form.save(commit=False)

            if request.user.is_authenticated:
                print_item.user = request.user
                print_item.save()
                messages.success(
                    request,
                    f"Successfully calculated and saved "
                    f"'{print_item.item_name}' to your catalogue!",
                )
                return redirect("catalogue")
            else:
                breakdown = print_item.calculate_pricing()
                calculated_result = {
                    "item_name": print_item.item_name,
                    **breakdown,
                }
                messages.info(
                    request,
                    "Calculation complete! Log in or sign up to save items.",
                )
    else:
        load_id = request.GET.get("load")
        loaded_item = None
        if (
            load_id
            and request.user.is_authenticated
            and str(load_id).isdigit()
        ):
            loaded_item = SavedPrint.objects.filter(
                pk=int(load_id), user=request.user
            ).first()

        if loaded_item:
            form = SavedPrintForm(instance=loaded_item)
            breakdown = loaded_item.calculate_pricing()
            calculated_result = {
                "item_name": loaded_item.item_name,
                **breakdown,
            }
            messages.info(
                request,
                f"Loaded '{loaded_item.item_name}' into the calculator. "
                f"Tweak any values or save as a new quote!",
            )
        else:
            form = SavedPrintForm()

    context = {
        "form": form,
        "calculated_result": calculated_result,
        "printer_watts": get_printer_watts_map(),
    }
    return render(request, "print_calc/calculator.html", context)


@login_required
def catalogue_view(request):
    """Displays the authenticated user's saved print items."""
    saved_prints = (
        SavedPrint.objects.filter(user=request.user)
        .select_related("printer")
        .order_by("-created_on")
    )

    selected_filament = request.GET.get("filament", "")
    valid_filaments = [choice[0] for choice in SavedPrint.FILAMENT_CHOICES]
    if selected_filament in valid_filaments:
        saved_prints = saved_prints.filter(filament_type=selected_filament)
    else:
        selected_filament = ""

    search_query = request.GET.get("q", "").strip()
    if search_query:
        saved_prints = saved_prints.filter(item_name__icontains=search_query)

    total_items = saved_prints.count()
    avg_profit = 0
    if total_items > 0:
        total_profit_sum = sum(
            [float(item.profit_per_item) for item in saved_prints]
        )
        avg_profit = round(total_profit_sum / total_items, 2)

    context = {
        "saved_prints": saved_prints,
        "total_items": total_items,
        "avg_profit": avg_profit,
        "selected_filament": selected_filament,
        "search_query": search_query,
        "filament_choices": SavedPrint.FILAMENT_CHOICES,
    }
    return render(request, "print_calc/catalogue.html", context)


@login_required
def edit_print_view(request, pk):
    """Fetches and updates an existing print calculation."""
    saved_print = get_object_or_404(SavedPrint, pk=pk, user=request.user)

    if request.method == "POST":
        form = SavedPrintForm(request.POST, instance=saved_print)
        if form.is_valid():
            form.save()
            messages.success(
                request,
                f"Successfully updated '{saved_print.item_name}'!",
            )
            return redirect("catalogue")
    else:
        form = SavedPrintForm(instance=saved_print)

    context = {
        "form": form,
        "saved_print": saved_print,
        "printer_watts": get_printer_watts_map(),
    }
    return render(request, "print_calc/edit_print.html", context)


def signup_view(request):
    """Handles standard user registration."""
    if request.user.is_authenticated:
        return redirect("calculator")

    if request.method == "POST":
        form = UserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            messages.success(
                request,
                f"Account created successfully. Welcome, {user.username}!",
            )
            return redirect("calculator")
    else:
        form = UserCreationForm()

    return render(request, "print_calc/signup.html", {"form": form})


@login_required
def delete_print_view(request, pk):
    """
    Deletes a specific saved print.

    Ensures the user owns the record and accepts POST requests only.
    """
    saved_print = get_object_or_404(SavedPrint, pk=pk, user=request.user)

    if request.method == "POST":
        item_name = saved_print.item_name
        saved_print.delete()
        messages.success(
            request,
            f"Successfully deleted '{item_name}' from your catalogue.",
        )
        return redirect("catalogue")

    # If accessed via GET, redirect back safely to the catalogue
    return redirect("catalogue")
