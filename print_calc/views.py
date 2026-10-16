"""
Views for the 3D Print Calculator application.

Handles calculations, saved catalogue items, editing prints,
and user registration using standard Django auth forms.
"""

from django.contrib import messages
from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import UserCreationForm
from django.shortcuts import get_object_or_404, redirect, render
from .forms import SavedPrintForm
from .models import SavedPrint


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
                print_item.calculate_pricing()
                calculated_result = {
                    "item_name": print_item.item_name,
                    "total_cost": print_item.total_cost,
                    "retail_price": print_item.recommended_retail_price,
                    "profit": print_item.profit_per_item,
                }
                messages.info(
                    request,
                    "Calculation complete! Log in or sign up to save items.",
                )
    else:
        form = SavedPrintForm()

    context = {
        "form": form,
        "calculated_result": calculated_result,
    }
    return render(request, "print_calc/calculator.html", context)


@login_required
def catalogue_view(request):
    """Displays the authenticated user's saved print items."""
    saved_prints = SavedPrint.objects.filter(user=request.user).order_by(
        "-created_on"
    )

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
