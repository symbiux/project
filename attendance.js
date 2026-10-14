/* =============================================================================
 * attendance.js — Attendance engine
 *
 * Responsibilities:
 *   - Build a date-wise attendance record for an employee over a date range.
 *   - Derive attendance status from punches, corrections and HR decisions.
 *   - Apply the late-arrival and short-hours penalty rules.
 *   - Keep attendance records and payroll penalties as separate concepts.
 * ========================================================================== */
(function (global) {
  'use strict';

  var U = global.Utils;

  var STATUS = {
    FULL: 'Present - Full Day',
    HALF: 'Half Day',
    ABSENT: 'Absent',
    WEEKLY_OFF: 'Weekly Off',
    HOLIDAY: 'Holiday',
    PENDING: 'Pending Review'
  };

  /** Statuses HR may choose when correcting/reconciling attendance. */
  var MANUAL_STATUSES = [STATUS.FULL, STATUS.HALF, STATUS.ABSENT];

  /** Payable fraction of a day for a base attendance status. */
  var DAY_VALUE = {
    'Present - Full Day': 1,
    'Half Day': 0.5,
    'Absent': 0,
    'Weekly Off': 1,   // weekly offs are paid by default
    'Holiday': 1,      // adjusted to 0 for unpaid holidays
    'Pending Review': 1
  };

  function isWeeklyOff(dateKey, settings) {
    var days = (settings && settings.weeklyOffDays) || [0];
    return days.indexOf(U.dayOfWeek(dateKey)) !== -1;
  }

  function isExcludedDate(emp, dateKey) {
    if (emp.doj && dateKey < emp.doj) return true;
    if (emp.endDate && dateKey > emp.endDate) return true;
    return false;
  }

  /**
   * Derive the attendance status for one date.
   * Returns a "day" object used by both the attendance table and payroll.
   */
  function buildDay(emp, dateKey, settings) {
    var punch = global.Store.getPunch(emp.empId, dateKey) || {};
    var holiday = global.Store.holidayOn(dateKey);
    var weeklyOff = isWeeklyOff(dateKey, settings);
    var manualStatus = punch.manualStatus || null;
    var reconciled = punch.source === 'HR Reconciliation';

    var shiftStart = U.toMinutes(settings.shiftStart || '10:00');
    var requiredMinutes = (Number(settings.requiredHours) || 9) * 60;
    var breakMinutes = Number(settings.breakMinutes) || 0;

    var punchIn = U.toMinutes(punch.punchIn);
    var punchOut = U.toMinutes(punch.punchOut);
    var workedMinutes = 0;
    if (punchIn != null && punchOut != null && punchOut > punchIn) {
      workedMinutes = punchOut - punchIn - breakMinutes;
      if (workedMinutes < 0) workedMinutes = 0;
    } else if (punchIn != null && punchOut != null && punchOut <= punchIn) {
      // Overnight / invalid punch order: treat as no valid duration.
      workedMinutes = 0;
    }

    var day = {
      empId: emp.empId,
      name: emp.name,
      date: dateKey,
      dayName: U.dayName(dateKey),
      punchIn: punch.punchIn || null,
      punchOut: punch.punchOut || null,
      workedMinutes: workedMinutes,
      workedHours: U.toHours(workedMinutes),
      requiredMinutes: requiredMinutes,
      weeklyOff: weeklyOff,
      holiday: holiday ? { name: holiday.name, paid: !!holiday.paid } : null,
      holidayPaid: holiday ? !!holiday.paid : false,
      overlapWeeklyOffHoliday: !!(holiday && weeklyOff),
      manualStatus: manualStatus,
      manualCorrection: punch.source === 'Manual Correction',
      reconciled: reconciled,
      source: punch.source || 'Biometric',
      correctionReason: punch.correctionReason || '',
      excluded: false,
      late: false,
      shortHours: false,
      latePenalty: 0,
      shortHoursPenalty: 0,
      penaltyDays: 0,
      status: STATUS.PENDING,
      baseValue: 0,
      finalValue: 0
    };

    /* ---- Dates outside the employment window are excluded entirely ---- */
    if (isExcludedDate(emp, dateKey)) {
      day.excluded = true;
      day.status = dateKey < emp.doj ? 'Before Joining' : 'After Exit';
      return day;
    }

    /* ---- Holiday / weekly off take precedence ---- */
    if (day.overlapWeeklyOffHoliday) {
      // A holiday that falls on a weekly off must not be counted/deducted twice.
      day.status = STATUS.HOLIDAY;
      day.baseValue = 1;
      day.note = 'Holiday coincides with weekly off — counted once';
      day.finalValue = 1;
      return day;
    }
    if (holiday) {
      day.status = STATUS.HOLIDAY;
      day.baseValue = day.holidayPaid ? 1 : 0;
      day.finalValue = day.baseValue;
      return day;
    }
    if (weeklyOff) {
      day.status = STATUS.WEEKLY_OFF;
      day.baseValue = 1;
      day.finalValue = 1;
      return day;
    }

    /* ---- Normal working day ---- */
    var hasIn = day.punchIn != null;
    var hasOut = day.punchOut != null;

    // Late arrival is derived from the (possibly corrected) punch-in time.
    if (hasIn && !reconciled) {
      var grace = Number(settings.lateGraceMinutes) || 0;
      day.late = punchIn > (shiftStart + grace);
    }

    if (manualStatus === STATUS.FULL) {
      day.status = STATUS.FULL;
    } else if (manualStatus === STATUS.HALF) {
      day.status = STATUS.HALF;
    } else if (manualStatus === STATUS.ABSENT) {
      day.status = STATUS.ABSENT;
    } else if (!hasIn && !hasOut) {
      day.status = STATUS.PENDING;
    } else if (hasIn && !hasOut) {
      // Missing punch-out: HR must correct before payroll is finalised.
      day.status = STATUS.PENDING;
    } else {
      if (workedMinutes >= requiredMinutes) day.status = STATUS.FULL;
      else if (workedMinutes > 0) day.status = STATUS.HALF;
      else day.status = STATUS.PENDING;
    }

    // Short hours: only meaningful for a punch-derived day that fell short.
    if (!reconciled && !manualStatus && day.status !== STATUS.ABSENT) {
      if (workedMinutes > 0 && workedMinutes < requiredMinutes) day.shortHours = true;
    }
    // An explicit manual decision overrides punch-derived short hours.
    if (manualStatus === STATUS.FULL) { day.shortHours = false; day.late = false; }

    day.baseValue = DAY_VALUE[day.status] != null ? DAY_VALUE[day.status] : 1;
    day.finalValue = day.baseValue;
    return day;
  }

  /**
   * Analyse a full date range for one employee, including penalties.
   * @param {object} emp
   * @param {string} startKey inclusive
   * @param {string} endKey   inclusive
   * @param {object} settings
   */
  function analyzeRange(emp, startKey, endKey, settings) {
    settings = settings || global.Store.getSettings();
    var keys = U.range(startKey, endKey);
    var days = keys.map(function (k) { return buildDay(emp, k, settings); });

    var working = days.filter(function (d) { return !d.excluded; });
    var maxPenalty = Number(settings.maxPenaltyDaysPerDate);
    if (!(maxPenalty > 0)) maxPenalty = 0.5;

    /* ---- Late arrival rule ----
     * First N late dates in the cycle are free; the N+1-th and later get a
     * half-day penalty. Counted once per date. Penalty applies even if the
     * employee completed the required hours.
     */
    var lateFreeLimit = Number(settings.lateFreeLimit);
    if (!(lateFreeLimit >= 0)) lateFreeLimit = 3;

    var lateDays = working.filter(function (d) { return d.late; });
    lateDays.forEach(function (d, i) {
      var rank = i + 1;                       // 1-based rank in the cycle
      d.lateRank = rank;
      d.latePenalty = rank > lateFreeLimit ? maxPenalty : 0;
    });

    /* ---- Short-hours rule ----
     * Up to N short days are free. If the cycle has MORE than N short days,
     * every short date in the cycle is penalised (including the first N).
     */
    var shortFreeLimit = Number(settings.shortHoursFreeLimit);
    if (!(shortFreeLimit >= 0)) shortFreeLimit = 3;

    var shortDays = working.filter(function (d) { return d.shortHours; });
    var shortPenalised = shortDays.length > shortFreeLimit;
    shortDays.forEach(function (d) {
      d.shortHoursPenalty = shortPenalised ? maxPenalty : 0;
    });

    /* ---- Combine penalties: never deduct twice for the same date ---- */
    working.forEach(function (d) {
      var combined = d.latePenalty + d.shortHoursPenalty;
      d.penaltyDays = Math.min(combined, maxPenalty);
      d.penaltyCapped = combined > maxPenalty;
      d.finalValue = Math.max(0, U.round2(d.baseValue - d.penaltyDays));
      if (d.penaltyDays > 0 && d.baseValue === 1) d.penalisedFullDay = true;
    });

    /* ---- Summary ---- */
    var summary = {
      cycleDays: keys.length,
      eligibleDays: working.length,
      fullDays: 0,
      halfDays: 0,
      absences: 0,
      paidWeeklyOffs: 0,
      paidHolidays: 0,
      unpaidHolidays: 0,
      unpaidDays: 0,
      pendingReview: 0,
      lateCount: 0,
      shortHoursCount: 0,
      penalisedLateCount: 0,
      penalisedShortCount: 0,
      totalPenaltyDays: 0,
      payableDays: 0,
      unresolvedDates: []
    };

    working.forEach(function (d) {
      switch (d.status) {
        case STATUS.FULL: summary.fullDays++; break;
        case STATUS.HALF: summary.halfDays++; break;
        case STATUS.ABSENT: summary.absences++; break;
        case STATUS.WEEKLY_OFF: summary.paidWeeklyOffs++; break;
        case STATUS.HOLIDAY:
          if (d.holidayPaid) summary.paidHolidays++; else summary.unpaidHolidays++;
          break;
        case STATUS.PENDING:
          summary.pendingReview++;
          summary.unresolvedDates.push(d.date);
          break;
      }
      if (d.late) summary.lateCount++;
      if (d.shortHours) summary.shortHoursCount++;
      if (d.latePenalty > 0) summary.penalisedLateCount++;
      if (d.shortHoursPenalty > 0) summary.penalisedShortCount++;
      summary.totalPenaltyDays += d.penaltyDays;
      if (d.baseValue === 0) summary.unpaidDays++;
      summary.payableDays += d.finalValue;
    });

    summary.totalPenaltyDays = U.round2(summary.totalPenaltyDays);
    summary.payableDays = U.round2(summary.payableDays);

    return { days: days, working: working, summary: summary };
  }

  /** Convenience wrapper for a salary cycle. */
  function analyzeCycle(emp, cycle, settings) {
    return analyzeRange(emp, cycle.start, cycle.end, settings || global.Store.getSettings());
  }

  /**
   * Joining-date reconciliation: eligible dates are the days between the
   * joining date and the first available punch date (exclusive of the punch
   * date) that have no HR decision yet.
   *
   * @param {object} emp
   * @param {object} [scope] optional {start, end} window (e.g. the salary
   *   cycle). When supplied, only the in-window dates are reported as
   *   unresolved, so a historical gap can never block a later payroll.
   */
  function reconciliationInfo(emp, scope) {
    var firstPunch = global.Store.earliestPunchDate(emp.empId);
    var info = {
      empId: emp.empId,
      name: emp.name,
      doj: emp.doj,
      firstPunchDate: firstPunch,
      mismatch: false,
      eligibleDates: [],
      unresolvedDates: [],
      decisions: global.Store.listReconciliations(emp.empId)
    };
    if (!firstPunch) return info;
    if (firstPunch <= emp.doj) return info;

    info.mismatch = true;
    var dates = U.range(U.addDays(emp.doj, 1), U.addDays(firstPunch, -1));
    if (scope && scope.start) {
      dates = dates.filter(function (d) { return d >= scope.start && d <= (scope.end || scope.start); });
    }
    info.eligibleDates = dates;
    info.unresolvedDates = dates.filter(function (d) {
      return !global.Store.reconciliationFor(emp.empId, d);
    });
    return info;
  }

  global.Attendance = {
    STATUS: STATUS,
    MANUAL_STATUSES: MANUAL_STATUSES,
    DAY_VALUE: DAY_VALUE,
    isWeeklyOff: isWeeklyOff,
    isExcludedDate: isExcludedDate,
    buildDay: buildDay,
    analyzeRange: analyzeRange,
    analyzeCycle: analyzeCycle,
    reconciliationInfo: reconciliationInfo
  };
})(window);
