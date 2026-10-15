"""
Views for the 3D Print Calculator application.

Includes the public calculation estimator, personal saved print catalogue,
and CRUD functionality to edit previously saved print records.
"""

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect, render
from .forms import SavedPrintForm
from .models import SavedPrint


def calculator_view(request):
    """
    Handles public 3D print calculations and user catalogue saving.

    If authenticated, saving commits directly to the user's catalogue.
    If anonymous, calculation runs in memory and displays estimate cards.
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
                filament_cost = (
                    float(print_item.spool_price_per_kg) / 1000
                ) * print_item.filament_grams_used

                watts = (
                    print_item.printer.average_watts_abs
                    if print_item.filament_type in ["ABS", "TPU"]
                    else print_item.printer.average_watts_pla
                )
                electricity_cost = (
                    (float(watts) / 1000)
                    * float(print_item.print_time_hours)
                    * float(print_item.electricity_rate_kwh)
                )

                failure_multiplier = 1.15 if print_item.filament_type in [
                    "ABS",
                    "TPU",
                ] else 1.05
                total_cost = round(
                    (filament_cost + electricity_cost) * failure_multiplier, 2
                )
                retail_price = round(
                    float(total_cost)
                    * (1 + (float(print_item.markup_percentage) / 100)),
                    2,
                )
                profit = round(float(retail_price) - float(total_cost), 2)

                calculated_result = {
                    "item_name": print_item.item_name,
                    "total_cost": total_cost,
                    "retail_price": retail_price,
                    "profit": profit,
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
    """Displays the user's saved 3D prints catalogue and summary stats."""
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
    """
    Fetches an existing saved print and allows updating.

    Saves automatically recalculate total cost, retail price, and profit
    via the model's custom save method.
    """
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
