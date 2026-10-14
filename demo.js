/* =============================================================================
 * demo.js — Optional demo data
 *
 * Loads a small, deterministic dataset that exercises the required scenarios:
 *   - first 3 late arrivals free, 4th+ penalised
 *   - four short-hours dates penalising all four dates
 *   - approved full-day attendance without punches (reconciliation)
 *   - missing-punch correction
 *   - joining mid-cycle
 *   - paid weekly offs
 *   - HR-entered paid and unpaid holidays
 *   - a holiday that coincides with a weekly off
 *   - multiple employees
 * ========================================================================== */
(function (global) {
  'use strict';

  var U = global.Utils;
  var Store = global.Store;

  function weekdayFullDay(dateKey) {
    return { punchIn: '10:00', punchOut: '19:00', source: 'Biometric' };
  }

  function load() {
    var cycle = U.cycleForMonthLabel(U.cycleLabelForDate(U.todayKey()));
    var keys = U.range(cycle.start, cycle.end);
    var settings = Store.getSettings();

    /* ---- Employees ---- */
    if (!Store.getEmployee('EMP001')) {
      Store.addEmployee({ empId: 'EMP001', name: 'Asha Verma', doj: U.addDays(cycle.start, -120),
        monthlySalary: 60000, status: 'Active' });
    }
    if (!Store.getEmployee('EMP002')) {
      Store.addEmployee({ empId: 'EMP002', name: 'Rahul Mehta', doj: U.addDays(cycle.start, -200),
        monthlySalary: 45000, status: 'Active' });
    }
    if (!Store.getEmployee('EMP003')) {
      Store.addEmployee({ empId: 'EMP003', name: 'Neha Singh', doj: U.addDays(cycle.start, -60),
        monthlySalary: 52000, status: 'Active' });
    }
    if (!Store.getEmployee('EMP004')) {
      // Joining mid-cycle, with a joining-date / first-punch mismatch.
      Store.addEmployee({ empId: 'EMP004', name: 'Vikram Rao', doj: U.addDays(cycle.start, 14),
        monthlySalary: 38000, status: 'Active' });
    }

    /* ---- EMP001: normal full days; one unpaid holiday is handled globally ---- */
    keys.forEach(function (d) {
      if (U.isWeekend(d)) return;
      Store.setPunch('EMP001', d, weekdayFullDay(d));
    });

    /* ---- EMP002: four short-hours dates (7h) -> all four penalised ---- */
    var shortDates = keys.filter(function (d) { return !U.isWeekend(d); }).slice(5, 9);
    keys.forEach(function (d) {
      if (U.isWeekend(d)) return;
      Store.setPunch('EMP002', d, weekdayFullDay(d));
    });
    shortDates.forEach(function (d) {
      Store.setPunch('EMP002', d, { punchIn: '10:00', punchOut: '17:00', source: 'Biometric' });
    });

    /* ---- EMP003: five late arrivals -> #4 and #5 penalised ---- */
    var lateDates = keys.filter(function (d) { return !U.isWeekend(d); }).slice(2, 7);
    keys.forEach(function (d) {
      if (U.isWeekend(d)) return;
      Store.setPunch('EMP003', d, weekdayFullDay(d));
    });
    lateDates.forEach(function (d) {
      Store.setPunch('EMP003', d, { punchIn: '11:00', punchOut: '20:00', source: 'Biometric' });
    });

    /* ---- EMP004: missing punch-out on one date (needs correction) ---- */
    var firstPunch = U.addDays(Store.getEmployee('EMP004').doj, 2); // mismatch: punches start 2 days after joining
    U.range(firstPunch, cycle.end).forEach(function (d) {
      if (U.isWeekend(d)) return;
      Store.setPunch('EMP004', d, weekdayFullDay(d));
    });
    Store.setPunch('EMP004', firstPunch, { punchIn: '10:00', punchOut: null, source: 'Biometric' });

    /* ---- Holidays (approved list) ---- */
    var paidHoliday = keys.filter(function (d) { return U.dayOfWeek(d) === 3; })[1];
    var unpaidHoliday = keys.filter(function (d) { return U.dayOfWeek(d) === 4; })[1];
    var weeklyOffDay = (settings.weeklyOffDays[0] != null) ? settings.weeklyOffDays[0] : 0;
    var holidayOnWeeklyOff = keys.filter(function (d) { return U.dayOfWeek(d) === weeklyOffDay; })[2];

    if (paidHoliday) {
      Store.addHoliday({ date: paidHoliday, name: 'Founders Day (Paid)', paid: true, remarks: 'Demo' });
    }
    if (unpaidHoliday) {
      Store.addHoliday({ date: unpaidHoliday, name: 'Optional Holiday (Unpaid)', paid: false, remarks: 'Demo' });
    }
    if (holidayOnWeeklyOff) {
      Store.addHoliday({ date: holidayOnWeeklyOff, name: 'Holiday on Weekly Off', paid: true, remarks: 'Demo — must not double count' });
    }

    Store.logAudit('Demo data loaded', 'Employees, punches and holidays for ' + U.fmtMonth(cycle.label));
    Store.save();
    return cycle;
  }

  global.Demo = { load: load };
})(window);
