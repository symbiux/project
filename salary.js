/* =============================================================================
 * salary.js — Salary cycle + payroll calculation
 *
 * Salary formula (default divisor = actual calendar days in the salary cycle):
 *   Daily Salary  = Monthly Salary / Calendar Days in Salary Cycle
 *   Full day      = Daily Salary x 1
 *   Half day      = Daily Salary x 0.5
 *   Unpaid day    = Daily Salary x 0
 *
 * Effective-dated salary records are resolved per date, so a salary change
 * during a cycle only affects the dates on/after its effective date.
 * ========================================================================== */
(function (global) {
  'use strict';

  var U = global.Utils;
  var A = global.Attendance;

  /* ---------------------------------------------------------------------
   * Validation
   * ------------------------------------------------------------------ */
  function validateForPayroll(emp, cycle, settings, analysis) {
    settings = settings || global.Store.getSettings();
    var errors = [];
    var warnings = [];

    if (!emp) { errors.push('Employee record not found.'); return { ok: false, errors: errors, warnings: warnings }; }
    if (!(Number(emp.monthlySalary) >= 0) || !(emp.salaryHistory || []).length) {
      errors.push('Monthly salary is missing.');
    }
    if (!emp.doj) errors.push('Date of joining is missing.');
    if (emp.doj && emp.doj > cycle.end) {
      errors.push('Date of joining is after this salary cycle.');
    }

    if (!global.Store.isHolidayListConfirmed(cycle.label)) {
      errors.push('Approved holiday list for ' + U.fmtMonth(cycle.label) + ' has not been reviewed and confirmed.');
    }

    analysis = analysis || A.analyzeCycle(emp, cycle, settings);

    var unresolved = analysis.summary.unresolvedDates;
    if (unresolved.length) {
      errors.push(unresolved.length + ' date(s) unresolved (Pending Review): ' +
        unresolved.slice(0, 5).map(U.fmt).join(', ') +
        (unresolved.length > 5 ? '…' : ''));
    }

    analysis.working.forEach(function (d) {
      if (d.punchIn && !d.punchOut && !d.manualStatus) {
        errors.push('Missing punch-out on ' + U.fmt(d.date) + ' (needs a correction).');
      }
      if (!d.punchIn && d.punchOut && !d.manualStatus) {
        errors.push('Missing punch-in on ' + U.fmt(d.date) + ' (needs a correction).');
      }
    });

    var rec = A.reconciliationInfo(emp, { start: cycle.start, end: cycle.end });
    if (rec.mismatch && rec.unresolvedDates.length) {
      errors.push(rec.unresolvedDates.length + ' joining-date reconciliation date(s) still unresolved.');
    }

    if (emp.status === 'Inactive' && !emp.endDate) {
      warnings.push('Employee is inactive but has no employment end date.');
    }
    if (analysis.summary.unpaidDays > 0) {
      warnings.push(analysis.summary.unpaidDays + ' unpaid day(s) will reduce payable salary.');
    }

    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  /* ---------------------------------------------------------------------
   * Salary cycle helpers
   * ------------------------------------------------------------------ */
  function cycleFor(label) { return U.cycleForMonthLabel(label); }

  function latestCompletedCycle() { return U.latestCompletedCycle(); }

  function cycleOptions(count) {
    var labels = U.recentCycleLabels(count || 18, U.cycleLabelForDate(U.todayKey()));
    return labels.map(function (l) { return cycleFor(l); });
  }

  /* ---------------------------------------------------------------------
   * Row calculation
   * ------------------------------------------------------------------ */
  function computeRow(emp, cycle, options) {
    options = options || {};
    var settings = global.Store.getSettings();
    var analysis = options.analysis || A.analyzeCycle(emp, cycle, settings);
    var divisor = U.daysBetweenInclusive(cycle.start, cycle.end); // actual calendar days

    var rows = [];
    var gross = 0;
    var penaltyAmount = 0;
    var breakdown = analysis.days.map(function (d) {
      var monthly = global.Store.salaryForDate(emp, d.date);
      var daily = divisor ? monthly / divisor : 0;
      var amount = d.excluded ? 0 : daily * d.finalValue;
      var penaltyValue = d.excluded ? 0 : daily * d.penaltyDays;
      if (!d.excluded) {
        gross += amount;
        penaltyAmount += penaltyValue;
      }
      return {
        date: d.date,
        dayName: d.dayName,
        status: d.excluded ? d.status : d.status,
        punchIn: d.punchIn,
        punchOut: d.punchOut,
        workedHours: d.workedHours,
        late: d.late,
        shortHours: d.shortHours,
        penaltyDays: d.penaltyDays,
        baseValue: d.baseValue,
        finalValue: d.finalValue,
        monthlySalary: U.round2(monthly),
        dailySalary: U.round2(daily),
        amount: U.round2(amount),
        note: d.note || (d.excluded ? d.status :
          (d.penaltyDays > 0 ? 'Penalty ' + d.penaltyDays + ' day(s)' : ''))
      };
    });

    var additional = 0;
    if (settings.additionalDeductionsEnabled) {
      additional = Number(options.additionalDeductions != null
        ? options.additionalDeductions
        : (settings.additionalDeductions[emp.empId] || 0)) || 0;
    }

    var summary = analysis.summary;
    var finalPayable = U.round2(gross - additional);

    var row = {
      empId: emp.empId,
      name: emp.name,
      doj: emp.doj,
      endDate: emp.endDate || null,
      status: emp.status,
      monthlySalary: U.round2(global.Store.salaryForDate(emp, cycle.end)),
      cycleLabel: cycle.label,
      cycleStart: cycle.start,
      cycleEnd: cycle.end,
      calendarDays: divisor,
      divisor: divisor,
      eligibleEmploymentDays: summary.eligibleDays,
      fullDays: summary.fullDays,
      halfDays: summary.halfDays,
      absences: summary.absences,
      paidWeeklyOffs: summary.paidWeeklyOffs,
      paidHolidays: summary.paidHolidays,
      unpaidHolidays: summary.unpaidHolidays,
      unpaidDays: summary.unpaidDays,
      pendingReview: summary.pendingReview,
      lateCount: summary.lateCount,
      shortHoursCount: summary.shortHoursCount,
      penalisedLateCount: summary.penalisedLateCount,
      penalisedShortCount: summary.penalisedShortCount,
      penaltyDays: U.round2(summary.totalPenaltyDays),
      penaltyAmount: U.round2(penaltyAmount),
      additionalDeductions: U.round2(additional),
      grossPayable: U.round2(gross),
      finalPayable: finalPayable,
      payableDays: summary.payableDays,
      breakdown: breakdown,
      summary: summary,
      validated: true
    };
    return row;
  }

  /**
   * Calculates rows for many employees. Validation is applied per employee;
   * employees that fail validation are returned with their errors instead of
   * silently producing an incorrect salary.
   */
  function computeRows(empIds, cycle, options) {
    options = options || {};
    var settings = global.Store.getSettings();
    var out = [];
    empIds.forEach(function (id) {
      var emp = global.Store.getEmployee(id);
      if (!emp) return;
      var analysis = A.analyzeCycle(emp, cycle, settings);
      var validation = validateForPayroll(emp, cycle, settings, analysis);
      var row = computeRow(emp, cycle, { analysis: analysis, additionalDeductions: options.additionalDeductions });
      row.validation = validation;
      row.validated = validation.ok;
      out.push(row);
    });
    return out;
  }

  /** Attendance exceptions used by "Review Attendance Exceptions". */
  function exceptions(empIds, cycle) {
    var settings = global.Store.getSettings();
    var list = [];
    empIds.forEach(function (id) {
      var emp = global.Store.getEmployee(id);
      if (!emp) return;
      var analysis = A.analyzeCycle(emp, cycle, settings);
      var issues = [];
      analysis.working.forEach(function (d) {
        if (d.status === A.STATUS.PENDING) issues.push('Pending Review: ' + U.fmt(d.date));
        if (d.punchIn && !d.punchOut) issues.push('Missing punch-out: ' + U.fmt(d.date));
        if (!d.punchIn && d.punchOut) issues.push('Missing punch-in: ' + U.fmt(d.date));
      });
      var rec = A.reconciliationInfo(emp, { start: cycle.start, end: cycle.end });
      rec.unresolvedDates.forEach(function (d) {
        issues.push('Joining-date mismatch unresolved: ' + U.fmt(d));
      });
      if (issues.length) list.push({ empId: emp.empId, name: emp.name, issues: issues });
    });
    return list;
  }

  /* ---------------------------------------------------------------------
   * Finalisation
   * ------------------------------------------------------------------ */
  function payrollStatus(cycleLabel) {
    var p = global.Store.getPayroll(cycleLabel);
    return p ? p.status : 'Not Finalized';
  }

  function isFinalized(cycleLabel) {
    var p = global.Store.getPayroll(cycleLabel);
    return !!p && p.status === 'Finalized';
  }

  /**
   * Finalises payroll for the given rows. Refuses if any row fails validation
   * so unresolved attendance can never silently affect salary.
   */
  function finalize(rows, cycleLabel) {
    var invalid = rows.filter(function (r) { return !r.validated; });
    if (invalid.length) {
      return { ok: false, errors: invalid.map(function (r) {
        return r.empId + ': ' + (r.validation ? r.validation.errors.join(' ') : 'invalid');
      }) };
    }
    global.Store.finalizePayroll(cycleLabel, rows);
    return { ok: true };
  }

  /** Returns frozen rows for a finalized cycle (so history never changes). */
  function frozenRows(cycleLabel) {
    var p = global.Store.getPayroll(cycleLabel);
    if (p && p.status === 'Finalized' && Array.isArray(p.rows)) return p.rows;
    return null;
  }

  global.Salary = {
    validateForPayroll: validateForPayroll,
    cycleFor: cycleFor,
    latestCompletedCycle: latestCompletedCycle,
    cycleOptions: cycleOptions,
    computeRow: computeRow,
    computeRows: computeRows,
    exceptions: exceptions,
    payrollStatus: payrollStatus,
    isFinalized: isFinalized,
    finalize: finalize,
    frozenRows: frozenRows
  };
})(window);
