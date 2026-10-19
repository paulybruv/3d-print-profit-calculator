/**
 * Interactive 3D Print Pricing, Printer Hardware, Regional Tariff & Markup Controller
 *
 * - Auto-populates editable "Machine Wattage" and "Hourly Wear/Depreciation"
 *   fields immediately upon selecting any of the 23 individual printers.
 * - Handles regional Electricity Cost per kWh presets (UK £0.263, US $0.185,
 *   EU €0.28, Custom) and dynamically syncs the currency symbol (£, $, €)
 *   across input prefixes and cost summaries.
 * - Handles industry-standard markup preset pills (40%, 100%, 200%, Custom).
 * - Calculates live Filament Cost, Electricity Overhead, Machine Wear,
 *   Total Cost, Target Selling Price, Profit, and Gross Margin.
 */

document.addEventListener("DOMContentLoaded", function () {
    const markupInput = document.getElementById("id_markup_percentage");
    const presetButtons = document.querySelectorAll("[data-markup-preset]");
    const helperBox =
        document.getElementById("id_markup_percentage_helptext") ||
        document.getElementById("markup-margin-helper");

    const rateInput = document.getElementById("id_electricity_rate_kwh");
    const ratePresetButtons = document.querySelectorAll("[data-rate-preset]");
    const currencyElements = document.querySelectorAll(".currency-symbol");

    const printerSelect = document.getElementById("id_printer");
    const wattsInput = document.getElementById("id_machine_watts");
    const depreciationInput = document.getElementById("id_hourly_depreciation");
    const printerNoteBox =
        document.getElementById("id_printer_helptext") ||
        document.getElementById("printer-spec-note");

    const filamentSelect = document.getElementById("id_filament_type");
    const spoolPriceInput = document.getElementById("id_spool_price_per_kg");
    const gramsInput = document.getElementById("id_filament_grams_used");
    const hoursInput = document.getElementById("id_print_time_hours");
    const itemNameInput = document.getElementById("id_item_name");

    if (!markupInput) {
        return;
    }

    // Load printer hardware lookup from JSON script tag
    let printerSpecsMap = {};
    const wattsScript = document.getElementById("printer-watts-data");
    if (wattsScript) {
        try {
            printerSpecsMap = JSON.parse(wattsScript.textContent);
        } catch (err) {
            printerSpecsMap = {};
        }
    }

    const MARKUP_PRESETS = ["40", "100", "200"];
    const RATE_PRESETS = {
        "0.263": "£",
        "0.185": "$",
        "0.28": "€",
        "0.280": "€",
    };
    let activeCurrency = "£";

    /**
     * Rounds a number to 2 decimal places using half-up rounding
     * to match Python's Decimal ROUND_HALF_UP behavior.
     */
    function roundCurrency(value) {
        return Math.round((value + Number.EPSILON) * 100) / 100;
    }

    /**
     * Updates all currency symbol badges/prefixes across the page.
     */
    function setCurrencySymbol(symbol) {
        if (!symbol) {
            return;
        }
        activeCurrency = symbol;
        currencyElements.forEach(function (el) {
            el.textContent = activeCurrency;
        });
    }

    /**
     * Populates Machine Wattage and Hourly Depreciation when a printer is chosen.
     */
    function applyPrinterPreset(forceOverwrite) {
        if (!printerSelect) {
            return;
        }
        const printerId = printerSelect.value;
        const spec = printerId ? printerSpecsMap[printerId] : null;

        if (!spec) {
            if (printerNoteBox) {
                printerNoteBox.textContent =
                    "Select a printer above to auto-fill power draw and hourly wear, or enter custom values below.";
            }
            return;
        }

        if (wattsInput && (forceOverwrite || !wattsInput.value)) {
            wattsInput.value = spec.default_watts;
        }

        if (depreciationInput && (forceOverwrite || !depreciationInput.value)) {
            depreciationInput.value = parseFloat(spec.depreciation).toFixed(2);
        }

        if (printerNoteBox) {
            const rateStr =
                activeCurrency + parseFloat(spec.depreciation).toFixed(2);
            printerNoteBox.textContent = spec.note
                ? "Preset Spec: " +
                  spec.default_watts +
                  "W default · " +
                  rateStr +
                  "/hr wear (" +
                  spec.note +
                  ")"
                : "Preset Spec: " +
                  spec.default_watts +
                  "W default · " +
                  rateStr +
                  "/hr wear";
        }
    }

    /**
     * Updates the active visual state of the markup preset selector pills.
     */
    function syncPresetHighlight(forceCustom) {
        const currentVal = String(markupInput.value).trim();
        const isPresetMatch =
            !forceCustom && MARKUP_PRESETS.includes(currentVal);

        presetButtons.forEach(function (btn) {
            const preset = btn.getAttribute("data-markup-preset");
            const isActive = isPresetMatch
                ? preset === currentVal
                : preset === "custom";

            btn.classList.toggle("btn-primary", isActive);
            btn.classList.toggle("btn-outline-secondary", !isActive);
            btn.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
    }

    /**
     * Updates the active visual state of the electricity rate preset pills.
     */
    function syncRatePresetHighlight(forceCustom) {
        if (!rateInput || ratePresetButtons.length === 0) {
            return;
        }
        const rawVal = String(rateInput.value).trim();
        const numVal = parseFloat(rawVal);

        let matchedPreset = null;
        if (!forceCustom && !isNaN(numVal)) {
            if (Math.abs(numVal - 0.263) < 0.0001) {
                matchedPreset = "0.263";
            } else if (Math.abs(numVal - 0.185) < 0.0001) {
                matchedPreset = "0.185";
            } else if (Math.abs(numVal - 0.28) < 0.0001) {
                matchedPreset = "0.28";
            }
        }

        if (matchedPreset && RATE_PRESETS[matchedPreset]) {
            setCurrencySymbol(RATE_PRESETS[matchedPreset]);
        }

        ratePresetButtons.forEach(function (btn) {
            const preset = btn.getAttribute("data-rate-preset");
            const isActive = matchedPreset
                ? preset === matchedPreset
                : preset === "custom";

            btn.classList.toggle("btn-primary", isActive);
            btn.classList.toggle("btn-outline-secondary", !isActive);
            btn.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
    }

    /**
     * Calculates current cost, retail price, profit, and gross margin
     * and updates both the contextual helper label and live result card.
     */
    function recalculatePricing() {
        const markupRaw = parseFloat(markupInput.value);
        const markupPct = !isNaN(markupRaw) && markupRaw >= 0 ? markupRaw : 0;

        const spoolPrice = parseFloat(
            spoolPriceInput ? spoolPriceInput.value : ""
        );
        const grams = parseFloat(gramsInput ? gramsInput.value : "");
        const hours = parseFloat(hoursInput ? hoursInput.value : "");
        const rate = parseFloat(rateInput ? rateInput.value : "0.263");
        const filamentType = filamentSelect ? filamentSelect.value : "PLA";
        const printerId = printerSelect ? printerSelect.value : "";

        const isHighTemp = filamentType === "ABS" || filamentType === "TPU";
        const failureBufferPct = isHighTemp ? 15 : 5;
        const failureMultiplier = isHighTemp ? 1.15 : 1.05;

        let watts = isHighTemp ? 150 : 100;
        const customWatts = parseFloat(wattsInput ? wattsInput.value : "");
        if (!isNaN(customWatts) && customWatts > 0) {
            watts = customWatts;
        } else if (printerId && printerSpecsMap[printerId]) {
            watts = isHighTemp
                ? printerSpecsMap[printerId].abs
                : printerSpecsMap[printerId].pla;
        }

        let depreciationRate = 0;
        const customDepr = parseFloat(
            depreciationInput ? depreciationInput.value : ""
        );
        if (!isNaN(customDepr) && customDepr >= 0) {
            depreciationRate = customDepr;
        } else if (printerId && printerSpecsMap[printerId]) {
            depreciationRate =
                parseFloat(printerSpecsMap[printerId].depreciation) || 0;
        }

        const hasFullInputs =
            !isNaN(spoolPrice) &&
            spoolPrice > 0 &&
            !isNaN(grams) &&
            grams > 0 &&
            !isNaN(hours) &&
            hours > 0 &&
            !isNaN(rate) &&
            rate > 0;

        if (hasFullInputs) {
            const filamentCost = (spoolPrice / 1000) * grams;
            const electricityCost = (watts / 1000) * hours * rate;
            const depreciationCost = hours * depreciationRate;
            const baseCost = roundCurrency(
                (filamentCost + electricityCost + depreciationCost) *
                    failureMultiplier
            );

            const retailPrice = roundCurrency(baseCost * (1 + markupPct / 100));
            const profit = roundCurrency(retailPrice - baseCost);
            const grossMargin =
                retailPrice > 0
                    ? ((retailPrice - baseCost) / retailPrice) * 100
                    : 0;

            if (helperBox) {
                helperBox.innerHTML =
                    "<strong>" +
                    markupPct +
                    "% Markup</strong> = <strong>" +
                    grossMargin.toFixed(1) +
                    "% Gross Margin</strong> (Profit: <strong>" +
                    activeCurrency +
                    profit.toFixed(2) +
                    "</strong>)";
            }

            updateLiveCard({
                itemName:
                    itemNameInput && itemNameInput.value.trim()
                        ? itemNameInput.value.trim()
                        : "Current Print",
                filamentCost: roundCurrency(filamentCost),
                electricityCost: roundCurrency(electricityCost),
                depreciationCost: roundCurrency(depreciationCost),
                failureBufferPct: failureBufferPct,
                baseCost: baseCost,
                retailPrice: retailPrice,
                profit: profit,
                markupPct: markupPct,
                grossMargin: grossMargin,
            });
        } else {
            const theoreticalMargin =
                markupPct > 0 ? (markupPct / (100 + markupPct)) * 100 : 0;

            if (helperBox) {
                helperBox.innerHTML =
                    "<strong>" +
                    markupPct +
                    "% Markup</strong> = <strong>" +
                    theoreticalMargin.toFixed(1) +
                    "% Gross Margin</strong> <span class=\"text-secondary\">(Enter weight &amp; time above to preview " +
                    activeCurrency +
                    " profit)</span>";
            }
        }
    }

    /**
     * Updates the right-hand calculation breakdown card in real time if present.
     */
    function updateLiveCard(metrics) {
        const emptyState = document.getElementById("calc-empty-state");
        const liveCard = document.getElementById("calc-result-card");
        if (!liveCard) {
            return;
        }

        if (emptyState) {
            emptyState.classList.add("d-none");
        }
        liveCard.classList.remove("d-none");

        const setText = function (id, text) {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = text;
            }
        };

        setText("live-item-name", metrics.itemName);
        setText(
            "live-filament-cost",
            activeCurrency + metrics.filamentCost.toFixed(2)
        );
        setText(
            "live-electricity-cost",
            activeCurrency + metrics.electricityCost.toFixed(2)
        );
        setText(
            "live-depreciation-cost",
            activeCurrency + metrics.depreciationCost.toFixed(2)
        );
        setText("live-buffer-pct", "+" + metrics.failureBufferPct + "%");
        setText(
            "live-total-cost",
            activeCurrency + metrics.baseCost.toFixed(2)
        );
        setText(
            "live-retail-price",
            activeCurrency + metrics.retailPrice.toFixed(2)
        );
        setText("live-profit", activeCurrency + metrics.profit.toFixed(2));
        setText(
            "live-margin-summary",
            metrics.markupPct +
                "% Markup / " +
                metrics.grossMargin.toFixed(1) +
                "% Gross Margin"
        );
    }

    // When switching printers, immediately populate Machine Wattage and Hourly Wear
    if (printerSelect) {
        printerSelect.addEventListener("change", function () {
            applyPrinterPreset(true);
            recalculatePricing();
        });
    }

    // Bind regional electricity tariff preset button clicks
    ratePresetButtons.forEach(function (btn) {
        btn.addEventListener("click", function () {
            const preset = btn.getAttribute("data-rate-preset");
            const currency = btn.getAttribute("data-currency");
            if (preset === "custom") {
                syncRatePresetHighlight(true);
                if (rateInput) {
                    rateInput.focus();
                    rateInput.select();
                }
            } else if (rateInput) {
                rateInput.value = preset;
                if (currency) {
                    setCurrencySymbol(currency);
                }
                syncRatePresetHighlight(false);
                applyPrinterPreset(false);
                recalculatePricing();
            }
        });
    });

    // When user manually edits electricity rate input, switch active preset to Custom
    if (rateInput) {
        rateInput.addEventListener("input", function () {
            syncRatePresetHighlight(false);
            recalculatePricing();
        });
    }

    // Bind markup preset button clicks
    presetButtons.forEach(function (btn) {
        btn.addEventListener("click", function () {
            const preset = btn.getAttribute("data-markup-preset");
            if (preset === "custom") {
                syncPresetHighlight(true);
                markupInput.focus();
                markupInput.select();
            } else {
                markupInput.value = preset;
                syncPresetHighlight(false);
                recalculatePricing();
            }
        });
    });

    // When user manually types in markup percentage, switch pill to matching or Custom
    markupInput.addEventListener("input", function () {
        syncPresetHighlight(false);
        recalculatePricing();
    });

    // Recalculate whenever any form input changes (including editable wattage/wear)
    const watchedInputs = [
        wattsInput,
        depreciationInput,
        filamentSelect,
        spoolPriceInput,
        gramsInput,
        hoursInput,
        itemNameInput,
    ];
    watchedInputs.forEach(function (inputEl) {
        if (inputEl) {
            inputEl.addEventListener("input", recalculatePricing);
            inputEl.addEventListener("change", recalculatePricing);
        }
    });

    // Initialize state on page load
    syncRatePresetHighlight(false);
    applyPrinterPreset(false);
    syncPresetHighlight(false);
    recalculatePricing();
});
