/**
 * Minimalist "Drop & Done" 3D Print Pricing Controller (static/js/calculator.js)
 *
 * 1. "Drop & Done" Auto-Fill (.gcode / .3mf):
 *    - Matches Printer Model from slicer headers (auto-setting wattage & wear)
 *    - Sets Print Time (hours) and Filament Weight (grams)
 *    - Multi-color detection: keeps single weight box for 1-color prints;
 *      automatically opens the multi-color spool list ONLY when >1 spool is used.
 * 2. Minimalist Core View + Single Collapsed "⚙️ Advanced Options (Optional)"
 * 3. Immediate Result Card: Large Suggested Selling Price +
 *    "Material Cost + Machine Cost + Your Profit" breakdown.
 */

document.addEventListener("DOMContentLoaded", function () {
    const markupInput = document.getElementById("id_markup_percentage");
    if (!markupInput) {
        return;
    }

    const presetButtons = document.querySelectorAll("[data-markup-preset]");
    const helperBox =
        document.getElementById("id_markup_percentage_helptext") ||
        document.getElementById("markup-margin-helper");

    const rateInput = document.getElementById("id_electricity_rate_kwh");
    const ratePresetButtons = document.querySelectorAll("[data-rate-preset]");

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

    // Batch & Plate Quantity elements
    const plateQtyInput = document.getElementById("id_plate_quantity");
    const batchNoteBox = document.getElementById("batch-distribution-note");
    const batchNoteCount = document.getElementById("batch-note-count");

    // Optional Hands-On Labor & Prep elements
    const includeLaborToggle = document.getElementById("include-labor-toggle");
    const laborDrawer = document.getElementById("labor-drawer");
    const laborModeTimeBtn = document.getElementById("labor-mode-time-btn");
    const laborModeFlatBtn = document.getElementById("labor-mode-flat-btn");
    const hourlyRateWrapper = document.getElementById("hourly-rate-wrapper");
    const laborHourlyRateInput = document.getElementById("labor-hourly-rate");
    const laborTimeInputs = document.getElementById("labor-time-inputs");
    const laborFlatInputs = document.getElementById("labor-flat-inputs");
    const prepMinutesInput = document.getElementById("prep-minutes-input");
    const cleanupMinutesInput = document.getElementById(
        "cleanup-minutes-input"
    );
    const prepCalcPreview = document.getElementById("prep-calc-preview");
    const cleanupCalcPreview = document.getElementById("cleanup-calc-preview");
    const flatSetupInput = document.getElementById("id_flat_setup_cost");
    const perUnitPostInput = document.getElementById("id_per_unit_post_cost");

    // Multi-Color / AMS & Purge inputs
    const multicolorToggle = document.getElementById("id_is_multicolor_run");
    const amsManagerBox = document.getElementById("ams-spool-manager");
    const addSpoolBtn = document.getElementById("add-spool-btn");
    const spoolRowsContainer = document.getElementById("spool-rows-container");
    const spoolCountBadge = document.getElementById("spool-count-badge");
    const purgeGramsInput = document.getElementById("id_purge_grams");
    const wasteSpoolSelect = document.getElementById("waste-spool-select");
    const wasteBadge = document.getElementById("material-waste-badge");
    const spoolsJsonInput = document.getElementById("id_spools_json");

    // Hardware & Consumables inputs
    const addHardwareBtn = document.getElementById("add-hardware-btn");
    const hardwareContainer = document.getElementById(
        "hardware-rows-container"
    );
    const hardwareJsonInput = document.getElementById("id_hardware_json");

    // Minimum Order Floor inputs
    const applyMinFloorToggle = document.getElementById("id_apply_min_floor");
    const minFloorChargeInput = document.getElementById("id_min_floor_charge");

    // Slicer Dropzone inputs
    const dropzone = document.getElementById("slicer-dropzone");
    const fileInput = document.getElementById("slicer-file-input");
    const parseToast = document.getElementById("slicer-parse-toast");
    const parseToastBody = document.getElementById("slicer-toast-body");

    let printerSpecsMap = {};
    const wattsScript = document.getElementById("printer-watts-data");
    if (wattsScript) {
        try {
            printerSpecsMap = JSON.parse(wattsScript.textContent);
        } catch (err) {
            printerSpecsMap = {};
        }
    }

    // Set sensible default Spool Cost (£20/kg) if blank so dropping a file immediately shows a price
    if (spoolPriceInput && !spoolPriceInput.value) {
        spoolPriceInput.value = "20.00";
    }

    const MARKUP_PRESETS = ["40", "100", "200"];
    const RATE_PRESETS = {
        "0.263": "£",
        "0.185": "$",
        "0.28": "€",
        "0.280": "€",
    };
    let activeCurrency = "£";
    let laborEntryMode = "time";
    let spoolsState = [];
    let hardwareState = [];

    function roundCurrency(value) {
        return Math.round((value + Number.EPSILON) * 100) / 100;
    }

    function setCurrencySymbol(symbol) {
        if (!symbol) {
            return;
        }
        activeCurrency = symbol;
        document.querySelectorAll(".currency-symbol").forEach(function (el) {
            el.textContent = activeCurrency;
        });
    }

    // ---------------------------------------------------------------------
    // 1. "DROP & DONE" SLICER AUTO-PARSER (.GCODE & .3MF)
    // ---------------------------------------------------------------------

    function parseDurationToHours(str) {
        if (!str) {
            return null;
        }
        let totalHours = 0;
        let matched = false;
        const days = str.match(/(\d+)\s*d/i);
        const hours = str.match(/(\d+)\s*h/i);
        const mins = str.match(/(\d+)\s*m/i);
        const secs = str.match(/(\d+)\s*s/i);

        if (days) {
            totalHours += parseInt(days[1], 10) * 24;
            matched = true;
        }
        if (hours) {
            totalHours += parseInt(hours[1], 10);
            matched = true;
        }
        if (mins) {
            totalHours += parseInt(mins[1], 10) / 60;
            matched = true;
        }
        if (secs) {
            totalHours += parseInt(secs[1], 10) / 3600;
            matched = true;
        }
        return matched && totalHours > 0
            ? Math.max(0.01, Math.round(totalHours * 100) / 100)
            : null;
    }

    /**
     * Matches a printer string from slicer comments against the 23 dropdown options.
     */
    function matchPrinterDropdownOption(rawPrinterHint) {
        if (!printerSelect || !rawPrinterHint) {
            return null;
        }
        const hint = rawPrinterHint.toLowerCase();
        const rules = [
            { pattern: /a1\s*mini/i, match: "a1 mini" },
            { pattern: /\ba1\b/i, match: "bambu lab a1" },
            { pattern: /\bp1p\b/i, match: "p1p" },
            { pattern: /\bp1s\b/i, match: "p1s" },
            { pattern: /\bx1e\b/i, match: "x1e" },
            { pattern: /x1c|x1-carbon|x1\s*carbon/i, match: "x1-carbon" },
            { pattern: /mini\+|prusa\s*mini/i, match: "mini+" },
            { pattern: /mk3s\+|mk3s/i, match: "mk3s+" },
            { pattern: /mk4s|mk4/i, match: "mk4" },
            { pattern: /xl.*5|5.*tool/i, match: "5-toolhead" },
            { pattern: /\bxl\b/i, match: "single toolhead" },
            { pattern: /v3\s*se|v3\s*ke/i, match: "v3 se" },
            { pattern: /ender.*3\s*v2/i, match: "ender 3 v2" },
            { pattern: /ender.*3/i, match: "ender 3 (original" },
            { pattern: /k1\s*max/i, match: "k1 max" },
            { pattern: /\bk1\b/i, match: "creality k1" },
            { pattern: /neptune\s*4\s*(plus|max)/i, match: "neptune 4 plus" },
            { pattern: /neptune\s*4\s*pro/i, match: "neptune 4 pro" },
            { pattern: /neptune\s*4/i, match: "elegoo neptune 4" },
            { pattern: /kobra\s*2/i, match: "kobra 2" },
            { pattern: /mars\s*4/i, match: "mars 4" },
            { pattern: /saturn\s*[34]/i, match: "saturn" },
        ];

        for (let i = 0; i < rules.length; i++) {
            if (rules[i].pattern.test(hint)) {
                const targetSub = rules[i].match.toLowerCase();
                for (let j = 0; j < printerSelect.options.length; j++) {
                    const opt = printerSelect.options[j];
                    if (opt.textContent.toLowerCase().includes(targetSub)) {
                        printerSelect.value = opt.value;
                        applyPrinterPreset(true);
                        return opt.textContent.trim();
                    }
                }
            }
        }
        return null;
    }

    function parseNumberArray(rawStr) {
        if (!rawStr) {
            return [];
        }
        return String(rawStr)
            .split(/[,;]/)
            .map(function (s) {
                return parseFloat(s.trim());
            })
            .filter(function (n) {
                return !isNaN(n) && n >= 0;
            });
    }

    function sumNumericList(rawStr) {
        const nums = parseNumberArray(rawStr).filter(function (n) {
            return n > 0;
        });
        return nums.reduce(function (a, b) {
            return a + b;
        }, 0);
    }

    /**
     * Scans all regex matches in text and returns the highest positive sum,
     * avoiding early zero/placeholder matches in multi-file .3mf bundles.
     */
    function findBestPositiveSum(text, globalRegex) {
        let bestSum = 0;
        let match;
        while ((match = globalRegex.exec(text)) !== null) {
            const s = sumNumericList(match[1]);
            if (s > bestSum) {
                bestSum = s;
            }
        }
        return bestSum;
    }

    /**
     * Scans all regex matches for comma/semicolon-separated filament lists.
     * Prefers lists with >1 positive spool entry, otherwise highest positive sum.
     */
    function findBestSpoolList(text, globalRegex) {
        let bestMulti = [];
        let bestSingle = [];
        let match;
        while ((match = globalRegex.exec(text)) !== null) {
            const pos = parseNumberArray(match[1]).filter(function (n) {
                return n > 0;
            });
            if (pos.length > 1 && pos.length >= bestMulti.length) {
                bestMulti = pos;
            } else if (pos.length === 1 && bestSingle.length === 0) {
                bestSingle = pos;
            }
        }
        return bestMulti.length > 0 ? bestMulti : bestSingle;
    }

    /**
     * Scans G-code body for Bambu/Orca "; FLUSH_START" ... "; FLUSH_END"
     * and Prime/Wipe Tower extrusion blocks when summary header comments omit flush weight.
     */
    function scanGcodeBodyWasteGrams(gcodeText, gramsPerMm) {
        if (!gcodeText || gcodeText.indexOf("G1") === -1) {
            return 0;
        }
        const lines = gcodeText.split(/\r?\n/);
        let inFlush = false;
        let inTower = false;
        let flushMm = 0;
        let towerMm = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) {
                continue;
            }
            if (line.charCodeAt(0) === 59) {
                // ';' comment line
                if (/^;\s*V?FLUSH_START/i.test(line)) {
                    inFlush = true;
                } else if (/^;\s*V?FLUSH_END/i.test(line)) {
                    inFlush = false;
                } else if (
                    /^;\s*(?:WIPE_TOWER_START|WIPE_TOWER_BRIM_START)/i.test(
                        line
                    ) ||
                    /^;\s*(?:FEATURE|TYPE)\s*:\s*(?:Prime\s+tower|Wipe\s+tower)/i.test(
                        line
                    )
                ) {
                    inTower = true;
                } else if (
                    /^;\s*(?:WIPE_TOWER_END|WIPE_TOWER_BRIM_END)/i.test(line) ||
                    (inTower &&
                        /^;\s*(?:FEATURE|TYPE|LAYER_CHANGE)\b/i.test(line) &&
                        !/Prime\s+tower|Wipe\s+tower/i.test(line))
                ) {
                    inTower = false;
                }
                continue;
            }

            if (
                (inFlush || inTower) &&
                (line.startsWith("G1 ") || line.startsWith("G0 "))
            ) {
                const eMatch = line.match(/\bE(-?[0-9.]+)/);
                if (eMatch) {
                    const eVal = parseFloat(eMatch[1]);
                    if (!isNaN(eVal) && eVal < 500) {
                        if (inFlush) {
                            flushMm += eVal;
                        } else if (inTower && eVal > 0) {
                            towerMm += eVal;
                        }
                    }
                }
            }
        }

        const totalWasteMm = Math.max(0, flushMm) + Math.max(0, towerMm);
        if (totalWasteMm <= 0) {
            return 0;
        }
        const rateGPerMm =
            gramsPerMm && gramsPerMm > 0 ? gramsPerMm : 0.0029825;
        return totalWasteMm * rateGPerMm;
    }

    /**
     * Checks the top 200 lines (and footer block) of Metadata/plate_1.gcode first.
     */
    function parsePlateGcodeHeader(gcodeText) {
        if (!gcodeText) {
            return { flushGrams: 0, towerGrams: 0, modelGrams: 0 };
        }
        const allLines = gcodeText.split(/\r?\n/);
        const headerLines = allLines.slice(0, 250).join("\n");
        const footerLines =
            allLines.length > 250 ? allLines.slice(-300).join("\n") : "";
        const commentBlock = headerLines + "\n" + footerLines;

        const flushGrams = findBestPositiveSum(
            commentBlock,
            /;\s*(?:flush_filament_weight|total\s+flush\s+weight|flushed_weight|flushed\s+filament|total\s+flushed\s+filament|purge_weight|total\s+purge\s+weight|purge_filament_weight|filament\s+used\s*\[g\]_flush)(?:\s*\[g\])?\s*[=:]\s*([^\r\n]+)/gi
        );
        const towerGrams = findBestPositiveSum(
            commentBlock,
            /;\s*(?:total\s+prime\s+tower\s+weight|wipe_tower_filament_used|total\s+wipe\s+tower\s+weight|filament\s+used\s*\[g\]_wipe_tower|wipe_tower_weight|prime_tower_weight)(?:\s*\[g\])?\s*[=:]\s*([^\r\n]+)/gi
        );
        const modelGrams = findBestPositiveSum(
            commentBlock,
            /;\s*(?:model_filament_weight|model\s+filament\s+weight|model_weight|model\s+weight|filament\s+used\s*\[g\]_model)(?:\s*\[g\])?\s*[=:]\s*([^\r\n]+)/gi
        );

        return {
            flushGrams: flushGrams,
            towerGrams: towerGrams,
            modelGrams: modelGrams,
        };
    }

    function parseGcodeText(text, structured3mf) {
        let hours = null;
        let totalGrams = null;
        let flushedGrams = 0;
        let spoolWeights = [];
        let spoolMeta = [];
        let printerHint = null;

        const plateGcode =
            structured3mf && structured3mf.plateGcode
                ? structured3mf.plateGcode
                : "";
        const sliceConfig =
            structured3mf && structured3mf.sliceConfig
                ? structured3mf.sliceConfig
                : "";
        const projectConfig =
            structured3mf && structured3mf.projectConfig
                ? structured3mf.projectConfig
                : "";

        // 1. Detect Printer Model from Orca/Bambu/Prusa/Cura comments or JSON/XML
        const printerMatch = text.match(
            /(?:;\s*(?:printer_model|printer_settings_id|machine_name|SETTING_3|MAXX)\s*[=:]\s*([^\r\n]+)|key=["']printer_model_id["']\s+value=["']([^"']+)["']|["']printer_model["']\s*:\s*["']([^"']+)["'])/i
        );
        if (printerMatch) {
            printerHint = (
                printerMatch[1] ||
                printerMatch[2] ||
                printerMatch[3] ||
                ""
            ).trim();
        } else {
            const headerWindow = text.slice(0, 6000) + "\n" + text.slice(-8000);
            const knownBrandMatch = headerWindow.match(
                /(Bambu\s*Lab\s*[A-Za-z0-9\- ]+|Prusa\s*[A-Za-z0-9\+\- ]+|Creality\s*[A-Za-z0-9\- ]+|Ender[\- ]3[A-Za-z0-9 ]*|Neptune\s*4[A-Za-z0-9 ]*|Kobra\s*2)/i
            );
            if (knownBrandMatch) {
                printerHint = knownBrandMatch[1].trim();
            }
        }

        // 2. Print Time (G-code comments, Cura ;TIME:, or .3mf prediction seconds)
        const timeMatch = text.match(
            /;\s*(?:estimated printing time \(normal mode\)|model printing time|total estimated time)\s*[=:]\s*([^\r\n;]+)/i
        );
        if (timeMatch) {
            hours = parseDurationToHours(timeMatch[1]);
        }
        if (!hours) {
            const curaTime = text.match(/;TIME:\s*(\d+)/i);
            if (curaTime) {
                const sec = parseInt(curaTime[1], 10);
                if (sec > 0) {
                    hours = Math.max(0.01, Math.round((sec / 3600) * 100) / 100);
                }
            }
        }
        if (!hours) {
            const predTime = text.match(
                /(?:key=["']prediction["']\s+value=["']([0-9.]+)["']|["']prediction["']\s*:\s*["']?([0-9.]+)["']?)/i
            );
            if (predTime) {
                const sec = parseFloat(predTime[1] || predTime[2]);
                if (!isNaN(sec) && sec > 0) {
                    hours = Math.max(0.01, Math.round((sec / 3600) * 100) / 100);
                }
            }
        }

        // 3. STEP 1: Check "Metadata/plate_1.gcode" header first (top 200 lines + footer)
        const headerStats = parsePlateGcodeHeader(plateGcode || text);
        let flushTagGrams = headerStats.flushGrams;
        let wipeTowerGrams = headerStats.towerGrams;

        // 4. STEP 2: Parse "Metadata/slice_info.config" or "Metadata/plate_1.json"
        //    Inspect <plate>, <header>, <metadata>, or JSON attributes for:
        //    "flush_weight", "purge_weight", "prime_tower_weight", "wipe_tower_weight"
        const configSearchTarget = sliceConfig || text;
        const xmlMetaFlushGrams = findBestPositiveSum(
            configSearchTarget,
            /key=["'](?:flush_weight|flushed_weight|purge_weight|flush_filament_weight|total_flush_weight|flush_g|flushed_g|purge_g)["']\s+value=["']([^"']+)["']/gi
        );
        const xmlAttrFlushGrams = findBestPositiveSum(
            configSearchTarget,
            /\b(?:flush_weight|purge_weight|flushed_weight|flush_g|flushed_g|purge_g)=["']([0-9.,;\s]+)["']/gi
        );
        const jsonFlushGrams = findBestPositiveSum(
            configSearchTarget,
            /["'](?:flush_weight|purge_weight|flushed_weight|flush_filament_weight|total_flush_weight)["']\s*:\s*["']?([0-9.,;\s]+)["']?/gi
        );
        flushTagGrams = Math.max(
            flushTagGrams,
            xmlMetaFlushGrams,
            xmlAttrFlushGrams,
            jsonFlushGrams
        );

        const xmlMetaTowerGrams = findBestPositiveSum(
            configSearchTarget,
            /key=["'](?:prime_tower_weight|wipe_tower_weight|wipe_tower_filament_used|total_prime_tower_weight|wipe_tower_g|prime_tower_g|tower_g)["']\s+value=["']([^"']+)["']/gi
        );
        const xmlAttrTowerGrams = findBestPositiveSum(
            configSearchTarget,
            /\b(?:prime_tower_weight|wipe_tower_weight|wipe_tower_g|prime_tower_g|tower_g)=["']([0-9.,;\s]+)["']/gi
        );
        const jsonTowerGrams = findBestPositiveSum(
            configSearchTarget,
            /["'](?:prime_tower_weight|wipe_tower_weight|wipe_tower_filament_used|total_prime_tower_weight)["']\s*:\s*["']?([0-9.,;\s]+)["']?/gi
        );
        wipeTowerGrams = Math.max(
            wipeTowerGrams,
            xmlMetaTowerGrams,
            xmlAttrTowerGrams,
            jsonTowerGrams
        );

        if (flushTagGrams > 0 || wipeTowerGrams > 0) {
            flushedGrams = flushTagGrams + wipeTowerGrams;
        }

        // 5. Detect Multi-Spool Usage & Model/Total Filament Weights
        const xmlFilamentRegex = /<filament\b([^>]*?)\/?>/gi;
        let filMatch;
        const xmlSpoolWeights = [];
        const xmlSpoolMeta = [];
        let xmlFlushSum = 0;
        let xmlModelSum = 0;
        let xmlUsedMetersSum = 0;

        while ((filMatch = xmlFilamentRegex.exec(configSearchTarget)) !== null) {
            const attrs = filMatch[1] || "";
            const usedGAttr = attrs.match(
                /\b(?:used_g|weight)=["']([0-9.]+)["']/i
            );
            const usedMAttr = attrs.match(/\bused_m=["']([0-9.]+)["']/i);
            const modelGAttr = attrs.match(/\bmodel_g=["']([0-9.]+)["']/i);
            const flushGAttr = attrs.match(
                /\b(?:flush_g|flushed_g|purge_g|flush_weight|purge_weight)=["']([0-9.]+)["']/i
            );
            const towerGAttr = attrs.match(
                /\b(?:wipe_tower_g|prime_tower_g|tower_g|wipe_tower_weight|prime_tower_weight)=["']([0-9.]+)["']/i
            );
            const typeAttr = attrs.match(/\btype=["']([^"']+)["']/i);
            const colorAttr = attrs.match(/\bcolor=["']([^"']+)["']/i);

            const usedVal = usedGAttr ? parseFloat(usedGAttr[1]) : 0;
            const usedMVal = usedMAttr ? parseFloat(usedMAttr[1]) : 0;
            const modelVal = modelGAttr ? parseFloat(modelGAttr[1]) : 0;
            const flushVal = flushGAttr ? parseFloat(flushGAttr[1]) : 0;
            const towerVal = towerGAttr ? parseFloat(towerGAttr[1]) : 0;

            if (flushVal > 0 || towerVal > 0) {
                xmlFlushSum += flushVal + towerVal;
            }
            if (modelVal > 0) {
                xmlModelSum += modelVal;
            }
            if (usedMVal > 0) {
                xmlUsedMetersSum += usedMVal;
            }

            const effectiveG = modelVal > 0 ? modelVal : usedVal;
            if (!isNaN(effectiveG) && effectiveG > 0) {
                xmlSpoolWeights.push(effectiveG);
                xmlSpoolMeta.push({
                    type: typeAttr ? typeAttr[1] : "PLA",
                    color: colorAttr ? colorAttr[1] : "",
                });
            }
        }

        if (flushedGrams <= 0 && xmlFlushSum > 0) {
            flushedGrams = xmlFlushSum;
        }

        const modelSpoolList = findBestSpoolList(
            text,
            /;\s*(?:model_filament_weight|model\s+filament\s+weight|model_weight|model\s+weight|filament\s+used\s*\[g\]_model)(?:\s*\[g\])?\s*[=:]\s*([^\r\n]+)/gi
        );
        const usedSpoolList = findBestSpoolList(
            text,
            /;\s*filament\s+used\s*\[g\]\s*[=:]\s*([^\r\n]+)/gi
        );
        const totalWeightSpoolList = findBestSpoolList(
            text,
            /;\s*(?:total\s+filament\s+used|total_filament_used|total\s+filament\s+weight|total_filament_weight)(?:\s*\[g\])?\s*[=:]\s*([^\r\n]+)/gi
        );

        let spoolsCameFromTotal = false;
        if (modelSpoolList.length > 1) {
            spoolWeights = modelSpoolList;
        } else if (usedSpoolList.length > 1) {
            spoolWeights = usedSpoolList;
        } else if (xmlSpoolWeights.length > 1) {
            spoolWeights = xmlSpoolWeights;
            spoolMeta = xmlSpoolMeta;
            if (xmlModelSum <= 0) {
                spoolsCameFromTotal = true;
            }
        } else if (totalWeightSpoolList.length > 1) {
            spoolWeights = totalWeightSpoolList;
            spoolsCameFromTotal = true;
        } else if (usedSpoolList.length === 1) {
            spoolWeights = usedSpoolList;
        } else if (xmlSpoolWeights.length === 1) {
            spoolWeights = xmlSpoolWeights;
            spoolMeta = xmlSpoolMeta;
        } else if (modelSpoolList.length === 1) {
            spoolWeights = modelSpoolList;
        } else if (totalWeightSpoolList.length === 1) {
            spoolWeights = totalWeightSpoolList;
            spoolsCameFromTotal = true;
        }

        const sumSpools = spoolWeights.reduce(function (a, b) {
            return a + b;
        }, 0);

        // Scalar Total Filament Used vs Model Filament Weight
        const gcodeTotalG = findBestPositiveSum(
            text,
            /;\s*(?:total\s+filament\s+used|total_filament_used|total\s+filament\s+weight|total_filament_weight)(?:\s*\[g\])?\s*[=:]\s*([^\r\n]+)/gi
        );
        const xmlTotalG = findBestPositiveSum(
            configSearchTarget,
            /key=["'](?:weight|total_weight|total_filament_used)["']\s+value=["']([^"']+)["']/gi
        );
        const jsonTotalG = findBestPositiveSum(
            configSearchTarget,
            /["'](?:total_filament_used|total_weight)["']\s*:\s*["']?([0-9.]+)["']?/gi
        );
        const rawTotalGrams = Math.max(gcodeTotalG, xmlTotalG, jsonTotalG);

        const gcodeModelG = Math.max(
            headerStats.modelGrams,
            findBestPositiveSum(
                text,
                /;\s*(?:model_filament_weight|model\s+filament\s+weight|model_weight|model\s+weight|filament\s+used\s*\[g\]_model)(?:\s*\[g\])?\s*[=:]\s*([^\r\n]+)/gi
            )
        );
        const xmlModelG = findBestPositiveSum(
            configSearchTarget,
            /key=["'](?:model_weight|model_filament_weight)["']\s+value=["']([^"']+)["']/gi
        );
        const jsonModelG = findBestPositiveSum(
            configSearchTarget,
            /["'](?:model_weight|model_filament_weight)["']\s*:\s*["']?([0-9.]+)["']?/gi
        );
        const explicitModelGrams = Math.max(
            gcodeModelG,
            xmlModelG,
            jsonModelG,
            xmlModelSum
        );

        // 6. Fallback 1: Purge / Waste = Total Filament Used - Model Weight
        if (flushedGrams <= 0) {
            if (
                rawTotalGrams > 0 &&
                explicitModelGrams > 0 &&
                rawTotalGrams > explicitModelGrams + 0.05
            ) {
                flushedGrams = rawTotalGrams - explicitModelGrams;
            } else if (
                rawTotalGrams > 0 &&
                sumSpools > 0 &&
                rawTotalGrams > sumSpools + 0.05
            ) {
                flushedGrams = rawTotalGrams - sumSpools;
            }
        }

        // 7. Fallback 2: Scan Metadata/plate_1.gcode body for "; FLUSH_START" & Prime Tower extrusions
        if (flushedGrams <= 0 && (plateGcode || text.indexOf("FLUSH_START") !== -1)) {
            const totalGForRatio =
                rawTotalGrams > 0 ? rawTotalGrams : sumSpools;
            const gcodeLenMm = findBestPositiveSum(
                plateGcode || text,
                /;\s*(?:total\s+filament\s+length\s*\[mm\]|filament\s+used\s*\[mm\])\s*[=:]\s*([^\r\n]+)/gi
            );
            const totalMm =
                gcodeLenMm > 0 ? gcodeLenMm : xmlUsedMetersSum * 1000;
            const gPerMm =
                totalGForRatio > 0 && totalMm > 0
                    ? totalGForRatio / totalMm
                    : 0.0029825;
            const bodyWaste = scanGcodeBodyWasteGrams(
                plateGcode || text,
                gPerMm
            );
            if (bodyWaste > 0) {
                flushedGrams = bodyWaste;
            }
        }

        // 8. Fallback 3: Multi-color Bambu/Orca .3mf project file where slice_info.config
        //    lists total used_g across >1 spools (Model + Flush + Prime Tower combined)
        //    without an embedded plate_1.gcode or separate flush_weight tag
        if (
            flushedGrams <= 0 &&
            spoolWeights.length > 1 &&
            sumSpools > 0 &&
            structured3mf
        ) {
            let flushMultiplier = 1.0;
            const multMatch = (projectConfig || text).match(
                /["']flush_multiplier["']\s*:\s*["']?([0-9.]+)["']?/i
            );
            if (multMatch) {
                const parsedMult = parseFloat(multMatch[1]);
                if (!isNaN(parsedMult) && parsedMult > 0) {
                    flushMultiplier = parsedMult;
                }
            }
            // In multi-color AMS prints, minor-color spools trigger color-swap flushing + prime tower layers.
            // Calculate non-dominant spool weight share to estimate AMS purge + prime tower waste accurately.
            const maxSpoolG = Math.max.apply(null, spoolWeights);
            const secondarySpoolsG = Math.max(0, sumSpools - maxSpoolG);
            const estimatedWasteRatio = Math.min(
                0.45,
                Math.max(
                    0.22,
                    (0.18 + 0.05 * (spoolWeights.length - 1)) * flushMultiplier
                )
            );
            const estWaste =
                secondarySpoolsG > 0
                    ? Math.round(sumSpools * estimatedWasteRatio * 10) / 10
                    : 0;
            if (estWaste > 0 && estWaste < sumSpools) {
                flushedGrams = estWaste;
                spoolsCameFromTotal = true;
            }
        }

        // 9. Calculate Pure Model Filament Weight (total filament minus waste, or model_filament_weight)
        if (explicitModelGrams > 0) {
            totalGrams = explicitModelGrams;
            if (
                spoolWeights.length > 0 &&
                sumSpools > explicitModelGrams + 0.5
            ) {
                const ratio = explicitModelGrams / sumSpools;
                spoolWeights = spoolWeights.map(function (w) {
                    return Math.max(0.1, Math.round(w * ratio * 10) / 10);
                });
            }
        } else if (sumSpools > 0) {
            const spoolsIncludeWaste =
                flushedGrams > 0 &&
                sumSpools > flushedGrams &&
                (spoolsCameFromTotal ||
                    (rawTotalGrams > 0 &&
                        Math.abs(sumSpools - rawTotalGrams) < 0.5));
            if (spoolsIncludeWaste) {
                totalGrams = sumSpools - flushedGrams;
                const ratio = totalGrams / sumSpools;
                spoolWeights = spoolWeights.map(function (w) {
                    return Math.max(0.1, Math.round(w * ratio * 10) / 10);
                });
            } else {
                totalGrams = sumSpools;
            }
        } else if (rawTotalGrams > 0) {
            totalGrams =
                flushedGrams > 0 && rawTotalGrams > flushedGrams
                    ? rawTotalGrams - flushedGrams
                    : rawTotalGrams;
        } else {
            const curaGrams = text.match(/;Filament weight\s*[=:]\s*([0-9.]+)/i);
            if (curaGrams) {
                totalGrams = parseFloat(curaGrams[1]);
            }
        }

        return {
            printerHint: printerHint,
            hours: hours,
            totalGrams: totalGrams,
            flushedGrams: flushedGrams > 0 ? flushedGrams : 0,
            spoolWeights: spoolWeights,
            spoolMeta: spoolMeta,
        };
    }

    function applyParsedSlicerData(filename, data) {
        const cleanTitle = filename
            .replace(/\.(gcode\.3mf|gcode|3mf|gco)$/i, "")
            .replace(/[_-]+/g, " ")
            .trim();
        if (itemNameInput && cleanTitle) {
            itemNameInput.value = cleanTitle;
        }

        // 1. Auto-select Printer Model if matched, or fallback to first preset if none selected
        let matchedPrinterName = null;
        if (data.printerHint) {
            matchedPrinterName = matchPrinterDropdownOption(data.printerHint);
        }
        if (!matchedPrinterName && printerSelect && !printerSelect.value) {
            if (printerSelect.options.length > 1) {
                printerSelect.selectedIndex = 1;
                applyPrinterPreset(true);
                matchedPrinterName =
                    printerSelect.options[1].textContent.trim();
            }
        }

        // 2. Auto-fill Print Time (Hours), Filament Weight (Grams), and Purge / Waste (Grams)
        const extractedHours =
            data.hours && data.hours > 0 ? data.hours : null;
        const extractedGrams =
            data.totalGrams && data.totalGrams > 0
                ? Math.max(1, Math.round(data.totalGrams))
                : null;
        const extractedPurge =
            data.flushedGrams && data.flushedGrams > 0
                ? Math.round(data.flushedGrams * 10) / 10
                : 0;

        if (extractedHours && hoursInput) {
            hoursInput.value = extractedHours;
        }
        if (extractedGrams && gramsInput) {
            gramsInput.value = extractedGrams;
        }
        if (purgeGramsInput) {
            purgeGramsInput.value =
                extractedPurge > 0 ? extractedPurge.toFixed(1) : "0";
        }

        // 3. Multi-Color Detection: open multi-color view if > 1 spool used
        const activeSpools = (data.spoolWeights || []).filter(function (w) {
            return w > 0;
        });
        const metaList = data.spoolMeta || [];

        if (activeSpools.length > 1) {
            if (multicolorToggle) {
                multicolorToggle.checked = true;
            }
            const defaultRate =
                parseFloat(spoolPriceInput ? spoolPriceInput.value : "20") ||
                20;
            spoolsState = activeSpools.slice(0, 16).map(function (w, idx) {
                const meta = metaList[idx] || {};
                const matType = meta.type || "PLA";
                const colorSuffix = meta.color ? " (" + meta.color + ")" : "";
                return {
                    label:
                        "Spool " +
                        (idx + 1) +
                        " - " +
                        matType +
                        colorSuffix,
                    grams: Math.max(0.1, Math.round(w * 10) / 10),
                    cost_per_kg: defaultRate,
                };
            });
            renderSpoolRows();
            toggleAmsDrawer();
        } else {
            // Single-color print: keep multi-color view closed (while preserving extractedPurge in Purge / Waste)
            if (multicolorToggle) {
                multicolorToggle.checked = false;
            }
            toggleAmsDrawer();
        }

        const thumbWrapper = document.getElementById("slicer-thumb-wrapper");
        const thumbImg = document.getElementById("slicer-thumb-img");
        const liveResultThumbWrapper = document.getElementById(
            "live-result-thumb-wrapper"
        );
        const liveResultThumbImg = document.getElementById(
            "live-result-thumb-img"
        );

        if (data && data.thumbnailDataUrl) {
            if (thumbImg && thumbWrapper) {
                thumbImg.src = data.thumbnailDataUrl;
                thumbWrapper.classList.remove("d-none");
            }
            if (liveResultThumbImg && liveResultThumbWrapper) {
                liveResultThumbImg.src = data.thumbnailDataUrl;
                liveResultThumbWrapper.classList.remove("d-none");
            }
        } else {
            if (thumbWrapper) {
                thumbWrapper.classList.add("d-none");
            }
            if (liveResultThumbWrapper) {
                liveResultThumbWrapper.classList.add("d-none");
            }
        }

        if (parseToast && parseToastBody) {
            const parts = [];
            if (matchedPrinterName) {
                parts.push(matchedPrinterName);
            }
            if (extractedHours) {
                parts.push(extractedHours + " hrs");
            }
            if (extractedGrams) {
                parts.push(extractedGrams + "g model");
            }
            if (extractedPurge > 0) {
                parts.push(extractedPurge + "g purge waste");
            }
            if (activeSpools.length > 1) {
                parts.push(activeSpools.length + " spools");
            }
            parseToastBody.textContent =
                parts.length > 0
                    ? parts.join(" · ") + " (" + filename + ")"
                    : "Loaded " + filename;
            parseToast.classList.remove("d-none");
        }

        recalculatePricing();
    }

    function extractGcodeThumbnailDataUrl(text) {
        if (!text) {
            return null;
        }
        const headText = text.slice(0, 350000);
        const regex =
            /;\s*thumbnail(_JPG)?\s+begin\s+([^\r\n]*)\r?\n([\s\S]*?);\s*thumbnail(?:\1)?\s+end/gi;
        let match;
        let bestB64 = "";
        let bestMime = "image/png";

        while ((match = regex.exec(headText)) !== null) {
            const isJpg = Boolean(match[1]);
            const rawBlock = match[3] || "";
            const cleaned = rawBlock
                .split(/\r?\n/)
                .map(function (line) {
                    return line.replace(/^\s*;\s?/, "").trim();
                })
                .join("");
            if (cleaned.length > bestB64.length && cleaned.length > 64) {
                bestB64 = cleaned;
                bestMime =
                    isJpg || cleaned.indexOf("/9j/") === 0
                        ? "image/jpeg"
                        : "image/png";
            }
        }

        if (bestB64) {
            return "data:" + bestMime + ";base64," + bestB64;
        }
        return null;
    }

    function score3mfThumbnailPath(relPath) {
        const p = relPath.toLowerCase();
        if (
            /nozzle|bed_shape|filament|logo|icon|top_\d+|pick_\d+|cali/i.test(
                p
            )
        ) {
            return -1;
        }
        if (/metadata\/plate_1\.png$/i.test(p)) {
            return 100;
        }
        if (/plate_1\.png$/i.test(p)) {
            return 95;
        }
        if (/plate_\d+\.png$/i.test(p) && !/small/i.test(p)) {
            return 90;
        }
        if (/thumbnail\.png$/i.test(p)) {
            return 85;
        }
        if (/plate_\d+_small\.png$/i.test(p)) {
            return 75;
        }
        if (/metadata\/.*\.(png|jpg|jpeg|webp)$/i.test(p)) {
            return 60;
        }
        return 20;
    }

    function handleSlicerFile(file) {
        if (!file) {
            return;
        }
        const name = file.name || "slicer-file";
        const lower = name.toLowerCase();

        if (lower.endsWith(".3mf") && window.JSZip) {
            window.JSZip.loadAsync(file)
                .then(function (zip) {
                    const fileEntries = [];
                    const imageCandidates = [];

                    zip.forEach(function (relPath, entry) {
                        if (entry.dir) {
                            return;
                        }
                        if (
                            /\.(gcode|gco|xml|config|json|info)$/i.test(
                                relPath
                            )
                        ) {
                            fileEntries.push({
                                path: relPath,
                                promise: entry.async("string"),
                            });
                        } else if (
                            /\.(png|jpg|jpeg|webp)$/i.test(relPath)
                        ) {
                            const score = score3mfThumbnailPath(relPath);
                            if (score > 0) {
                                imageCandidates.push({
                                    path: relPath,
                                    score: score,
                                    entry: entry,
                                });
                            }
                        }
                    });

                    imageCandidates.sort(function (a, b) {
                        return b.score - a.score;
                    });
                    const bestImg =
                        imageCandidates.length > 0
                            ? imageCandidates[0]
                            : null;
                    const thumbPromise = bestImg
                        ? bestImg.entry
                              .async("base64")
                              .then(function (b64) {
                                  if (!b64 || b64.length < 32) {
                                      return null;
                                  }
                                  const ext = bestImg.path
                                      .split(".")
                                      .pop()
                                      .toLowerCase();
                                  const mime =
                                      ext === "jpg" || ext === "jpeg"
                                          ? "image/jpeg"
                                          : ext === "webp"
                                            ? "image/webp"
                                            : "image/png";
                                  return "data:" + mime + ";base64," + b64;
                              })
                              .catch(function () {
                                  return null;
                              })
                        : Promise.resolve(null);

                    return Promise.all([
                        Promise.all(
                            fileEntries.map(function (item) {
                                return item.promise.then(function (content) {
                                    return {
                                        path: item.path,
                                        content: content,
                                    };
                                });
                            })
                        ),
                        thumbPromise,
                    ]);
                })
                .then(function (results) {
                    const resolvedFiles = results[0];
                    const zipThumbDataUrl = results[1];
                    const plateGcodeArr = [];
                    const sliceConfigArr = [];
                    const projectConfigArr = [];
                    const otherArr = [];

                    resolvedFiles.forEach(function (f) {
                        const p = f.path.toLowerCase();
                        if (/plate_\d+\.gcode|\.gcode$/i.test(p)) {
                            plateGcodeArr.push(f.content);
                        } else if (
                            /slice_info\.config|plate_\d+\.json/i.test(p)
                        ) {
                            sliceConfigArr.push(f.content);
                        } else if (/project_settings\.config/i.test(p)) {
                            projectConfigArr.push(f.content);
                        } else {
                            otherArr.push(f.content);
                        }
                    });

                    const structured3mf = {
                        plateGcode: plateGcodeArr.join("\n"),
                        sliceConfig: sliceConfigArr.join("\n"),
                        projectConfig: projectConfigArr.join("\n"),
                    };
                    const combined = []
                        .concat(
                            plateGcodeArr,
                            sliceConfigArr,
                            otherArr,
                            projectConfigArr
                        )
                        .join("\n");

                    const parsed = parseGcodeText(combined, structured3mf);
                    parsed.thumbnailDataUrl =
                        zipThumbDataUrl ||
                        extractGcodeThumbnailDataUrl(combined);
                    applyParsedSlicerData(name, parsed);
                })
                .catch(function () {
                    if (parseToast && parseToastBody) {
                        parseToastBody.textContent =
                            "Loaded " +
                            name +
                            " — enter print hours and grams below.";
                        parseToast.classList.remove("d-none");
                    }
                });
        } else {
            const reader = new FileReader();
            reader.onload = function (e) {
                const text = String(e.target.result || "");
                const parsed = parseGcodeText(text, null);
                parsed.thumbnailDataUrl = extractGcodeThumbnailDataUrl(text);
                applyParsedSlicerData(name, parsed);
            };
            reader.readAsText(file);
        }
    }

    if (fileInput) {
        fileInput.addEventListener("change", function () {
            if (fileInput.files && fileInput.files[0]) {
                handleSlicerFile(fileInput.files[0]);
            }
        });
    }

    if (dropzone) {
        ["dragenter", "dragover"].forEach(function (evtName) {
            dropzone.addEventListener(evtName, function (e) {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add("slicer-dropzone-active");
            });
        });
        ["dragleave", "drop"].forEach(function (evtName) {
            dropzone.addEventListener(evtName, function (e) {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove("slicer-dropzone-active");
            });
        });
        dropzone.addEventListener("drop", function (e) {
            if (
                e.dataTransfer &&
                e.dataTransfer.files &&
                e.dataTransfer.files[0]
            ) {
                handleSlicerFile(e.dataTransfer.files[0]);
            }
        });
    }

    // ---------------------------------------------------------------------
    // 2. OPTIONAL HANDS-ON LABOR & PREP (INSIDE ADVANCED ACCORDION)
    // ---------------------------------------------------------------------

    function syncLaborFromMinutes() {
        if (!includeLaborToggle) {
            return;
        }
        if (!includeLaborToggle.checked) {
            if (flatSetupInput) {
                flatSetupInput.value = "0.00";
            }
            if (perUnitPostInput) {
                perUnitPostInput.value = "0.00";
            }
            return;
        }

        if (laborEntryMode === "time") {
            const hrRate = Math.max(
                0,
                parseFloat(
                    laborHourlyRateInput ? laborHourlyRateInput.value : "15"
                ) || 15
            );
            const prepMins = Math.max(
                0,
                parseFloat(
                    prepMinutesInput ? prepMinutesInput.value : "0"
                ) || 0
            );
            const cleanupMins = Math.max(
                0,
                parseFloat(
                    cleanupMinutesInput ? cleanupMinutesInput.value : "0"
                ) || 0
            );

            const prepCost = roundCurrency((prepMins / 60) * hrRate);
            const cleanupCost = roundCurrency((cleanupMins / 60) * hrRate);

            if (flatSetupInput) {
                flatSetupInput.value = prepCost.toFixed(2);
            }
            if (perUnitPostInput) {
                perUnitPostInput.value = cleanupCost.toFixed(2);
            }
            if (prepCalcPreview) {
                prepCalcPreview.textContent =
                    "= " + activeCurrency + prepCost.toFixed(2);
            }
            if (cleanupCalcPreview) {
                cleanupCalcPreview.textContent =
                    "= " + activeCurrency + cleanupCost.toFixed(2);
            }
        }
    }

    function setLaborEntryMode(mode) {
        laborEntryMode = mode;
        const isTime = mode === "time";
        if (laborModeTimeBtn && laborModeFlatBtn) {
            laborModeTimeBtn.classList.toggle("btn-primary", isTime);
            laborModeTimeBtn.classList.toggle(
                "btn-outline-secondary",
                !isTime
            );
            laborModeTimeBtn.setAttribute(
                "aria-pressed",
                isTime ? "true" : "false"
            );

            laborModeFlatBtn.classList.toggle("btn-primary", !isTime);
            laborModeFlatBtn.classList.toggle("btn-outline-secondary", isTime);
            laborModeFlatBtn.setAttribute(
                "aria-pressed",
                !isTime ? "true" : "false"
            );
        }
        if (hourlyRateWrapper) {
            hourlyRateWrapper.classList.toggle("d-none", !isTime);
        }
        if (laborTimeInputs) {
            laborTimeInputs.classList.toggle("d-none", !isTime);
        }
        if (laborFlatInputs) {
            laborFlatInputs.classList.toggle("d-none", isTime);
        }
        syncLaborFromMinutes();
        recalculatePricing();
    }

    function initLaborDrawerState() {
        const existingSetup =
            parseFloat(flatSetupInput ? flatSetupInput.value : "0") || 0;
        const existingPost =
            parseFloat(perUnitPostInput ? perUnitPostInput.value : "0") || 0;

        if (existingSetup > 0 || existingPost > 0) {
            if (includeLaborToggle) {
                includeLaborToggle.checked = true;
            }
            if (laborDrawer) {
                laborDrawer.classList.remove("d-none");
            }
            setLaborEntryMode("flat");
        }
    }

    if (includeLaborToggle) {
        includeLaborToggle.addEventListener("change", function () {
            if (laborDrawer) {
                laborDrawer.classList.toggle(
                    "d-none",
                    !includeLaborToggle.checked
                );
            }
            syncLaborFromMinutes();
            recalculatePricing();
        });
    }

    if (laborModeTimeBtn) {
        laborModeTimeBtn.addEventListener("click", function () {
            setLaborEntryMode("time");
        });
    }
    if (laborModeFlatBtn) {
        laborModeFlatBtn.addEventListener("click", function () {
            setLaborEntryMode("flat");
        });
    }

    [laborHourlyRateInput, prepMinutesInput, cleanupMinutesInput].forEach(
        function (el) {
            if (el) {
                el.addEventListener("input", function () {
                    syncLaborFromMinutes();
                    recalculatePricing();
                });
            }
        }
    );

    // ---------------------------------------------------------------------
    // 3. MULTI-COLOR / AMS SPOOL MANAGER (1 TO 16 SPOOLS)
    // ---------------------------------------------------------------------

    function initSpoolsFromHiddenJson() {
        if (spoolsJsonInput && spoolsJsonInput.value) {
            try {
                const parsed = JSON.parse(spoolsJsonInput.value);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    spoolsState = parsed.slice(0, 16);
                }
            } catch (err) {
                spoolsState = [];
            }
        }
        if (spoolsState.length === 0) {
            spoolsState = [
                {
                    label: "Spool 1 - Primary PLA",
                    grams: parseFloat(gramsInput ? gramsInput.value : "50") || 50,
                    cost_per_kg:
                        parseFloat(
                            spoolPriceInput ? spoolPriceInput.value : "20"
                        ) || 20,
                },
            ];
        }
    }

    function syncSpoolsJsonField() {
        const selectedWasteIdx = wasteSpoolSelect ? wasteSpoolSelect.value : "avg";
        const payload = spoolsState.map(function (sp, idx) {
            return {
                label: sp.label || "Spool " + (idx + 1),
                grams: parseFloat(sp.grams) || 0,
                cost_per_kg: parseFloat(sp.cost_per_kg) || 20,
                is_waste_spool: String(idx) === String(selectedWasteIdx),
            };
        });
        if (spoolsJsonInput) {
            spoolsJsonInput.value = JSON.stringify(payload);
        }

        if (multicolorToggle && multicolorToggle.checked && gramsInput) {
            const totalG = payload.reduce(function (acc, item) {
                return acc + (item.grams > 0 ? item.grams : 0);
            }, 0);
            if (totalG > 0) {
                gramsInput.value = Math.max(1, Math.round(totalG));
            }
        }
    }

    function renderWasteSpoolOptions() {
        if (!wasteSpoolSelect) {
            return;
        }
        const prevVal = wasteSpoolSelect.value || "avg";
        wasteSpoolSelect.innerHTML =
            '<option value="avg">Average of Active Spools</option>';
        spoolsState.forEach(function (sp, idx) {
            const opt = document.createElement("option");
            opt.value = String(idx);
            opt.textContent =
                (sp.label || "Spool " + (idx + 1)) +
                " (" +
                activeCurrency +
                (parseFloat(sp.cost_per_kg) || 20).toFixed(2) +
                "/kg)";
            wasteSpoolSelect.appendChild(opt);
        });
        wasteSpoolSelect.value = prevVal;
        if (!wasteSpoolSelect.value) {
            wasteSpoolSelect.value = "avg";
        }
    }

    function renderSpoolRows() {
        if (!spoolRowsContainer) {
            return;
        }
        spoolRowsContainer.innerHTML = "";
        if (spoolCountBadge) {
            spoolCountBadge.textContent = String(spoolsState.length);
        }
        if (addSpoolBtn) {
            addSpoolBtn.disabled = spoolsState.length >= 16;
        }

        spoolsState.forEach(function (sp, idx) {
            const row = document.createElement("div");
            row.className =
                "row g-2 align-items-center p-2 rounded border bg-white";
            row.innerHTML =
                '<div class="col-12 col-sm-5">' +
                '<input type="text" class="form-control form-control-sm spool-label-input" ' +
                'aria-label="Spool ' +
                (idx + 1) +
                ' Color or Material Label" ' +
                'placeholder="Spool ' +
                (idx + 1) +
                ' - Color/Material" value="' +
                String(sp.label || "").replace(/"/g, "&quot;") +
                '">' +
                "</div>" +
                '<div class="col-5 col-sm-3">' +
                '<div class="input-group input-group-sm">' +
                '<input type="number" class="form-control spool-grams-input" ' +
                'aria-label="Spool ' +
                (idx + 1) +
                ' Grams Used" min="0" step="0.1" value="' +
                (parseFloat(sp.grams) || 0) +
                '">' +
                '<span class="input-group-text">g</span>' +
                "</div>" +
                "</div>" +
                '<div class="col-5 col-sm-3">' +
                '<div class="input-group input-group-sm">' +
                '<span class="input-group-text currency-symbol">' +
                activeCurrency +
                "</span>" +
                '<input type="number" class="form-control spool-rate-input" ' +
                'aria-label="Spool ' +
                (idx + 1) +
                ' Cost per kg" min="0.01" step="0.01" value="' +
                (parseFloat(sp.cost_per_kg) || 20).toFixed(2) +
                '">' +
                '<span class="input-group-text">/kg</span>' +
                "</div>" +
                "</div>" +
                '<div class="col-2 col-sm-1 text-end">' +
                '<button type="button" class="btn btn-sm btn-outline-danger remove-spool-btn" ' +
                'aria-label="Remove Spool ' +
                (idx + 1) +
                '" ' +
                (spoolsState.length <= 1 ? "disabled" : "") +
                ">&times;</button>" +
                "</div>";

            const labelEl = row.querySelector(".spool-label-input");
            const gramsEl = row.querySelector(".spool-grams-input");
            const rateEl = row.querySelector(".spool-rate-input");
            const removeEl = row.querySelector(".remove-spool-btn");

            labelEl.addEventListener("input", function () {
                spoolsState[idx].label = labelEl.value;
                renderWasteSpoolOptions();
                syncSpoolsJsonField();
            });
            gramsEl.addEventListener("input", function () {
                spoolsState[idx].grams = parseFloat(gramsEl.value) || 0;
                syncSpoolsJsonField();
                recalculatePricing();
            });
            rateEl.addEventListener("input", function () {
                spoolsState[idx].cost_per_kg = parseFloat(rateEl.value) || 0;
                renderWasteSpoolOptions();
                syncSpoolsJsonField();
                recalculatePricing();
            });
            removeEl.addEventListener("click", function () {
                if (spoolsState.length > 1) {
                    spoolsState.splice(idx, 1);
                    renderSpoolRows();
                    renderWasteSpoolOptions();
                    syncSpoolsJsonField();
                    recalculatePricing();
                }
            });

            spoolRowsContainer.appendChild(row);
        });

        renderWasteSpoolOptions();
        syncSpoolsJsonField();
    }

    function toggleAmsDrawer() {
        if (!amsManagerBox || !multicolorToggle) {
            return;
        }
        const isMulti = multicolorToggle.checked;
        amsManagerBox.classList.toggle("d-none", !isMulti);
        if (isMulti) {
            renderSpoolRows();
        }
        recalculatePricing();
    }

    if (multicolorToggle) {
        multicolorToggle.addEventListener("change", toggleAmsDrawer);
    }

    if (addSpoolBtn) {
        addSpoolBtn.addEventListener("click", function () {
            if (spoolsState.length < 16) {
                const defaultRate =
                    parseFloat(
                        spoolPriceInput ? spoolPriceInput.value : "20"
                    ) || 20;
                spoolsState.push({
                    label: "Spool " + (spoolsState.length + 1) + " - PLA",
                    grams: 25,
                    cost_per_kg: defaultRate,
                });
                renderSpoolRows();
                recalculatePricing();
            }
        });
    }

    if (wasteSpoolSelect) {
        wasteSpoolSelect.addEventListener("change", function () {
            syncSpoolsJsonField();
            recalculatePricing();
        });
    }

    // ---------------------------------------------------------------------
    // 4. HARDWARE & CONSUMABLES ADD-ONS BUILDER
    // ---------------------------------------------------------------------

    function initHardwareFromHiddenJson() {
        if (hardwareJsonInput && hardwareJsonInput.value) {
            try {
                const parsed = JSON.parse(hardwareJsonInput.value);
                if (Array.isArray(parsed)) {
                    hardwareState = parsed;
                }
            } catch (err) {
                hardwareState = [];
            }
        }
    }

    function syncHardwareJsonField() {
        if (hardwareJsonInput) {
            hardwareJsonInput.value = JSON.stringify(hardwareState);
        }
    }

    function renderHardwareRows() {
        if (!hardwareContainer) {
            return;
        }
        hardwareContainer.innerHTML = "";
        hardwareState.forEach(function (hw, idx) {
            const row = document.createElement("div");
            row.className =
                "row g-2 align-items-center p-2 rounded border bg-light";
            row.innerHTML =
                '<div class="col-12 col-sm-5">' +
                '<input type="text" class="form-control form-control-sm hw-name-input" ' +
                'aria-label="Hardware Item ' +
                (idx + 1) +
                ' Name" placeholder="e.g., M3 Brass Inserts / Magnets" value="' +
                String(hw.name || "").replace(/"/g, "&quot;") +
                '">' +
                "</div>" +
                '<div class="col-5 col-sm-3">' +
                '<div class="input-group input-group-sm">' +
                '<span class="input-group-text">Qty</span>' +
                '<input type="number" class="form-control hw-qty-input" ' +
                'aria-label="Hardware Item ' +
                (idx + 1) +
                ' Quantity" min="1" step="1" value="' +
                (parseFloat(hw.qty) || 1) +
                '">' +
                "</div>" +
                "</div>" +
                '<div class="col-5 col-sm-3">' +
                '<div class="input-group input-group-sm">' +
                '<span class="input-group-text currency-symbol">' +
                activeCurrency +
                "</span>" +
                '<input type="number" class="form-control hw-price-input" ' +
                'aria-label="Hardware Item ' +
                (idx + 1) +
                ' Unit Price" min="0.00" step="0.01" value="' +
                (parseFloat(hw.unit_price) || 0.1).toFixed(2) +
                '">' +
                "</div>" +
                "</div>" +
                '<div class="col-2 col-sm-1 text-end">' +
                '<button type="button" class="btn btn-sm btn-outline-danger remove-hw-btn" ' +
                'aria-label="Remove Hardware Item ' +
                (idx + 1) +
                '">&times;</button>' +
                "</div>";

            const nameEl = row.querySelector(".hw-name-input");
            const qtyEl = row.querySelector(".hw-qty-input");
            const priceEl = row.querySelector(".hw-price-input");
            const removeEl = row.querySelector(".remove-hw-btn");

            nameEl.addEventListener("input", function () {
                hardwareState[idx].name = nameEl.value;
                syncHardwareJsonField();
            });
            qtyEl.addEventListener("input", function () {
                hardwareState[idx].qty = parseFloat(qtyEl.value) || 0;
                syncHardwareJsonField();
                recalculatePricing();
            });
            priceEl.addEventListener("input", function () {
                hardwareState[idx].unit_price = parseFloat(priceEl.value) || 0;
                syncHardwareJsonField();
                recalculatePricing();
            });
            removeEl.addEventListener("click", function () {
                hardwareState.splice(idx, 1);
                renderHardwareRows();
                syncHardwareJsonField();
                recalculatePricing();
            });

            hardwareContainer.appendChild(row);
        });
        syncHardwareJsonField();
    }

    if (addHardwareBtn) {
        addHardwareBtn.addEventListener("click", function () {
            hardwareState.push({
                name: "M3 Threaded Brass Insert",
                qty: 4,
                unit_price: 0.08,
            });
            renderHardwareRows();
            recalculatePricing();
        });
    }

    // ---------------------------------------------------------------------
    // CORE PRICING & IMMEDIATE RESULT ENGINE
    // ---------------------------------------------------------------------

    function applyPrinterPreset(forceOverwrite) {
        if (!printerSelect) {
            return;
        }
        const printerId = printerSelect.value;
        const spec = printerId ? printerSpecsMap[printerId] : null;

        if (!spec) {
            if (printerNoteBox) {
                printerNoteBox.textContent =
                    "Auto-sets power draw & machine wear.";
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
            printerNoteBox.textContent =
                spec.default_watts + "W · " + rateStr + "/hr wear";
        }
    }

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

    function recalculatePricing() {
        const markupRaw = parseFloat(markupInput.value);
        const markupPct = !isNaN(markupRaw) && markupRaw >= 0 ? markupRaw : 0;

        const qtyRaw = parseInt(plateQtyInput ? plateQtyInput.value : "1", 10);
        const plateQty = !isNaN(qtyRaw) && qtyRaw >= 1 ? qtyRaw : 1;

        if (batchNoteBox) {
            batchNoteBox.classList.toggle("d-none", plateQty <= 1);
            if (batchNoteCount) {
                batchNoteCount.textContent = String(plateQty);
            }
        }

        const flatSetup = Math.max(
            0,
            parseFloat(flatSetupInput ? flatSetupInput.value : "0") || 0
        );
        const perUnitPost = Math.max(
            0,
            parseFloat(perUnitPostInput ? perUnitPostInput.value : "0") || 0
        );

        const spoolPrice = parseFloat(
            spoolPriceInput ? spoolPriceInput.value : "20"
        );
        const grams = parseFloat(gramsInput ? gramsInput.value : "");
        const hours = parseFloat(hoursInput ? hoursInput.value : "");
        const rate = parseFloat(rateInput ? rateInput.value : "0.263");
        const filamentType = filamentSelect ? filamentSelect.value : "PLA";
        const printerId = printerSelect ? printerSelect.value : "";

        const isHighTemp = filamentType === "ABS" || filamentType === "TPU";
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

        const purgeGrams = Math.max(
            0,
            parseFloat(purgeGramsInput ? purgeGramsInput.value : "0") || 0
        );
        let modelFilamentCost = 0;
        let modelGramsTotal = !isNaN(grams) && grams > 0 ? grams : 0;
        let purgeRateKg = !isNaN(spoolPrice) && spoolPrice > 0 ? spoolPrice : 20;

        if (
            multicolorToggle &&
            multicolorToggle.checked &&
            spoolsState.length > 0
        ) {
            let sumG = 0;
            let sumCost = 0;
            let sumRates = 0;
            spoolsState.forEach(function (sp) {
                const g = Math.max(0, parseFloat(sp.grams) || 0);
                const r = Math.max(0.01, parseFloat(sp.cost_per_kg) || 20);
                sumG += g;
                sumCost += (r / 1000) * g;
                sumRates += r;
            });
            if (sumG > 0) {
                modelGramsTotal = sumG;
                modelFilamentCost = sumCost;
            } else {
                modelFilamentCost = (purgeRateKg / 1000) * modelGramsTotal;
            }
            const wasteSel = wasteSpoolSelect ? wasteSpoolSelect.value : "avg";
            if (
                wasteSel !== "avg" &&
                spoolsState[parseInt(wasteSel, 10)] !== undefined
            ) {
                purgeRateKg =
                    parseFloat(
                        spoolsState[parseInt(wasteSel, 10)].cost_per_kg
                    ) || purgeRateKg;
            } else {
                purgeRateKg = sumRates / spoolsState.length;
            }
        } else {
            modelFilamentCost = (purgeRateKg / 1000) * modelGramsTotal;
        }

        const purgeCost = (purgeRateKg / 1000) * purgeGrams;
        const activePurgeGrams = purgeGrams;
        const totalPlasticGrams = modelGramsTotal + activePurgeGrams;
        const wastePct =
            totalPlasticGrams > 0 && activePurgeGrams > 0
                ? (activePurgeGrams / totalPlasticGrams) * 100
                : 0;

        if (wasteBadge) {
            wasteBadge.textContent =
                "Material Waste: " +
                wastePct.toFixed(1) +
                "% (" +
                activePurgeGrams.toFixed(1) +
                "g purged)";
        }

        let hardwareCost = 0;
        hardwareState.forEach(function (hw) {
            const q = Math.max(0, parseFloat(hw.qty) || 0);
            const p = Math.max(0, parseFloat(hw.unit_price) || 0);
            hardwareCost += q * p;
        });

        const hasFullInputs =
            modelGramsTotal > 0 &&
            !isNaN(hours) &&
            hours > 0 &&
            !isNaN(rate) &&
            rate > 0 &&
            (!isNaN(spoolPrice) && spoolPrice > 0);

        if (hasFullInputs) {
            const rawFilamentCost = modelFilamentCost + purgeCost;
            const rawElectricityCost = (watts / 1000) * hours * rate;
            const rawDepreciationCost = hours * depreciationRate;

            // Material Cost (with buffer) and Machine Cost (with buffer)
            const bufferedMaterialCost = roundCurrency(
                rawFilamentCost * failureMultiplier
            );
            const bufferedMachineCost = roundCurrency(
                (rawElectricityCost + rawDepreciationCost) * failureMultiplier
            );

            const printProductionCost =
                (rawFilamentCost + rawElectricityCost + rawDepreciationCost) *
                failureMultiplier;
            const laborCost = roundCurrency(flatSetup + perUnitPost * plateQty);
            const extrasCost = roundCurrency(laborCost + hardwareCost);

            const plateTotalCost = roundCurrency(
                printProductionCost + laborCost + hardwareCost
            );

            let plateRetail = roundCurrency(
                plateTotalCost * (1 + markupPct / 100)
            );

            let floorApplied = false;
            const minFloorVal = Math.max(
                0,
                parseFloat(
                    minFloorChargeInput ? minFloorChargeInput.value : "4.00"
                ) || 4.0
            );
            if (
                applyMinFloorToggle &&
                applyMinFloorToggle.checked &&
                plateRetail < minFloorVal
            ) {
                plateRetail = roundCurrency(minFloorVal);
                floorApplied = true;
            }

            const plateProfit = roundCurrency(plateRetail - plateTotalCost);
            const grossMargin =
                plateRetail > 0
                    ? ((plateRetail - plateTotalCost) / plateRetail) * 100
                    : 0;

            const unitCost = roundCurrency(plateTotalCost / plateQty);
            const unitRetail = roundCurrency(plateRetail / plateQty);
            const unitProfit = roundCurrency(unitRetail - unitCost);

            if (helperBox) {
                helperBox.innerHTML =
                    "<strong>" +
                    markupPct +
                    "% Markup</strong> = <strong>" +
                    grossMargin.toFixed(1) +
                    "% Gross Margin</strong> (Profit: <strong>" +
                    activeCurrency +
                    plateProfit.toFixed(2) +
                    "</strong>)";
            }

            updateLiveCard({
                itemName:
                    itemNameInput && itemNameInput.value.trim()
                        ? itemNameInput.value.trim()
                        : "Current Print",
                plateQty: plateQty,
                materialCost: bufferedMaterialCost,
                machineCost: bufferedMachineCost,
                extrasCost: extrasCost,
                plateTotalCost: plateTotalCost,
                plateRetail: plateRetail,
                plateProfit: plateProfit,
                unitCost: unitCost,
                unitRetail: unitRetail,
                unitProfit: unitProfit,
                floorApplied: floorApplied,
                markupPct: markupPct,
                grossMargin: grossMargin,
                modelGrams: modelGramsTotal,
                purgeGrams: activePurgeGrams,
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
                    "% Gross Margin</strong>";
            }
        }
    }

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
        setText("live-batch-badge", "Batch of " + metrics.plateQty);
        setText(
            "live-plate-heading",
            metrics.plateQty > 1
                ? "Suggested Plate Price (Batch of " + metrics.plateQty + ")"
                : "Suggested Selling Price"
        );
        setText(
            "live-filament-cost",
            activeCurrency + metrics.materialCost.toFixed(2)
        );
        if (metrics.purgeGrams > 0) {
            setText(
                "live-material-subnote",
                Math.round(metrics.modelGrams * 10) / 10 +
                    "g model + " +
                    metrics.purgeGrams.toFixed(1) +
                    "g purge waste (+ buffer)"
            );
        } else {
            setText(
                "live-material-subnote",
                "Filament used + failure buffer"
            );
        }
        setText(
            "live-machine-cost",
            activeCurrency + metrics.machineCost.toFixed(2)
        );

        const extrasRow = document.getElementById("live-extras-row");
        if (extrasRow) {
            extrasRow.classList.toggle("d-none", metrics.extrasCost <= 0);
        }
        setText(
            "live-extras-cost",
            activeCurrency + metrics.extrasCost.toFixed(2)
        );

        setText(
            "live-total-cost",
            activeCurrency + metrics.plateTotalCost.toFixed(2)
        );
        setText(
            "live-retail-price",
            activeCurrency + metrics.plateRetail.toFixed(2)
        );
        setText(
            "live-profit",
            activeCurrency + metrics.plateProfit.toFixed(2)
        );

        const perUnitBox = document.getElementById("live-per-unit-box");
        if (perUnitBox) {
            perUnitBox.classList.toggle("d-none", metrics.plateQty <= 1);
        }
        setText("live-unit-qty-label", String(metrics.plateQty));
        setText(
            "live-unit-cost",
            activeCurrency + metrics.unitCost.toFixed(2)
        );
        setText(
            "live-unit-retail",
            activeCurrency + metrics.unitRetail.toFixed(2)
        );
        setText(
            "live-unit-profit",
            activeCurrency + metrics.unitProfit.toFixed(2)
        );
        setText(
            "live-margin-summary",
            metrics.markupPct +
                "% Markup · " +
                metrics.grossMargin.toFixed(1) +
                "% Gross Margin"
        );

        const floorBadge = document.getElementById("live-floor-badge");
        if (floorBadge) {
            floorBadge.classList.toggle("d-none", !metrics.floorApplied);
        }
    }

    if (printerSelect) {
        printerSelect.addEventListener("change", function () {
            applyPrinterPreset(true);
            recalculatePricing();
        });
    }

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
                syncLaborFromMinutes();
                renderSpoolRows();
                renderHardwareRows();
                recalculatePricing();
            }
        });
    });

    if (rateInput) {
        rateInput.addEventListener("input", function () {
            syncRatePresetHighlight(false);
            recalculatePricing();
        });
    }

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

    markupInput.addEventListener("input", function () {
        syncPresetHighlight(false);
        recalculatePricing();
    });

    const watchedInputs = [
        wattsInput,
        depreciationInput,
        filamentSelect,
        spoolPriceInput,
        gramsInput,
        hoursInput,
        itemNameInput,
        plateQtyInput,
        flatSetupInput,
        perUnitPostInput,
        purgeGramsInput,
        applyMinFloorToggle,
        minFloorChargeInput,
    ];
    watchedInputs.forEach(function (inputEl) {
        if (inputEl) {
            inputEl.addEventListener("input", recalculatePricing);
            inputEl.addEventListener("change", recalculatePricing);
        }
    });

    // ---------------------------------------------------------------------
    // 6. "HOW IT WORKS" SLIDE-OUT DRAWER & BACKDROP
    // ---------------------------------------------------------------------
    const howItWorksTrigger = document.getElementById("how-it-works-trigger");
    const howItWorksDrawer = document.getElementById("howItWorksDrawer");
    const howItWorksBackdrop = document.getElementById("howItWorksBackdrop");
    const howItWorksCloseBtn = document.getElementById(
        "how-it-works-close-btn"
    );
    const howItWorksGotItBtn = document.getElementById(
        "how-it-works-got-it-btn"
    );

    function openHowItWorksDrawer() {
        if (!howItWorksDrawer || !howItWorksBackdrop) {
            return;
        }
        howItWorksDrawer.classList.add("is-open");
        howItWorksBackdrop.classList.add("is-open");
        howItWorksDrawer.setAttribute("aria-hidden", "false");
        if (howItWorksTrigger) {
            howItWorksTrigger.setAttribute("aria-expanded", "true");
        }
        document.body.classList.add("drawer-scroll-locked");
        if (howItWorksCloseBtn) {
            howItWorksCloseBtn.focus();
        }
    }

    function closeHowItWorksDrawer() {
        if (!howItWorksDrawer || !howItWorksBackdrop) {
            return;
        }
        if (!howItWorksDrawer.classList.contains("is-open")) {
            return;
        }
        howItWorksDrawer.classList.remove("is-open");
        howItWorksBackdrop.classList.remove("is-open");
        howItWorksDrawer.setAttribute("aria-hidden", "true");
        document.body.classList.remove("drawer-scroll-locked");
        if (howItWorksTrigger) {
            howItWorksTrigger.setAttribute("aria-expanded", "false");
            howItWorksTrigger.focus();
        }
    }

    if (howItWorksTrigger) {
        howItWorksTrigger.addEventListener("click", openHowItWorksDrawer);
    }
    if (howItWorksCloseBtn) {
        howItWorksCloseBtn.addEventListener("click", closeHowItWorksDrawer);
    }
    if (howItWorksGotItBtn) {
        howItWorksGotItBtn.addEventListener("click", closeHowItWorksDrawer);
    }
    if (howItWorksBackdrop) {
        howItWorksBackdrop.addEventListener("click", closeHowItWorksDrawer);
    }
    document.addEventListener("keydown", function (e) {
        if (
            e.key === "Escape" &&
            howItWorksDrawer &&
            howItWorksDrawer.classList.contains("is-open")
        ) {
            closeHowItWorksDrawer();
        }
    });

    // Initialize state on page load
    initSpoolsFromHiddenJson();
    initHardwareFromHiddenJson();
    syncRatePresetHighlight(false);
    applyPrinterPreset(false);
    syncPresetHighlight(false);
    initLaborDrawerState();
    toggleAmsDrawer();
    renderHardwareRows();
    recalculatePricing();
});
