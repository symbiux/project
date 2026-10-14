# HR Attendance & Salary Management — repo notes

## What this is
A dependency-free (except bundled vendor libs) HTML/CSS/vanilla-JS HR attendance and
payroll app. No build step, no framework, no server. Open `index.html` directly or serve
the folder with any static server.

## Files
- `index.html` — shell + menu; loads vendor libs then app modules in order.
- `styles.css` — minimalist theme (white bg, grey borders, blue accents, Inter).
- `storage.js` — `Utils` (date/number/cycle helpers) + `Store` (localStorage persistence,
  audit log, effective-dated salary history, holidays, corrections, reconciliations,
  payroll freeze/reopen, backup import/export).
- `attendance.js` — `Attendance`: per-date day records, status derivation, late-arrival
  and short-hours penalty rules, joining-date reconciliation.
- `salary.js` — `Salary`: cycle resolution, per-date payable calculation, payroll
  validation, finalize/freeze.
- `reports.js` — `Reports`: real XLSX (SheetJS), PDF (jsPDF + AutoTable), ZIP (JSZip).
- `demo.js` — `Demo.load()` seeds sample data covering the required test scenarios.
- `app.js` — UI controller; renders one view per menu item into `#view`.
- `vendor/` — SheetJS, jsPDF, jsPDF-AutoTable, JSZip (bundled locally; no CDN at runtime).

## Domain rules that must stay intact
- Salary cycle = 21st of previous month .. 20th of selected month inclusive. Default to
  the most recent completed cycle; never use the report download date as the cycle end.
- Daily Salary = Monthly Salary / actual calendar days in the cycle.
- Late: first N (default 3) late dates free; N+1 onward get a half-day penalty even if the
  employee completed the required hours. Count each date once.
- Short hours: if a cycle has MORE than N (default 3) short dates, every short date is
  penalised, including the first N.
- Overlapping penalties are capped at one half-day per date by default; attendance records
  and payroll penalties stay separate.
- Weekly offs are paid; a holiday on a weekly off is counted once (no double deduction).
- Only HR-entered holidays marked paid are paid.
- Payroll cannot be finalized while unresolved attendance (Pending Review, missing punch,
  unresolved joining-date gap within the cycle) or an unconfirmed holiday list exists.
- Once finalized, payroll is frozen until reopened with a reason (audit logged).

## Verification
- Logic tests: a Node harness can load `storage.js`, `attendance.js`, `salary.js` into a
  `vm` context with a `localStorage` shim and assert the scenarios (43 assertions pass).
- Report tests: run the app in headless Chromium, call `Reports.*`, and confirm real
  `PK..` (xlsx), `%PDF` (pdf) and ZIP entries under `Salary_Reports/Excel|PDF`.

## Security / deployment
Prototype persists to localStorage only. For real HR use, replace `Store` with a secure
backend database plus authenticated HR access, role-based permissions and server-side
audit logs.
