# 🖨️ 3D Print Cost & Retail Price Calculator

A full-stack Django web application designed for 3D printing hobbyists, makers, and small-batch production businesses. It calculates precise production costs—factoring in filament weight, spool price, machine wattage, electricity tariffs, and material-specific failure buffers—to suggest sustainable retail pricing and project accurate profit margins.

---

## 📋 Table of Contents
1. [Project Overview & UX](#1-project-overview--ux)
2. [Agile Methodology & User Stories](#2-agile-methodology--user-stories)
3. [AI Augmentation & Implementation](#3-ai-augmentation--implementation)
4. [Wireframes](#4-wireframes)
5. [Data Model Architecture](#5-data-model-architecture)
6. [Calculation Logic & Formulas](#6-calculation-logic--formulas)
7. [Features & Defensive Design](#7-features--defensive-design)
8. [Testing & Quality Assurance](#8-testing--quality-assurance)
9. [Bugs & Resolved Issues](#9-bugs--resolved-issues)
10. [Technologies Used](#10-technologies-used)
11. [Local Development & Setup](#11-local-development--setup)
12. [Future Roadmap & Planned Deployment](#12-future-roadmap--planned-deployment)
13. [Credits & Acknowledgements](#13-credits--acknowledgements)

---

## 1. Project Overview & UX

### Target Audience
* **Hobbyist Makers**: Want quick pricing estimates without complex manual spreadsheets.
* **Etsy / Craft Sellers**: Need reliable retail pricing formulas that factor in electricity overhead and print failure risk buffers.
* **Small 3D Print Farms**: Require a persistent catalogue to manage recurring product lines and track profit margins.

### User Goals
* Calculate total print cost (materials + energy + risk buffer) instantly.
* See clear visual separation between production cost and projected profit.
* Save customized print calculations to a private account dashboard.
* Update existing calculations when material costs or energy tariffs fluctuate.

### Design & Typography
* **Color Palette**: Dark charcoal header/navigation (`#212529`), clean off-white background (`#f8f9fa`), primary maker blue (`#0d6efd`), and retail success green (`#198754`).
* **Typography**: Clean system sans-serif hierarchy for cross-device readability.

---

## 2. Agile Methodology & User Stories

Development was organized into prioritized user stories:

### Implemented Stories
* **US01 (Must Have): Public Calculator Form**
  * *Acceptance Criteria*: Guest visitors can input item name, printer hardware, filament type, spool price, grams, time, electricity tariff, and profit markup percentage.
* **US02 (Must Have): Instant Cost Breakdown**
  * *Acceptance Criteria*: Form calculates filament cost, electricity overhead, total cost with failure buffer, recommended retail price, and profit.
* **US03 (Must Have): User Authentication (Standard Django Auth)**
  * *Acceptance Criteria*: Users can register, log in, and log out with clear flash messages. Guest users are prevented from accessing private catalogue data.
* **US04 (Must Have): Full CRUD Print Catalogue**
  * *Acceptance Criteria*: Logged-in users can Create, Read, Update, and Delete saved prints. Saved records are strictly isolated to the logged-in user.
* **US05 (Should Have): Accessible Confirmation Modals**
  * *Acceptance Criteria*: Deleting an item triggers a Bootstrap modal requiring a secondary confirmation POST action to prevent accidental deletion.
* **US06 (Should Have): Catalogue Summary Metrics**
  * *Acceptance Criteria*: The catalogue dashboard displays running statistical metric cards (Total Saved Items, Average Profit per Item).
* **US07 (Could Have): Multi-Filament Presets**
  * *Acceptance Criteria*: Automatic assignment of dynamic failure buffers (5% for standard PLA/PETG; 15% for high-temperature ABS/TPU).

---

## 3. AI Augmentation & Implementation

As part of the AI-augmented developer workflow, Large Language Models and AI developer tooling were incorporated across the development cycle.

### 1. Architecture & Model Refinement
* **Auth Optimization**: Evaluated authentication options and decided to replace heavy third-party packages (`django-allauth`) with standard Django authentication (`django.contrib.auth`), customized Bootstrap templates, and POST-only logout handling.
* **Decimal Precision**: Assisted in identifying floating-point rounding hazards, leading to the transition of `SavedPrint.save()` calculations to Python's `decimal.Decimal` module using `ROUND_HALF_UP` quantization.

### 2. Testing Scaffolding & Debugging
* **Automated Unit Testing**: Generated test structures in `print_calc/tests.py` covering model representation, mathematical calculation accuracy, failure multiplier thresholds, view access redirection, and full CRUD workflows.
* **Traceback Diagnostics**: Diagnosed model-test mismatches during test suite execution, resolving a string formatting whitespace bug in `PrinterMachine.__str__` and reconciling float vs `Decimal` type assertions.

### 3. Code Quality & Standards
* **PEP 8 Compliance**: Guided `.flake8` configuration and helped identify formatting adjustments to maintain 100% PEP 8 compliance.
* **Wireframe Assets**: Assisted in authoring low-fidelity, monochromatic SVG blueprint wireframes (`calculator-desktop.svg` and `catalogue-mobile.svg`) stored in `docs/wireframes/`.

### 4. Developer Reflection
All AI suggestions were reviewed, executed, and tested locally. Edge cases and incorrect assumptions (such as high-fidelity colored mockups instead of true wireframes, or premature deployment claims) were caught, challenged, and corrected during development.

---

## 4. Wireframes

Wireframes were constructed to establish visual hierarchy, intuitive form controls, and responsive layouts across viewports:

### Desktop View (Main Calculator & Real-Time Breakdown)
![Desktop Calculator Wireframe](docs/wireframes/calculator-desktop.svg)

### Mobile View (Responsive Catalogue & Accessible Confirmation Modal)
![Mobile Catalogue Wireframe](docs/wireframes/catalogue-mobile.svg)

---

## 5. Data Model Architecture

The application relies on two relational models in `print_calc/models.py`:

    +-----------------------------------+         +-----------------------------------+
    |          PrinterMachine           |         |            SavedPrint             |
    +-----------------------------------+         +-----------------------------------+
    | id (PK)                           |         | id (PK)                           |
    | name: CharField(100)              | <-----+ | user: FK(User)                    |
    | brand: CharField(50)              |         | printer: FK(PrinterMachine, NULL) |
    | average_watts_pla: PositiveInt    |         | item_name: CharField(150)         |
    | average_watts_abs: PositiveInt    |         | filament_type: CharField(20)      |
    +-----------------------------------+         | spool_price_per_kg: Decimal(6,2)  |
                                                  | filament_grams_used: PositiveInt  |
                                                  | print_time_hours: Decimal(5,2)    |
                                                  | electricity_rate_kwh: Decimal(4,2)|
                                                  | markup_percentage: PositiveInt    |
                                                  | total_cost: Decimal(8,2)          |
                                                  | recommended_retail_price: Dec(8,2)|
                                                  | profit_per_item: Decimal(8,2)     |
                                                  | created_on: DateTimeField         |
                                                  +-----------------------------------+

---

## 6. Calculation Logic & Formulas

All cost calculations are performed within `SavedPrint.save()` using Python's `decimal.Decimal` module (`ROUND_HALF_UP`):

1. **Filament Cost:**  
   `Filament Cost = (Spool Price / 1000) * Grams Used`

2. **Electricity Cost:**  
   `Electricity Cost = (Machine Watts / 1000) * Print Hours * Tariff Rate`  
   *(Selects `average_watts_abs` for ABS/TPU filaments due to higher chamber/bed temperatures; otherwise selects `average_watts_pla`)*.

3. **Failure Risk Buffer Multiplier:**  
   - Standard materials (`PLA`, `PETG`): **5% buffer** (multiplier: `1.05`)  
   - High-temp / flexible materials (`ABS`, `TPU`): **15% buffer** (multiplier: `1.15`)  
   `Total Cost = (Filament Cost + Electricity Cost) * Failure Multiplier`

4. **Retail & Profit:**  
   `Retail Price = Total Cost * (1 + (Markup % / 100))`  
   `Profit per Item = Retail Price - Total Cost`

---

## 7. Features & Defensive Design

### Implemented Features
* **Interactive Cost Calculator**: Allows instant mathematical projections without requiring an account.
* **Authentication Suite**: Standard Django authentication with customized Bootstrap templates, CSRF tokens, and POST-only logouts.
* **Catalogue Dashboard**: Responsive grid cards with filament badges, metric cards, and timestamp metadata.
* **Defensive CRUD**: Update and Delete operations restricted exclusively to the creator of the item.

### Defensive Programming Matrix

| Scenario | Potential Risk | Defensive Mechanism Implemented |
| :--- | :--- | :--- |
| **Unauthenticated URL Access** | Guest attempts typing `/catalogue/` directly | Intercepted by `@login_required`; redirected to `/login/?next=/catalogue/`. |
| **Cross-User Data Tampering** | User B attempts editing User A's print ID | View queries `SavedPrint.objects.filter(user=request.user, id=pk)`. Returns 404 if item does not belong to logged-in user. |
| **Accidental Deletion** | Accidental click on delete button | Accessible Bootstrap modal intercepts action; requires secondary explicit confirmation. |
| **Crawler / GET Deletion** | Web crawler triggers destructive GET request | Delete route only responds to `POST` method; GET requests are rejected. |
| **Invalid Form Inputs** | Negative values entered | Django Model fields (`PositiveIntegerField`, `DecimalField`) enforce valid values. |

---

## 8. Testing & Quality Assurance

### Automated Testing (`python manage.py test`)
Automated tests in `print_calc/tests.py` cover models, views, and full CRUD workflows:
* `PrinterMachineModelTests.test_printer_string_representation`: Confirms correct `__str__` formatting.
* `SavedPrintModelTests.test_pla_failure_multiplier_calculation`: Validates `Decimal` precision formulas, 5% PLA failure buffer, and retail pricing.
* `ViewAccessTests.test_calculator_page_loads_for_anonymous_user`: Verifies public access (HTTP 200).
* `ViewAccessTests.test_catalogue_redirects_unauthenticated_user`: Verifies redirect (HTTP 302).
* `ViewAccessTests.test_catalogue_loads_for_authenticated_user`: Verifies authenticated catalogue access (HTTP 200).
* `CrudOperationTests.test_edit_print_updates_record`: Validates record update via POST request.
* `CrudOperationTests.test_delete_print_removes_record_via_post`: Validates record deletion via POST request.

All 7 automated tests run cleanly:
```text
Ran 7 tests in 8.031s
OK
```

### Manual Testing

| Feature | Action | Expected Result | Result |
| :--- | :--- | :--- | :--- |
| **Calculator Form** | Fill out inputs and click Calculate | Calculations display accurately with breakdown | Pass |
| **Guest Callout** | View calculator as guest | Banner encourages registration to save prints | Pass |
| **User Sign Up** | Submit registration form | Account created, logged in, redirected to catalogue | Pass |
| **Catalogue View** | Log in and view catalogue | User-specific prints display with metrics | Pass |
| **Edit Calculation** | Change spool price and submit | New retail price and cost computed, DB updated | Pass |
| **Delete Modal** | Click delete, cancel modal | Modal dismisses, record remains untouched | Pass |
| **Confirm Delete** | Click delete, confirm in modal | Item removed from DB, catalogue reloads | Pass |

### Lighthouse Audits

Tested via Chrome DevTools Lighthouse (Chromium, Oct 16, 2026):

| Device View | Performance | Accessibility | Best Practices | SEO | Full Report |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Desktop** | **100** | **96** | **100** | **100** | [View Desktop PDF](docs/3dprint-lighthouse-desktop.pdf) |
| **Mobile** | **99** | **95** | **100** | **100** | [View Mobile PDF](docs/3dprint-lighthouse-mobile.pdf) |

*Note: Initial accessibility check noted low-contrast text on muted descriptive notes; resolved by darkening secondary text classes to `#495057` to satisfy WCAG AA 4.5:1 ratio requirements.*

### Code Style (PEP 8)
Enforced using `flake8` with a `.flake8` configuration excluding virtual environments and migrations:
```text
$ flake8
(No output — 100% compliant)
```

---

## 9. Bugs & Resolved Issues

1. **Floating Point Rounding Inaccuracies**:
   * *Issue*: Standard Python `float` operations introduced fractional rounding discrepancies during currency calculations.
   * *Fix*: Re-architected `SavedPrint.save()` to utilize Python's `decimal.Decimal` module with explicit `ROUND_HALF_UP` quantization.
2. **Model String Representation Whitespace**:
   * *Issue*: `PrinterMachine.__str__` produced an unexpected leading space when machines were instantiated without an explicit brand.
   * *Fix*: Added conditional string formatting checking for brand existence before prepending.

---

## 10. Technologies Used

* **Python 3.13 / Django 6.1**: Backend MVC framework and core ORM.
* **Bootstrap 5.3**: Responsive UI styling, card layouts, and modal overlays.
* **HTML5 / CSS3**: Semantic markup and custom stylesheet (`static/css/style.css`).
* **SQLite**: Local relational database.
* **Flake8**: Strict PEP 8 linting enforcement.

---

## 11. Local Development & Setup

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/paulybruv/3d-print-profit-calculator.git](https://github.com/paulybruv/3d-print-profit-calculator.git)
   cd 3d-print-profit-calculator
   ```

2. **Create and activate virtual environment:**
   ```bash
   python -m venv .venv
   source .venv/Scripts/activate  # On Windows (Git Bash)
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Apply database migrations:**
   ```bash
   python manage.py migrate
   ```

5. **Execute automated tests:**
   ```bash
   python manage.py test
   ```

6. **Start local development server:**
   ```bash
   python manage.py runserver
   ```
   Open `http://127.0.0.1:8000/` in your browser.

---

## 12. Future Roadmap & Planned Deployment

* **Heroku Deployment**: Configure `Procfile`, `whitenoise`, and PostgreSQL connection via `dj-database-url` prior to final submission.
* **Code Validation**: Run formal W3C HTML, W3C CSS, and Google Lighthouse audits once the UI is finalized.
* **Custom Error Handling**: Add user-friendly 404 and 500 error templates.

---

## 13. Credits & Acknowledgements

* **Django Documentation**: For standard authentication route guidance.
* **Bootstrap Team**: For modern CSS component architecture and responsive grid system.
* **Code Institute**: For assessment rubric guidelines and full-stack development best practices.