/* =============================================================================
 * storage.js — Shared helpers + persistence layer
 *
 * Prototype persistence uses localStorage (a single JSON document).
 * NOTE: browser storage is not secure multi-user payroll infrastructure.
 * For real HR use, replace this module with a secure backend database plus
 * authenticated HR access, role-based permissions and server-side audit logs.
 * ========================================================================== */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------------
   * Shared date / number helpers (used by every other module)
   * ------------------------------------------------------------------ */
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  var Utils = {
    MONTHS: MONTHS,
    MONTHS_FULL: MONTHS_FULL,
    DAYS: DAYS,

    /** Date -> 'YYYY-MM-DD' using local calendar values (no UTC shifting). */
    key: function (d) {
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    },

    /** 'YYYY-MM-DD' -> Date at local midnight. */
    date: function (key) {
      var p = String(key).split('-');
      return new Date(+p[0], +p[1] - 1, +p[2]);
    },

    todayKey: function () { return Utils.key(new Date()); },

    addDays: function (key, n) {
      var d = Utils.date(key);
      d.setDate(d.getDate() + n);
      return Utils.key(d);
    },

    /** Inclusive list of date keys from startKey..endKey. */
    range: function (startKey, endKey) {
      var out = [];
      if (!startKey || !endKey) return out;
      var cur = startKey;
      var guard = 0;
      while (cur <= endKey && guard++ < 4000) {
        out.push(cur);
        cur = Utils.addDays(cur, 1);
      }
      return out;
    },

    /** Inclusive count of calendar days between two keys. */
    daysBetweenInclusive: function (startKey, endKey) {
      return Utils.range(startKey, endKey).length;
    },

    dayOfWeek: function (key) { return Utils.date(key).getDay(); },

    dayName: function (key) { return DAYS[Utils.date(key).getDay()]; },

    isWeekend: function (key) {
      var d = Utils.date(key).getDay();
      return d === 0 || d === 6;
    },

    /** 'YYYY-MM-DD' -> '12 Aug 2026' */
    fmt: function (key) {
      if (!key) return '—';
      var d = Utils.date(key);
      return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    },

    /** 'YYYY-MM' -> 'September 2026' */
    fmtMonth: function (label) {
      if (!label) return '—';
      var p = String(label).split('-');
      return MONTHS_FULL[+p[1] - 1] + ' ' + p[0];
    },

    monthLabel: function (year, monthIndex1to12) {
      return year + '-' + pad2(monthIndex1to12);
    },

    /** 'HH:MM' -> minutes since midnight, or null. */
    toMinutes: function (hhmm) {
      if (!hhmm) return null;
      var m = String(hhmm).match(/^(\d{1,2}):(\d{2})/);
      if (!m) return null;
      var h = +m[1], mi = +m[2];
      if (h > 23 || mi > 59) return null;
      return h * 60 + mi;
    },

    minutesToHHMM: function (mins) {
      if (mins == null || isNaN(mins)) return '—';
      var neg = mins < 0;
      mins = Math.abs(Math.round(mins));
      var s = Math.floor(mins / 60) + ':' + pad2(mins % 60);
      return (neg ? '-' : '') + s;
    },

    /** Hours as a decimal, e.g. 8.5 */
    toHours: function (mins) {
      if (mins == null || isNaN(mins)) return 0;
      return Math.round((mins / 60) * 100) / 100;
    },

    hoursLabel: function (mins) {
      if (mins == null || isNaN(mins)) return '—';
      return Utils.toHours(mins).toFixed(2) + ' h';
    },

    round2: function (n) {
      if (n == null || isNaN(n)) return 0;
      return Math.round((n + Number.EPSILON) * 100) / 100;
    },

    /** INR currency formatting. */
    money: function (n) {
      var v = Utils.round2(Number(n) || 0);
      return '₹' + v.toLocaleString('en-IN', {
        minimumFractionDigits: 2, maximumFractionDigits: 2
      });
    },

    /** Escape untrusted text before inserting into innerHTML. */
    esc: function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    uid: function (prefix) {
      return (prefix || 'id') + '_' + Date.now().toString(36) + '_' +
        Math.random().toString(36).slice(2, 8);
    },

    /** Salary cycle is 21st of previous month .. 20th of the cycle month. */
    cycleForMonthLabel: function (label) {
      var p = String(label).split('-');
      var y = +p[0], m = +p[1]; // 1..12
      var end = new Date(y, m - 1, 20);
      var start = new Date(y, m - 2, 21);
      return { label: label, start: Utils.key(start), end: Utils.key(end) };
    },

    /** Cycle label for a given date: day >= 21 -> that month, else previous month. */
    cycleLabelForDate: function (key) {
      var d = Utils.date(key);
      var y = d.getFullYear(), m = d.getMonth() + 1;
      if (d.getDate() < 21) { m -= 1; if (m === 0) { m = 12; y -= 1; } }
      return Utils.monthLabel(y, m);
    },

    /** The most recently completed cycle as of today. */
    latestCompletedCycle: function () {
      return Utils.cycleForMonthLabel(Utils.cycleLabelForDate(Utils.todayKey()));
    },

    /** Previous cycle label (label is 'YYYY-MM'). */
    prevCycleLabel: function (label) {
      var p = String(label).split('-');
      var y = +p[0], m = +p[1] - 1;
      if (m === 0) { m = 12; y -= 1; }
      return Utils.monthLabel(y, m);
    },

    /** Last N cycle labels ending with the given one (newest first). */
    recentCycleLabels: function (count, endLabel) {
      var out = [], label = endLabel || Utils.cycleLabelForDate(Utils.todayKey());
      for (var i = 0; i < count; i++) { out.push(label); label = Utils.prevCycleLabel(label); }
      return out;
    }
  };

  /* ---------------------------------------------------------------------
   * Persistence
   * ------------------------------------------------------------------ */
  var KEY = 'hr_salary_system_v1';

  function defaultSettings() {
    return {
      companyName: 'Company Name',
      hrUser: 'HR Admin',
      shiftStart: '10:00',
      shiftEnd: '19:00',
      requiredHours: 9,
      breakMinutes: 0,
      lateGraceMinutes: 0,
      weeklyOffDays: [0],            // 0 = Sunday, 6 = Saturday
      lateFreeLimit: 3,              // first 3 late arrivals are free
      shortHoursFreeLimit: 3,        // first 3 short-hours days are free
      maxPenaltyDaysPerDate: 0.5,    // max one half-day penalty per date
      additionalDeductionsEnabled: false,
      additionalDeductions: {}       // { empId: amount }
    };
  }

  function emptyDB() {
    return {
      meta: { version: 1, createdAt: new Date().toISOString() },
      settings: defaultSettings(),
      employees: [],        // { empId, name, doj, monthlySalary, status, salaryHistory[], endDate, createdAt, updatedAt }
      attendance: {},       // { empId: { 'YYYY-MM-DD': { punchIn, punchOut, source, note } } }
      corrections: [],      // manual punch corrections
      reconciliations: [],  // joining-date reconciliation decisions
      holidays: [],         // { id, date, name, paid, remarks }
      holidayConfirmations: {}, // { cycleLabel: { confirmedAt, user } }
      payrolls: {},         // { cycleLabel: { status, rows, finalizedAt, user, reopenReason } }
      audit: []
    };
  }

  var _db = null;

  function load() {
    if (_db) return _db;
    try {
      var raw = global.localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        _db = Object.assign(emptyDB(), parsed);
        _db.settings = Object.assign(defaultSettings(), parsed.settings || {});
        ['employees', 'corrections', 'reconciliations', 'holidays', 'audit'].forEach(function (k) {
          if (!Array.isArray(_db[k])) _db[k] = [];
        });
        ['attendance', 'holidayConfirmations', 'payrolls'].forEach(function (k) {
          if (!_db[k] || typeof _db[k] !== 'object') _db[k] = {};
        });
      } else {
        _db = emptyDB();
      }
    } catch (e) {
      console.error('Failed to read stored data, starting fresh.', e);
      _db = emptyDB();
    }
    return _db;
  }

  function save() {
    var db = load();
    try {
      global.localStorage.setItem(KEY, JSON.stringify(db));
      return true;
    } catch (e) {
      console.error('Failed to persist data.', e);
      return false;
    }
  }

  /* ---------------------------------------------------------------------
   * Audit log
   * ------------------------------------------------------------------ */
  function logAudit(action, details) {
    var db = load();
    db.audit.unshift({
      id: Utils.uid('aud'),
      at: new Date().toISOString(),
      user: db.settings.hrUser || 'HR',
      action: action,
      details: details || ''
    });
    if (db.audit.length > 1000) db.audit.length = 1000;
  }

  /* ---------------------------------------------------------------------
   * Employees
   * ------------------------------------------------------------------ */
  function listEmployees() {
    return load().employees.slice().sort(function (a, b) {
      return String(a.empId).localeCompare(String(b.empId), undefined, { numeric: true });
    });
  }

  function getEmployee(empId) {
    return load().employees.find(function (e) { return e.empId === empId; }) || null;
  }

  function empIdExists(empId) {
    return !!getEmployee(empId);
  }

  function addEmployee(data) {
    var db = load();
    var emp = {
      empId: String(data.empId).trim(),
      name: String(data.name).trim(),
      doj: data.doj,
      endDate: data.endDate || null,
      monthlySalary: Number(data.monthlySalary),
      status: data.status === 'Inactive' ? 'Inactive' : 'Active',
      salaryHistory: [{
        effectiveFrom: data.doj,
        monthlySalary: Number(data.monthlySalary),
        note: 'Initial salary',
        createdAt: new Date().toISOString()
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.employees.push(emp);
    logAudit('Employee added', emp.empId + ' — ' + emp.name);
    save();
    return emp;
  }

  function updateEmployee(empId, data) {
    var emp = getEmployee(empId);
    if (!emp) return null;
    if (data.name != null) emp.name = String(data.name).trim();
    if (data.doj != null) emp.doj = data.doj;
    if (data.status != null) emp.status = data.status;
    if (data.endDate !== undefined) emp.endDate = data.endDate || null;
    if (data.monthlySalary != null && Number(data.monthlySalary) !== emp.monthlySalary) {
      changeSalary(empId, data.monthlySalary, data.salaryEffectiveFrom || Utils.todayKey(),
        data.salaryNote || 'Salary revision', true);
    }
    emp.updatedAt = new Date().toISOString();
    logAudit('Employee updated', empId);
    save();
    return emp;
  }

  function setEmployeeStatus(empId, status) {
    var emp = getEmployee(empId);
    if (!emp) return null;
    emp.status = status;
    if (status === 'Inactive') emp.endDate = emp.endDate || Utils.todayKey();
    emp.updatedAt = new Date().toISOString();
    logAudit('Employee status changed', empId + ' -> ' + status);
    save();
    return emp;
  }

  /**
   * Effective-dated salary change. Historical payroll is never rewritten
   * because every past cycle reads the salary record effective on each date.
   */
  function changeSalary(empId, newSalary, effectiveFrom, note, silent) {
    var emp = getEmployee(empId);
    if (!emp) return null;
    newSalary = Number(newSalary);
    if (!(newSalary >= 0)) return null;
    emp.salaryHistory = emp.salaryHistory || [];
    emp.salaryHistory = emp.salaryHistory.filter(function (h) { return h.effectiveFrom !== effectiveFrom; });
    emp.salaryHistory.push({
      effectiveFrom: effectiveFrom,
      monthlySalary: newSalary,
      note: note || 'Salary revision',
      createdAt: new Date().toISOString()
    });
    emp.salaryHistory.sort(function (a, b) { return a.effectiveFrom < b.effectiveFrom ? -1 : 1; });
    // Current monthly salary is the latest effective record.
    emp.monthlySalary = emp.salaryHistory[emp.salaryHistory.length - 1].monthlySalary;
    emp.updatedAt = new Date().toISOString();
    if (!silent) { logAudit('Salary changed', empId + ' -> ' + newSalary + ' from ' + effectiveFrom); save(); }
    return emp;
  }

  /** Monthly salary in effect on a given date (falls back to the earliest record). */
  function salaryForDate(emp, dateKey) {
    if (!emp) return 0;
    var hist = (emp.salaryHistory || []).slice().sort(function (a, b) {
      return a.effectiveFrom < b.effectiveFrom ? -1 : 1;
    });
    if (!hist.length) return Number(emp.monthlySalary) || 0;
    var chosen = null;
    for (var i = 0; i < hist.length; i++) {
      if (hist[i].effectiveFrom <= dateKey) chosen = hist[i];
    }
    return Number((chosen || hist[0]).monthlySalary) || 0;
  }

  /* ---------------------------------------------------------------------
   * Attendance punches
   * ------------------------------------------------------------------ */
  function getPunch(empId, dateKey) {
    var db = load();
    var m = db.attendance[empId];
    return (m && m[dateKey]) || null;
  }

  function setPunch(empId, dateKey, punch) {
    var db = load();
    if (!db.attendance[empId]) db.attendance[empId] = {};
    db.attendance[empId][dateKey] = Object.assign({}, db.attendance[empId][dateKey], punch);
    save();
    return db.attendance[empId][dateKey];
  }

  function deletePunch(empId, dateKey) {
    var db = load();
    if (db.attendance[empId]) delete db.attendance[empId][dateKey];
    save();
  }

  function attendanceFor(empId) {
    return load().attendance[empId] || {};
  }

  function earliestPunchDate(empId) {
    var keys = Object.keys(attendanceFor(empId)).sort();
    return keys.length ? keys[0] : null;
  }

  /* ---------------------------------------------------------------------
   * Manual corrections
   * ------------------------------------------------------------------ */
  function listCorrections(empId) {
    var list = load().corrections.slice();
    if (empId) list = list.filter(function (c) { return c.empId === empId; });
    return list.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }

  /**
   * Applies a correction: the original punch record is preserved on the
   * correction entry, and the corrected values are written to attendance.
   */
  function addCorrection(data) {
    var db = load();
    var original = getPunch(data.empId, data.date) || {};
    var corr = {
      id: Utils.uid('cor'),
      empId: data.empId,
      date: data.date,
      originalPunchIn: original.punchIn || null,
      originalPunchOut: original.punchOut || null,
      correctedPunchIn: data.correctedPunchIn || null,
      correctedPunchOut: data.correctedPunchOut || null,
      manualStatus: data.manualStatus || null,
      reason: data.reason || '',
      hrRemarks: data.hrRemarks || '',
      user: db.settings.hrUser || 'HR',
      createdAt: new Date().toISOString()
    };
    db.corrections.push(corr);

    var punch = {
      source: 'Manual Correction',
      correctionId: corr.id,
      manualStatus: corr.manualStatus || null,
      correctionReason: corr.reason
    };
    if (corr.correctedPunchIn) punch.punchIn = corr.correctedPunchIn;
    if (corr.correctedPunchOut) punch.punchOut = corr.correctedPunchOut;
    if (!db.attendance[data.empId]) db.attendance[data.empId] = {};
    db.attendance[data.empId][data.date] = Object.assign(
      {}, db.attendance[data.empId][data.date], punch
    );

    logAudit('Attendance correction saved', data.empId + ' ' + data.date +
      ' (' + (corr.manualStatus || 'punch only') + ')');
    save();
    return corr;
  }

  /* ---------------------------------------------------------------------
   * Joining-date reconciliation
   * ------------------------------------------------------------------ */
  function listReconciliations(empId) {
    var list = load().reconciliations.slice();
    if (empId) list = list.filter(function (r) { return r.empId === empId; });
    return list.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }

  /** Marks a single date (or a range) as an HR-approved attendance decision. */
  function addReconciliation(data) {
    var db = load();
    var dates = data.dates && data.dates.length ? data.dates : [data.date];
    var entries = [];
    dates.forEach(function (d) {
      var entry = {
        id: Utils.uid('rec'),
        empId: data.empId,
        date: d,
        from: data.from || d,
        to: data.to || d,
        status: data.status,
        reason: data.reason || '',
        user: db.settings.hrUser || 'HR',
        createdAt: new Date().toISOString()
      };
      db.reconciliations.push(entry);
      entries.push(entry);

      if (!db.attendance[data.empId]) db.attendance[data.empId] = {};
      db.attendance[data.empId][d] = Object.assign({}, db.attendance[data.empId][d], {
        source: 'HR Reconciliation',
        manualStatus: data.status,
        correctionReason: data.reason || 'Joining-date reconciliation'
      });
    });
    logAudit('Attendance reconciliation', data.empId + ' ' +
      (dates.length === 1 ? dates[0] : dates[0] + '..' + dates[dates.length - 1]) +
      ' -> ' + data.status);
    save();
    return entries;
  }

  /** Latest HR decision for a date, if any. */
  function reconciliationFor(empId, dateKey) {
    var list = listReconciliations(empId).filter(function (r) { return r.date === dateKey; });
    return list.length ? list[0] : null;
  }

  /* ---------------------------------------------------------------------
   * Holidays
   * ------------------------------------------------------------------ */
  function listHolidays() {
    return load().holidays.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  function holidayOn(dateKey) {
    return load().holidays.find(function (h) { return h.date === dateKey; }) || null;
  }

  function addHoliday(data) {
    var db = load();
    var h = {
      id: Utils.uid('hol'),
      date: data.date,
      name: String(data.name || '').trim(),
      paid: !!data.paid,
      remarks: data.remarks || '',
      createdAt: new Date().toISOString()
    };
    db.holidays = db.holidays.filter(function (x) { return x.date !== h.date; });
    db.holidays.push(h);
    logAudit('Holiday added', h.date + ' ' + h.name + (h.paid ? ' (paid)' : ' (unpaid)'));
    save();
    return h;
  }

  function updateHoliday(id, data) {
    var db = load();
    var h = db.holidays.find(function (x) { return x.id === id; });
    if (!h) return null;
    if (data.date != null) h.date = data.date;
    if (data.name != null) h.name = String(data.name).trim();
    if (data.paid != null) h.paid = !!data.paid;
    if (data.remarks != null) h.remarks = data.remarks;
    logAudit('Holiday updated', h.date + ' ' + h.name);
    save();
    return h;
  }

  function deleteHoliday(id) {
    var db = load();
    var h = db.holidays.find(function (x) { return x.id === id; });
    db.holidays = db.holidays.filter(function (x) { return x.id !== id; });
    if (h) logAudit('Holiday deleted', h.date + ' ' + h.name);
    save();
  }

  function holidaysInRange(startKey, endKey) {
    return listHolidays().filter(function (h) { return h.date >= startKey && h.date <= endKey; });
  }

  function confirmHolidayList(cycleLabel, confirmed) {
    var db = load();
    if (confirmed) {
      db.holidayConfirmations[cycleLabel] = {
        confirmedAt: new Date().toISOString(),
        user: db.settings.hrUser || 'HR'
      };
      logAudit('Holiday list confirmed', cycleLabel);
    } else {
      delete db.holidayConfirmations[cycleLabel];
      logAudit('Holiday list confirmation cleared', cycleLabel);
    }
    save();
  }

  function isHolidayListConfirmed(cycleLabel) {
    return !!load().holidayConfirmations[cycleLabel];
  }

  /* ---------------------------------------------------------------------
   * Payroll
   * ------------------------------------------------------------------ */
  function getPayroll(cycleLabel) {
    return load().payrolls[cycleLabel] || null;
  }

  function savePayroll(cycleLabel, payroll) {
    var db = load();
    db.payrolls[cycleLabel] = Object.assign({}, db.payrolls[cycleLabel], payroll);
    save();
    return db.payrolls[cycleLabel];
  }

  function finalizePayroll(cycleLabel, rows) {
    var db = load();
    db.payrolls[cycleLabel] = {
      cycleLabel: cycleLabel,
      status: 'Finalized',
      rows: rows,
      finalizedAt: new Date().toISOString(),
      user: db.settings.hrUser || 'HR',
      reopenReason: null,
      reopenLog: (db.payrolls[cycleLabel] && db.payrolls[cycleLabel].reopenLog) || []
    };
    logAudit('Payroll finalized', cycleLabel + ' (' + rows.length + ' employee(s))');
    save();
    return db.payrolls[cycleLabel];
  }

  function reopenPayroll(cycleLabel, reason) {
    var db = load();
    var p = db.payrolls[cycleLabel];
    if (!p) return null;
    p.status = 'Reopened';
    p.reopenReason = reason;
    p.reopenLog = p.reopenLog || [];
    p.reopenLog.push({
      at: new Date().toISOString(),
      user: db.settings.hrUser || 'HR',
      reason: reason
    });
    logAudit('Payroll reopened', cycleLabel + ' — ' + reason);
    save();
    return p;
  }

  /* ---------------------------------------------------------------------
   * Settings
   * ------------------------------------------------------------------ */
  function getSettings() { return load().settings; }

  function updateSettings(patch) {
    var db = load();
    Object.assign(db.settings, patch);
    logAudit('Settings updated', Object.keys(patch).join(', '));
    save();
    return db.settings;
  }

  /* ---------------------------------------------------------------------
   * Backup / restore
   * ------------------------------------------------------------------ */
  function exportBackup() {
    return {
      exportedAt: new Date().toISOString(),
      app: 'hr_salary_system',
      version: 1,
      data: load()
    };
  }

  function importBackup(obj) {
    var incoming = obj && obj.data ? obj.data : obj;
    if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.employees)) {
      throw new Error('Backup file is not a valid HR data export.');
    }
    _db = Object.assign(emptyDB(), incoming);
    _db.settings = Object.assign(defaultSettings(), incoming.settings || {});
    logAudit('Backup imported', (incoming.employees || []).length + ' employee(s)');
    save();
    return _db;
  }

  function resetAll() {
    _db = emptyDB();
    save();
  }

  global.Utils = Utils;
  global.Store = {
    KEY: KEY,
    load: load,
    save: save,
    resetAll: resetAll,
    defaultSettings: defaultSettings,

    logAudit: logAudit,
    auditLog: function () { return load().audit.slice(); },

    listEmployees: listEmployees,
    getEmployee: getEmployee,
    empIdExists: empIdExists,
    addEmployee: addEmployee,
    updateEmployee: updateEmployee,
    setEmployeeStatus: setEmployeeStatus,
    changeSalary: changeSalary,
    salaryForDate: salaryForDate,

    getPunch: getPunch,
    setPunch: setPunch,
    deletePunch: deletePunch,
    attendanceFor: attendanceFor,
    earliestPunchDate: earliestPunchDate,

    listCorrections: listCorrections,
    addCorrection: addCorrection,

    listReconciliations: listReconciliations,
    addReconciliation: addReconciliation,
    reconciliationFor: reconciliationFor,

    listHolidays: listHolidays,
    holidayOn: holidayOn,
    addHoliday: addHoliday,
    updateHoliday: updateHoliday,
    deleteHoliday: deleteHoliday,
    holidaysInRange: holidaysInRange,
    confirmHolidayList: confirmHolidayList,
    isHolidayListConfirmed: isHolidayListConfirmed,

    getPayroll: getPayroll,
    savePayroll: savePayroll,
    finalizePayroll: finalizePayroll,
    reopenPayroll: reopenPayroll,

    getSettings: getSettings,
    updateSettings: updateSettings,

    exportBackup: exportBackup,
    importBackup: importBackup
  };
})(window);
