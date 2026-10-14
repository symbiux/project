/* =============================================================================
 * app.js — UI controller
 * Vanilla JS, no framework. Renders each menu view into #view.
 * ========================================================================== */
(function (global) {
  'use strict';

  var U = global.Utils;
  var Store = global.Store;
  var A = global.Attendance;
  var S = global.Salary;
  var R = global.Reports;

  var state = {
    view: 'dashboard',
    cycleLabel: U.cycleLabelForDate(U.todayKey()),
    attendanceEmp: '',
    attendanceStart: null,
    attendanceEnd: null,
    empSearch: '',
    selected: {},
    rows: [],
    reconciliationEmp: ''
  };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var view = function () { return $('#view'); };

  /* ---------------------------------------------------------------------
   * Small UI utilities
   * ------------------------------------------------------------------ */
  function toast(msg, type) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast ' + (type || '');
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.hidden = true; }, 3600);
  }

  function openModal(title, html) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    $('#modal').hidden = false;
  }
  function closeModal() { $('#modal').hidden = true; $('#modalBody').innerHTML = ''; }

  function badgeForStatus(status) {
    var cls = 'pending';
    if (status === A.STATUS.FULL) cls = 'full';
    else if (status === A.STATUS.HALF) cls = 'half';
    else if (status === A.STATUS.ABSENT) cls = 'absent';
    else if (status === A.STATUS.WEEKLY_OFF || status === A.STATUS.HOLIDAY) cls = 'off';
    else if (status === 'Before Joining' || status === 'After Exit') cls = '';
    return '<span class="badge ' + cls + '">' + U.esc(status) + '</span>';
  }

  function currentCycle() { return S.cycleFor(state.cycleLabel); }

  function employeeOptions(selectedId, includeAll) {
    var opts = includeAll ? '<option value="">All employees</option>' : '';
    Store.listEmployees().forEach(function (e) {
      opts += '<option value="' + U.esc(e.empId) + '"' +
        (e.empId === selectedId ? ' selected' : '') + '>' +
        U.esc(e.empId) + ' — ' + U.esc(e.name) + (e.status === 'Inactive' ? ' (Inactive)' : '') +
        '</option>';
    });
    return opts;
  }

  function cycleSelectOptions(selectedLabel) {
    return S.cycleOptions(18).map(function (c) {
      return '<option value="' + c.label + '"' + (c.label === selectedLabel ? ' selected' : '') + '>' +
        U.fmtMonth(c.label) + ' (' + U.fmt(c.start) + ' – ' + U.fmt(c.end) + ')</option>';
    }).join('');
  }

  function notice(kind, html) {
    return '<div class="notice ' + (kind || '') + '">' + html + '</div>';
  }

  function stat(k, v) {
    return '<div class="stat"><div class="k">' + U.esc(k) + '</div><div class="v">' + U.esc(String(v)) + '</div></div>';
  }

  function field(name, label, type, value, placeholder) {
    return '<div><label>' + U.esc(label) + '</label><input name="' + name + '" type="' + type + '"' +
      (value ? ' value="' + U.esc(value) + '"' : '') +
      (placeholder ? ' placeholder="' + U.esc(placeholder) + '"' : '') + '></div>';
  }

  /* =====================================================================
   * Router
   * ================================================================== */
  var TITLES = {
    dashboard: 'Dashboard',
    employees: 'Employee Management',
    attendance: 'Attendance',
    corrections: 'Attendance Corrections',
    reconciliation: 'Joining Date & First Punch Reconciliation',
    holidays: 'Holiday & Weekly-Off Management',
    salary: 'Salary Processing',
    reports: 'Reports',
    settings: 'Settings'
  };

  function go(name) {
    state.view = name;
    Array.prototype.forEach.call(document.querySelectorAll('.nav-item'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === name);
    });
    $('#viewTitle').textContent = TITLES[name] || name;
    render();
  }

  function render() {
    var s = Store.getSettings();
    $('#brandCompany').textContent = s.companyName;
    $('#brandUser').textContent = s.hrUser;
    var c = currentCycle();
    $('#cyclePill').textContent = 'Cycle: ' + U.fmtMonth(c.label) + ' · ' + U.fmt(c.start) + ' – ' + U.fmt(c.end);

    var fns = {
      dashboard: renderDashboard,
      employees: renderEmployees,
      attendance: renderAttendance,
      corrections: renderCorrections,
      reconciliation: renderReconciliation,
      holidays: renderHolidays,
      salary: renderSalary,
      reports: renderReports,
      settings: renderSettings
    };
    (fns[state.view] || renderDashboard)();
  }

  /* =====================================================================
   * Dashboard
   * ================================================================== */
  function renderDashboard() {
    var emps = Store.listEmployees();
    var active = emps.filter(function (e) { return e.status === 'Active'; }).length;
    var c = currentCycle();
    var status = S.payrollStatus(c.label);
    var holidays = Store.holidaysInRange(c.start, c.end);

    var pending = 0;
    emps.forEach(function (e) { pending += A.analyzeCycle(e, c).summary.pendingReview; });

    var html = '<div class="stats">' +
      stat('Employees', emps.length) +
      stat('Active', active) +
      stat('Pending Review Days (' + U.fmtMonth(c.label) + ')', pending) +
      stat('Payroll Status', status) +
      '</div>';

    html += '<div class="grid cols-2 mt">';
    html += '<div class="card"><h3>Current Salary Cycle</h3>' +
      '<p class="card-sub">21st of the previous month to the 20th of the selected month, inclusive.</p>' +
      '<ul class="list-clean">' +
      '<li><span class="muted">Cycle</span> <span class="strong">' + U.fmtMonth(c.label) + '</span></li>' +
      '<li><span class="muted">Start</span> ' + U.fmt(c.start) + '</li>' +
      '<li><span class="muted">End</span> ' + U.fmt(c.end) + '</li>' +
      '<li><span class="muted">Calendar days</span> ' + U.daysBetweenInclusive(c.start, c.end) + '</li>' +
      '<li><span class="muted">Holiday list confirmed</span> ' +
        (Store.isHolidayListConfirmed(c.label) ? '<span class="badge ok">Yes</span>' : '<span class="badge flag">No</span>') + '</li>' +
      '<li><span class="muted">Approved holidays in cycle</span> ' + holidays.length + '</li>' +
      '</ul></div>';

    html += '<div class="card"><h3>Recent Activity</h3>' +
      '<p class="card-sub">Audit log of HR actions.</p>';
    var log = Store.auditLog().slice(0, 8);
    if (!log.length) html += '<div class="empty">No activity yet.</div>';
    else {
      html += '<ul class="list-clean">';
      log.forEach(function (l) {
        html += '<li>' + U.esc(l.action) + ' <span class="muted small">— ' + U.esc(l.details) +
          ' · ' + new Date(l.at).toLocaleString('en-IN') + '</span></li>';
      });
      html += '</ul>';
    }
    html += '</div></div>';

    if (!emps.length) {
      html += notice('', 'No employees yet. Add employees in <b>Employee Management</b>, ' +
        'or load demo data from <b>Settings</b>.');
    }
    view().innerHTML = html;
  }

  /* =====================================================================
   * Employee Management
   * ================================================================== */
  var editingEmpId = null;

  function renderEmployees() {
    var html = '<div class="card"><h3>Add / Edit Employee</h3>' +
      '<p class="card-sub">Employee ID is unique and mandatory. Salary changes are stored with an effective date so finalized payroll is never altered.</p>' +
      '<form id="empForm"><div class="grid cols-4">' +
      field('empId', 'Employee ID *', 'text', '', 'e.g. EMP001') +
      field('name', 'Employee Name *', 'text', '', 'Full name') +
      field('doj', 'Date of Joining *', 'date', '') +
      field('monthlySalary', 'Monthly Salary (INR) *', 'number', '', 'e.g. 45000') +
      '</div><div class="grid cols-4 mt">' +
      '<div><label>Employment Status</label><select name="status"><option>Active</option><option>Inactive</option></select></div>' +
      field('endDate', 'Employment End Date (optional)', 'date', '') +
      field('salaryEffectiveFrom', 'Salary Effective From', 'date', U.todayKey(), '') +
      field('salaryNote', 'Salary Change Note', 'text', '', 'e.g. Annual revision') +
      '</div><div class="row mt">' +
      '<button class="btn" type="submit" id="empSubmit">Add Employee</button>' +
      '<button class="btn secondary" type="button" id="empReset">Clear</button>' +
      '<div class="spacer"></div>' +
      '<span class="muted small" id="empMode">Mode: new employee</span>' +
      '</div></form></div>';

    html += '<div class="card"><div class="row tight">' +
      '<div style="flex:1;min-width:220px"><label>Search by name or ID</label>' +
      '<input id="empSearch" type="text" placeholder="Type to filter…" value="' + U.esc(state.empSearch) + '"></div>' +
      '<button class="btn secondary" id="empRefresh">Refresh</button></div>' +
      '<div id="empTable" class="mt"></div></div>';

    view().innerHTML = html;
    $('#empForm').addEventListener('submit', onEmployeeSubmit);
    $('#empReset').addEventListener('click', resetEmployeeForm);
    $('#empSearch').addEventListener('input', function (e) { state.empSearch = e.target.value; renderEmployeeTable(); });
    $('#empRefresh').addEventListener('click', renderEmployeeTable);
    renderEmployeeTable();
  }

  function resetEmployeeForm() {
    editingEmpId = null;
    var f = $('#empForm');
    f.reset();
    f.salaryEffectiveFrom.value = U.todayKey();
    $('#empSubmit').textContent = 'Add Employee';
    $('#empMode').textContent = 'Mode: new employee';
    f.empId.disabled = false;
  }

  function onEmployeeSubmit(ev) {
    ev.preventDefault();
    var f = ev.target;
    var data = {
      empId: f.empId.value.trim(),
      name: f.name.value.trim(),
      doj: f.doj.value,
      monthlySalary: f.monthlySalary.value,
      status: f.status.value,
      endDate: f.endDate.value || null,
      salaryEffectiveFrom: f.salaryEffectiveFrom.value || U.todayKey(),
      salaryNote: f.salaryNote.value.trim()
    };
    var errors = [];
    if (!data.empId) errors.push('Employee ID is required.');
    if (!data.name) errors.push('Employee Name is required.');
    if (!data.doj) errors.push('Date of Joining is required.');
    if (!(Number(data.monthlySalary) > 0)) errors.push('Monthly Salary must be greater than 0.');
    if (data.endDate && data.endDate < data.doj) errors.push('Employment End Date cannot be before Date of Joining.');
    if (!editingEmpId && Store.empIdExists(data.empId)) errors.push('Employee ID "' + data.empId + '" already exists.');
    if (errors.length) { toast(errors[0], 'error'); return; }

    if (editingEmpId) {
      Store.updateEmployee(editingEmpId, {
        name: data.name, doj: data.doj, status: data.status, endDate: data.endDate,
        monthlySalary: Number(data.monthlySalary),
        salaryEffectiveFrom: data.salaryEffectiveFrom,
        salaryNote: data.salaryNote || 'Salary revision'
      });
      toast('Employee ' + editingEmpId + ' updated.', 'ok');
    } else {
      Store.addEmployee(data);
      toast('Employee ' + data.empId + ' added.', 'ok');
    }
    resetEmployeeForm();
    render();
  }

  function startEditEmployee(empId) {
    var e = Store.getEmployee(empId);
    if (!e) return;
    editingEmpId = empId;
    var f = $('#empForm');
    f.empId.value = e.empId; f.empId.disabled = true;
    f.name.value = e.name;
    f.doj.value = e.doj;
    f.monthlySalary.value = e.monthlySalary;
    f.status.value = e.status;
    f.endDate.value = e.endDate || '';
    f.salaryEffectiveFrom.value = U.todayKey();
    f.salaryNote.value = '';
    $('#empSubmit').textContent = 'Save Changes';
    $('#empMode').textContent = 'Mode: editing ' + empId;
    window.scrollTo({ top: 0 });
  }

  function renderEmployeeTable() {
    var q = state.empSearch.trim().toLowerCase();
    var emps = Store.listEmployees().filter(function (e) {
      if (!q) return true;
      return e.name.toLowerCase().indexOf(q) !== -1 || e.empId.toLowerCase().indexOf(q) !== -1;
    });
    var html = '<div class="table-wrap"><table><thead><tr>' +
      '<th>Employee ID</th><th>Name</th><th>Date of Joining</th><th class="num">Monthly Salary</th>' +
      '<th>Status</th><th class="num">Salary Records</th><th>Actions</th></tr></thead><tbody>';
    if (!emps.length) html += '<tr><td colspan="7"><div class="empty">No employees found.</div></td></tr>';
    emps.forEach(function (e) {
      html += '<tr>' +
        '<td class="strong">' + U.esc(e.empId) + '</td>' +
        '<td>' + U.esc(e.name) + '</td>' +
        '<td>' + U.fmt(e.doj) + (e.endDate ? ' <span class="muted small">→ ' + U.fmt(e.endDate) + '</span>' : '') + '</td>' +
        '<td class="num">' + U.money(e.monthlySalary) + '</td>' +
        '<td>' + (e.status === 'Active' ? '<span class="badge ok">Active</span>' : '<span class="badge">Inactive</span>') + '</td>' +
        '<td class="num">' + (e.salaryHistory || []).length + '</td>' +
        '<td><button class="btn small secondary" data-edit="' + U.esc(e.empId) + '">Edit</button> ' +
        '<button class="btn small secondary" data-history="' + U.esc(e.empId) + '">Salary History</button> ' +
        (e.status === 'Active'
          ? '<button class="btn small danger" data-deactivate="' + U.esc(e.empId) + '">Deactivate</button>'
          : '<button class="btn small secondary" data-activate="' + U.esc(e.empId) + '">Reactivate</button>') +
        '</td></tr>';
    });
    html += '</tbody></table></div>';
    var box = $('#empTable');
    box.innerHTML = html;
    box.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { startEditEmployee(b.getAttribute('data-edit')); });
    });
    box.querySelectorAll('[data-history]').forEach(function (b) {
      b.addEventListener('click', function () { showSalaryHistory(b.getAttribute('data-history')); });
    });
    box.querySelectorAll('[data-deactivate]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-deactivate');
        if (!confirm('Deactivate ' + id + '? Historical records are preserved.')) return;
        Store.setEmployeeStatus(id, 'Inactive');
        toast(id + ' deactivated. Historical records preserved.', 'ok');
        render();
      });
    });
    box.querySelectorAll('[data-activate]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-activate');
        Store.setEmployeeStatus(id, 'Active');
        toast(id + ' reactivated.', 'ok');
        render();
      });
    });
  }

  function showSalaryHistory(empId) {
    var e = Store.getEmployee(empId);
    if (!e) return;
    var rows = (e.salaryHistory || []).slice().sort(function (a, b) { return a.effectiveFrom < b.effectiveFrom ? 1 : -1; });
    var html = '<div class="table-wrap"><table><thead><tr><th>Effective From</th>' +
      '<th class="num">Monthly Salary</th><th>Note</th><th>Recorded</th></tr></thead><tbody>';
    rows.forEach(function (h) {
      html += '<tr><td>' + U.fmt(h.effectiveFrom) + '</td><td class="num">' + U.money(h.monthlySalary) +
        '</td><td>' + U.esc(h.note || '') + '</td><td class="muted small">' +
        new Date(h.createdAt).toLocaleString('en-IN') + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<p class="muted small mt">Each date in a salary cycle uses the salary record effective on that date, ' +
      'so changing salary never rewrites finalized historical payroll.</p>';
    openModal('Salary History — ' + empId + ' ' + e.name, html);
  }

  /* =====================================================================
   * Attendance
   * ================================================================== */
  function renderAttendance() {
    var c = currentCycle();
    if (!state.attendanceStart) { state.attendanceStart = c.start; state.attendanceEnd = c.end; }

    var html = '<div class="card"><h3>Attendance Range</h3>' +
      '<p class="card-sub">Office timing 10:00 AM – 7:00 PM. Required credited working time: ' +
      Store.getSettings().requiredHours + ' hours.</p>' +
      '<div class="row tight">' +
      '<div style="flex:1;min-width:200px"><label>Employee</label><select id="attEmp">' +
        employeeOptions(state.attendanceEmp || '', true) + '</select></div>' +
      '<div><label>From</label><input id="attStart" type="date" value="' + state.attendanceStart + '"></div>' +
      '<div><label>To</label><input id="attEnd" type="date" value="' + state.attendanceEnd + '"></div>' +
      '<button class="btn" id="attApply">Show Attendance</button>' +
      '<button class="btn secondary" id="attCycle">Use Salary Cycle</button>' +
      '</div></div>';

    html += '<div class="card"><h3>Record a Punch</h3>' +
      '<p class="card-sub">Used when importing or entering raw punches. Corrections for wrong punches belong in <b>Attendance Corrections</b>.</p>' +
      '<div class="row tight">' +
      '<div style="flex:1;min-width:180px"><label>Employee</label><select id="pEmp">' + employeeOptions('', false) + '</select></div>' +
      '<div><label>Date</label><input id="pDate" type="date" value="' + U.todayKey() + '"></div>' +
      '<div><label>Punch In</label><input id="pIn" type="time" value="10:00"></div>' +
      '<div><label>Punch Out</label><input id="pOut" type="time" value="19:00"></div>' +
      '<button class="btn" id="pSave">Save Punch</button>' +
      '</div><div class="mt"><button class="btn secondary small" id="pDelete">Delete punch for this employee/date</button></div></div>';

    html += '<div id="attOut"></div>';
    view().innerHTML = html;

    $('#attApply').addEventListener('click', function () {
      state.attendanceEmp = $('#attEmp').value;
      state.attendanceStart = $('#attStart').value;
      state.attendanceEnd = $('#attEnd').value;
      renderAttendanceOutput();
    });
    $('#attCycle').addEventListener('click', function () {
      $('#attStart').value = c.start; $('#attEnd').value = c.end;
      state.attendanceStart = c.start; state.attendanceEnd = c.end;
      renderAttendanceOutput();
    });
    $('#pSave').addEventListener('click', function () {
      var empId = $('#pEmp').value, d = $('#pDate').value;
      if (!empId || !d) { toast('Select an employee and a date.', 'error'); return; }
      var pin = $('#pIn').value, pout = $('#pOut').value;
      if (U.toMinutes(pin) != null && U.toMinutes(pout) != null && U.toMinutes(pout) <= U.toMinutes(pin)) {
        toast('Punch Out must be after Punch In.', 'error'); return;
      }
      Store.setPunch(empId, d, { punchIn: pin || null, punchOut: pout || null, source: 'Biometric' });
      Store.logAudit('Punch saved', empId + ' ' + d + ' ' + (pin || '-') + '–' + (pout || '-'));
      Store.save();
      toast('Punch saved for ' + empId + ' on ' + U.fmt(d) + '.', 'ok');
      renderAttendanceOutput();
    });
    $('#pDelete').addEventListener('click', function () {
      var empId = $('#pEmp').value, d = $('#pDate').value;
      if (!empId || !d) { toast('Select an employee and a date.', 'error'); return; }
      Store.deletePunch(empId, d);
      toast('Punch deleted.', 'ok');
      renderAttendanceOutput();
    });

    renderAttendanceOutput();
  }

  function renderAttendanceOutput() {
    var box = $('#attOut');
    if (!box) return;
    var start = state.attendanceStart, end = state.attendanceEnd;
    if (!start || !end || start > end) { box.innerHTML = '<div class="card">' + notice('error', 'Select a valid date range.') + '</div>'; return; }
    var emps = Store.listEmployees();
    if (state.attendanceEmp) emps = emps.filter(function (e) { return e.empId === state.attendanceEmp; });
    if (!emps.length) { box.innerHTML = '<div class="card"><div class="empty">No employees to display.</div></div>'; return; }

    var settings = Store.getSettings();
    var html = '';
    emps.forEach(function (emp) {
      var an = A.analyzeRange(emp, start, end, settings);
      var s = an.summary;
      html += '<div class="card"><div class="row"><div><h3>' + U.esc(emp.name) +
        ' <span class="muted small">' + U.esc(emp.empId) + '</span></h3>' +
        '<p class="card-sub">' + U.fmt(start) + ' – ' + U.fmt(end) + ' · ' +
        an.working.length + ' eligible day(s)</p></div><div class="spacer"></div>' +
        '<div class="row tight">' +
        '<span class="badge full">Full ' + s.fullDays + '</span>' +
        '<span class="badge half">Half ' + s.halfDays + '</span>' +
        '<span class="badge absent">Absent ' + s.absences + '</span>' +
        '<span class="badge off">Weekly Off ' + s.paidWeeklyOffs + '</span>' +
        '<span class="badge off">Holiday ' + (s.paidHolidays + s.unpaidHolidays) + '</span>' +
        (s.pendingReview ? '<span class="badge flag">Pending ' + s.pendingReview + '</span>' : '') +
        '</div></div>';

      html += '<div class="table-wrap mt"><table><thead><tr>' +
        '<th>Employee Name</th><th>ID</th><th>Date</th><th>Punch In</th><th>Punch Out</th>' +
        '<th>Duration</th><th>Status</th><th>Late</th><th>Short Hours</th>' +
        '<th class="num">Applied Penalty</th><th>Manual Correction</th></tr></thead><tbody>';
      an.days.forEach(function (d) {
        html += '<tr>' +
          '<td>' + U.esc(emp.name) + '</td>' +
          '<td>' + U.esc(emp.empId) + '</td>' +
          '<td class="nowrap">' + U.fmt(d.date) + ' <span class="muted small">' + U.esc(d.dayName.slice(0, 3)) + '</span></td>' +
          '<td>' + (d.punchIn || '—') + '</td>' +
          '<td>' + (d.punchOut || '—') + '</td>' +
          '<td>' + (d.workedMinutes ? U.hoursLabel(d.workedMinutes) : '—') + '</td>' +
          '<td>' + badgeForStatus(d.status) + '</td>' +
          '<td>' + (d.late ? '<span class="badge flag">Late' + (d.lateRank ? ' #' + d.lateRank : '') + '</span>' : '—') + '</td>' +
          '<td>' + (d.shortHours ? '<span class="badge flag">Short</span>' : '—') + '</td>' +
          '<td class="num">' + (d.penaltyDays ? d.penaltyDays.toFixed(2) + ' day' : '—') +
            (d.penaltyCapped ? ' <span class="muted small">(capped)</span>' : '') + '</td>' +
          '<td>' + (d.manualCorrection ? '<span class="badge ok">Manual Correction</span>' :
            (d.reconciled ? '<span class="badge ok">HR Approved</span>' :
             (d.holiday ? '<span class="badge off">Holiday' + (d.holidayPaid ? '' : ' · unpaid') + '</span>' : '—'))) + '</td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
      html += '<p class="muted small mt">Late arrivals: ' + s.lateCount +
        ' (penalised dates: ' + s.penalisedLateCount + '). Short-hours dates: ' + s.shortHoursCount +
        ' (penalised dates: ' + s.penalisedShortCount + '). Total penalty: ' +
        s.totalPenaltyDays.toFixed(2) + ' day(s).</p></div>';
    });
    box.innerHTML = html;
  }

  /* =====================================================================
   * Attendance Corrections
   * ================================================================== */
  function renderCorrections() {
    var html = '<div class="card"><h3>Record an Attendance Correction</h3>' +
      '<p class="card-sub">For missing or incorrect punches. Original punch values are preserved; ' +
      'the corrected values, HR user, timestamp and reason are recorded.</p>' +
      '<form id="corrForm"><div class="grid cols-3">' +
      '<div><label>Employee *</label><select name="empId">' + employeeOptions('', false) + '</select></div>' +
      '<div><label>Attendance Date *</label><input name="date" type="date" required></div>' +
      '<div><label>Manual Attendance Status</label><select name="manualStatus">' +
        '<option value="">Use punch times</option>' +
        A.MANUAL_STATUSES.map(function (s) { return '<option value="' + U.esc(s) + '">' + U.esc(s) + '</option>'; }).join('') +
      '</select></div></div><div class="grid cols-3 mt">' +
      '<div><label>Corrected Punch In</label><input name="correctedPunchIn" type="time"></div>' +
      '<div><label>Corrected Punch Out</label><input name="correctedPunchOut" type="time"></div>' +
      '<div><label>Reason for Correction *</label><input name="reason" type="text" placeholder="e.g. Biometric failure"></div>' +
      '</div><div class="mt"><label>HR Remarks</label><textarea name="hrRemarks" placeholder="Optional remarks"></textarea></div>' +
      '<div class="row mt"><button class="btn" type="submit">Save Correction</button>' +
      '<button class="btn secondary" type="reset">Clear</button></div></form></div>' +
      '<div class="card"><h3>Correction History</h3>' +
      '<p class="card-sub">All saved corrections with original and corrected values.</p><div id="corrList"></div></div>';

    view().innerHTML = html;
    $('#corrForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var f = ev.target;
      var data = {
        empId: f.empId.value,
        date: f.date.value,
        correctedPunchIn: f.correctedPunchIn.value || null,
        correctedPunchOut: f.correctedPunchOut.value || null,
        manualStatus: f.manualStatus.value || null,
        reason: f.reason.value.trim(),
        hrRemarks: f.hrRemarks.value.trim()
      };
      if (!data.empId) { toast('Select an employee.', 'error'); return; }
      if (!data.date) { toast('Attendance date is required.', 'error'); return; }
      if (!data.reason) { toast('Reason for correction is required.', 'error'); return; }
      if (!data.correctedPunchIn && !data.correctedPunchOut && !data.manualStatus) {
        toast('Provide a corrected punch and/or a manual status.', 'error'); return;
      }
      if (data.correctedPunchIn && data.correctedPunchOut &&
          U.toMinutes(data.correctedPunchOut) <= U.toMinutes(data.correctedPunchIn)) {
        toast('Corrected Punch Out must be after Punch In.', 'error'); return;
      }
      Store.addCorrection(data);
      toast('Correction saved.', 'ok');
      f.reset();
      renderCorrectionList();
    });
    renderCorrectionList();
  }

  function renderCorrectionList() {
    var list = Store.listCorrections();
    var box = $('#corrList');
    if (!list.length) { box.innerHTML = '<div class="empty">No corrections recorded.</div>'; return; }
    var html = '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Employee</th>' +
      '<th>Original In/Out</th><th>Corrected In/Out</th><th>Manual Status</th>' +
      '<th>Reason</th><th>Remarks</th><th>HR User</th><th>Timestamp</th></tr></thead><tbody>';
    list.forEach(function (c) {
      var e = Store.getEmployee(c.empId);
      html += '<tr><td>' + U.fmt(c.date) + '</td>' +
        '<td>' + U.esc(c.empId) + ' <span class="muted small">' + U.esc(e ? e.name : '') + '</span></td>' +
        '<td>' + (c.originalPunchIn || '—') + ' / ' + (c.originalPunchOut || '—') + '</td>' +
        '<td>' + (c.correctedPunchIn || '—') + ' / ' + (c.correctedPunchOut || '—') + '</td>' +
        '<td>' + U.esc(c.manualStatus || '—') + '</td>' +
        '<td>' + U.esc(c.reason) + '</td>' +
        '<td>' + U.esc(c.hrRemarks || '—') + '</td>' +
        '<td>' + U.esc(c.user) + '</td>' +
        '<td class="muted small">' + new Date(c.createdAt).toLocaleString('en-IN') + '</td></tr>';
    });
    html += '</tbody></table></div>';
    box.innerHTML = html;
  }

  /* =====================================================================
   * Joining Date & First Punch Reconciliation
   * ================================================================== */
  function renderReconciliation() {
    var emps = Store.listEmployees();
    var html = '<div class="card"><h3>Joining Date vs First Punch</h3>' +
      '<p class="card-sub">When an employee\'s joining date and first available punch date do not match, ' +
      'HR must approve the dates in between. Approved dates are included in attendance reports and salary calculations.</p>' +
      '<div class="row tight"><div style="flex:1;min-width:220px"><label>Employee</label><select id="recEmp">' +
      employeeOptions(state.reconciliationEmp || (emps[0] && emps[0].empId) || '', false) +
      '</select></div><button class="btn" id="recShow">Show Reconciliation</button></div></div>' +
      '<div id="recOut"></div>';
    view().innerHTML = html;
    $('#recShow').addEventListener('click', function () {
      state.reconciliationEmp = $('#recEmp').value;
      renderReconciliationOutput();
    });
    if (emps.length) renderReconciliationOutput();
    else $('#recOut').innerHTML = '<div class="card"><div class="empty">No employees yet.</div></div>';
  }

  function renderReconciliationOutput() {
    var box = $('#recOut');
    var emp = Store.getEmployee(state.reconciliationEmp);
    if (!emp) { box.innerHTML = '<div class="card"><div class="empty">Select an employee.</div></div>'; return; }

    var info = A.reconciliationInfo(emp);
    var html = '<div class="card"><h3>' + U.esc(emp.name) + ' <span class="muted small">' + U.esc(emp.empId) + '</span></h3>' +
      '<p class="card-sub">Date of Joining: <b>' + U.fmt(emp.doj) + '</b> · First punch: <b>' +
      (info.firstPunchDate ? U.fmt(info.firstPunchDate) : 'none recorded') + '</b></p>';

    if (!info.mismatch) {
      html += notice('ok', 'No mismatch detected: the first punch date is on or before the date of joining.');
      html += '</div>';
      box.innerHTML = html;
      renderReconciliationHistory(box, emp.empId);
      return;
    }

    html += notice('warn', 'Mismatch detected. ' + info.eligibleDates.length +
      ' eligible date(s) between joining and the first punch. Unresolved: ' +
      info.unresolvedDates.length + '.');

    html += '<div class="row tight">' +
      '<div><label>From</label><input id="recFrom" type="date" value="' + info.eligibleDates[0] + '" min="' + info.eligibleDates[0] + '"></div>' +
      '<div><label>To</label><input id="recTo" type="date" value="' + info.eligibleDates[info.eligibleDates.length - 1] + '" max="' + info.eligibleDates[info.eligibleDates.length - 1] + '"></div>' +
      '<div><label>Status for range</label><select id="recStatus">' +
        A.MANUAL_STATUSES.map(function (s) { return '<option value="' + U.esc(s) + '">' + U.esc(s) + '</option>'; }).join('') +
      '</select></div>' +
      '<div style="flex:1;min-width:180px"><label>Reason / HR Remarks</label><input id="recReason" type="text" placeholder="e.g. Pending biometric enrolment"></div>' +
      '<button class="btn" id="recApplyRange">Apply to Range</button></div>';

    html += '<div class="table-wrap mt"><table><thead><tr><th>Date</th><th>Day</th>' +
      '<th>Decision</th><th>HR User</th><th>Recorded</th><th>Action</th></tr></thead><tbody>';
    info.eligibleDates.forEach(function (d) {
      var dec = Store.reconciliationFor(emp.empId, d);
      html += '<tr><td>' + U.fmt(d) + '</td><td>' + U.esc(U.dayName(d)) + '</td>' +
        '<td>' + (dec ? badgeForStatus(dec.status) : '<span class="badge flag">Pending Review</span>') + '</td>' +
        '<td>' + U.esc(dec ? dec.user : '—') + '</td>' +
        '<td class="muted small">' + (dec ? new Date(dec.createdAt).toLocaleString('en-IN') : '—') + '</td>' +
        '<td><button class="btn small secondary" data-single="' + d + '">Set status</button></td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<p class="muted small mt">Dates before the joining date are excluded automatically. ' +
      'Verified attendance is never overwritten without confirmation.</p></div>';
    box.innerHTML = html;
    renderReconciliationHistory(box, emp.empId);

    $('#recApplyRange').addEventListener('click', function () {
      var from = $('#recFrom').value, to = $('#recTo').value, status = $('#recStatus').value;
      var reason = $('#recReason').value.trim();
      if (!from || !to || from > to) { toast('Select a valid date range.', 'error'); return; }
      var dates = U.range(from, to).filter(function (d) { return d >= emp.doj && d < info.firstPunchDate; });
      if (!dates.length) { toast('No eligible dates in that range.', 'error'); return; }
      var existing = dates.filter(function (d) { return !!Store.reconciliationFor(emp.empId, d); });
      var msg = U.fmt(from) + '–' + U.fmt(to) + ': ' + status + '\n' + dates.length + ' date(s) will be set.';
      if (existing.length) msg += '\n\n' + existing.length + ' date(s) already have a decision and will be overwritten.';
      msg += '\n\nConfirm?';
      if (!confirm(msg)) return;
      Store.addReconciliation({ empId: emp.empId, dates: dates, from: from, to: to, status: status, reason: reason });
      toast(U.fmt(from) + '–' + U.fmt(to) + ': ' + status + ' applied to ' + dates.length + ' date(s).', 'ok');
      renderReconciliationOutput();
    });

    box.querySelectorAll('[data-single]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = b.getAttribute('data-single');
        var cur = Store.reconciliationFor(emp.empId, d);
        var html2 = '<div class="row tight">' +
          '<div><label>Date</label><input type="text" value="' + U.fmt(d) + '" disabled></div>' +
          '<div><label>Status</label><select id="singleStatus">' +
          A.MANUAL_STATUSES.map(function (s) {
            return '<option value="' + U.esc(s) + '"' + (cur && cur.status === s ? ' selected' : '') + '>' + U.esc(s) + '</option>';
          }).join('') + '</select></div></div>' +
          '<div class="mt"><label>Reason</label><input id="singleReason" type="text" value="' +
          U.esc(cur ? cur.reason : '') + '" placeholder="Reason for decision"></div>' +
          '<div class="row mt"><button class="btn" id="singleSave">Save</button></div>';
        openModal('Set attendance status — ' + U.fmt(d), html2);
        $('#singleSave').addEventListener('click', function () {
          Store.addReconciliation({ empId: emp.empId, dates: [d], status: $('#singleStatus').value, reason: $('#singleReason').value.trim() });
          closeModal();
          toast('Status saved for ' + U.fmt(d) + '.', 'ok');
          renderReconciliationOutput();
        });
      });
    });
  }

  function renderReconciliationHistory(box, empId) {
    var list = Store.listReconciliations(empId);
    var html = '<div class="card"><h3>HR Decision History</h3>';
    if (!list.length) html += '<div class="empty">No decisions recorded.</div>';
    else {
      html += '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Status</th>' +
        '<th>Reason</th><th>HR User</th><th>Recorded</th></tr></thead><tbody>';
      list.forEach(function (r) {
        html += '<tr><td>' + U.fmt(r.date) + '</td><td>' + badgeForStatus(r.status) + '</td>' +
          '<td>' + U.esc(r.reason || '—') + '</td><td>' + U.esc(r.user) + '</td>' +
          '<td class="muted small">' + new Date(r.createdAt).toLocaleString('en-IN') + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';
    box.insertAdjacentHTML('beforeend', html);
  }

  /* =====================================================================
   * Holidays & Weekly Offs
   * ================================================================== */
  var editingHolidayId = null;

  function renderHolidays() {
    var settings = Store.getSettings();
    var html = '<div class="card"><h3>Weekly Off Configuration</h3>' +
      '<p class="card-sub">Weekly offs are paid by default and are not counted as additional worked days.</p>' +
      '<div class="row tight">';
    for (var i = 0; i < 7; i++) {
      html += '<label class="checkline"><input type="checkbox" data-wo="' + i + '"' +
        (settings.weeklyOffDays.indexOf(i) !== -1 ? ' checked' : '') + '> ' + U.DAYS[i] + '</label>';
    }
    html += '<button class="btn small" id="woSave">Save Weekly Offs</button></div></div>';

    html += '<div class="card"><h3>Holiday Management</h3>' +
      '<p class="card-sub">Only holidays entered and marked as paid here are paid. Dates not in this list are never treated as company holidays.</p>' +
      '<form id="holForm"><div class="grid cols-4">' +
      '<div><label>Holiday Date *</label><input name="date" type="date" required></div>' +
      '<div><label>Holiday Name / Description *</label><input name="name" type="text" placeholder="e.g. Independence Day"></div>' +
      '<div><label>Paid Holiday</label><select name="paid"><option value="yes">Yes — Paid</option><option value="no">No — Unpaid</option></select></div>' +
      '<div><label>HR Remarks</label><input name="remarks" type="text" placeholder="Optional"></div>' +
      '</div><div class="row mt"><button class="btn" type="submit" id="holSubmit">Add Holiday</button>' +
      '<button class="btn secondary" type="button" id="holCancel" hidden>Cancel Edit</button></div></form>' +
      '<div id="holList" class="mt"></div></div>';

    html += '<div class="card"><h3>Verify Approved Holiday List Before Salary Processing</h3>' +
      '<p class="card-sub">HR must review and confirm the holiday list for the selected salary cycle before payroll can be finalized.</p>' +
      '<div class="row tight"><div style="min-width:280px"><label>Salary Cycle</label><select id="holCycle">' +
      cycleSelectOptions(state.cycleLabel) + '</select></div>' +
      '<button class="btn secondary" id="holReview">Review Holidays in Cycle</button>' +
      '<button class="btn" id="holConfirm">Confirm Holiday List</button>' +
      '<button class="btn secondary" id="holUnconfirm">Clear Confirmation</button></div>' +
      '<div id="holReviewOut" class="mt"></div></div>';

    view().innerHTML = html;

    $('#woSave').addEventListener('click', function () {
      var days = [];
      document.querySelectorAll('[data-wo]').forEach(function (cb) { if (cb.checked) days.push(Number(cb.getAttribute('data-wo'))); });
      Store.updateSettings({ weeklyOffDays: days });
      toast('Weekly offs saved.', 'ok');
      render();
    });

    var holForm = $('#holForm');
    holForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var data = {
        date: holForm.date.value, name: holForm.name.value.trim(),
        paid: holForm.paid.value === 'yes', remarks: holForm.remarks.value.trim()
      };
      if (!data.date || !data.name) { toast('Holiday date and name are required.', 'error'); return; }
      if (editingHolidayId) {
        Store.updateHoliday(editingHolidayId, data);
        toast('Holiday updated.', 'ok');
        editingHolidayId = null;
        $('#holSubmit').textContent = 'Add Holiday';
        $('#holCancel').hidden = true;
      } else {
        Store.addHoliday(data);
        toast('Holiday added.', 'ok');
      }
      holForm.reset();
      renderHolidayList();
      renderHolidayReview();
    });
    $('#holCancel').addEventListener('click', function () {
      editingHolidayId = null; holForm.reset();
      $('#holSubmit').textContent = 'Add Holiday'; $('#holCancel').hidden = true;
    });
    $('#holReview').addEventListener('click', function () { state.cycleLabel = $('#holCycle').value; renderHolidayReview(); });
    $('#holConfirm').addEventListener('click', function () {
      var label = $('#holCycle').value;
      var c = S.cycleFor(label);
      var hs = Store.holidaysInRange(c.start, c.end);
      if (!confirm('Confirm ' + hs.length + ' approved holiday(s) for ' + U.fmtMonth(label) +
        ' (' + U.fmt(c.start) + ' – ' + U.fmt(c.end) + ')?\n\nThis unlocks payroll finalization for this cycle.')) return;
      Store.confirmHolidayList(label, true);
      toast('Holiday list confirmed for ' + U.fmtMonth(label) + '.', 'ok');
      renderHolidayReview();
    });
    $('#holUnconfirm').addEventListener('click', function () {
      var label = $('#holCycle').value;
      Store.confirmHolidayList(label, false);
      toast('Confirmation cleared for ' + U.fmtMonth(label) + '.', 'ok');
      renderHolidayReview();
    });

    window._editHoliday = function (id) {
      var h = Store.listHolidays().find(function (x) { return x.id === id; });
      if (!h) return;
      editingHolidayId = id;
      holForm.date.value = h.date; holForm.name.value = h.name;
      holForm.paid.value = h.paid ? 'yes' : 'no'; holForm.remarks.value = h.remarks || '';
      $('#holSubmit').textContent = 'Save Holiday';
      $('#holCancel').hidden = false;
      window.scrollTo({ top: 0 });
    };

    renderHolidayList();
    renderHolidayReview();
  }

  function renderHolidayList() {
    var list = Store.listHolidays();
    var box = $('#holList');
    if (!box) return;
    if (!list.length) { box.innerHTML = '<div class="empty">No holidays entered.</div>'; return; }
    var html = '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Day</th>' +
      '<th>Holiday</th><th>Paid</th><th>Remarks</th><th>Actions</th></tr></thead><tbody>';
    list.forEach(function (h) {
      html += '<tr><td>' + U.fmt(h.date) + '</td><td>' + U.esc(U.dayName(h.date)) + '</td>' +
        '<td>' + U.esc(h.name) + '</td>' +
        '<td>' + (h.paid ? '<span class="badge ok">Paid</span>' : '<span class="badge">Unpaid</span>') + '</td>' +
        '<td>' + U.esc(h.remarks || '—') + '</td>' +
        '<td><button class="btn small secondary" data-hedit="' + h.id + '">Edit</button> ' +
        '<button class="btn small danger" data-hdel="' + h.id + '">Delete</button></td></tr>';
    });
    html += '</tbody></table></div>';
    box.innerHTML = html;
    box.querySelectorAll('[data-hedit]').forEach(function (b) {
      b.addEventListener('click', function () { window._editHoliday(b.getAttribute('data-hedit')); });
    });
    box.querySelectorAll('[data-hdel]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Delete this holiday entry?')) return;
        Store.deleteHoliday(b.getAttribute('data-hdel'));
        toast('Holiday deleted.', 'ok');
        renderHolidayList(); renderHolidayReview();
      });
    });
  }

  function renderHolidayReview() {
    var box = $('#holReviewOut');
    if (!box) return;
    var label = ($('#holCycle') && $('#holCycle').value) || state.cycleLabel;
    var c = S.cycleFor(label);
    var hs = Store.holidaysInRange(c.start, c.end);
    var confirmed = Store.isHolidayListConfirmed(label);

    var html = notice(confirmed ? 'ok' : 'warn',
      'Salary cycle <b>' + U.fmtMonth(label) + '</b>: ' + U.fmt(c.start) + ' – ' + U.fmt(c.end) + '. ' +
      'Approved holidays found: <b>' + hs.length + '</b>. ' +
      (confirmed ? 'Holiday list <b>confirmed</b>.' : 'Holiday list <b>not yet confirmed</b> — payroll finalization is blocked.'));

    if (hs.length) {
      html += '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Holiday</th>' +
        '<th>Paid</th><th>Falls on Weekly Off</th></tr></thead><tbody>';
      hs.forEach(function (h) {
        html += '<tr><td>' + U.fmt(h.date) + '</td><td>' + U.esc(h.name) + '</td>' +
          '<td>' + (h.paid ? '<span class="badge ok">Paid</span>' : '<span class="badge">Unpaid</span>') + '</td>' +
          '<td>' + (A.isWeeklyOff(h.date, Store.getSettings())
            ? '<span class="badge off">Yes — counted once, no double deduction</span>' : '—') + '</td></tr>';
      });
      html += '</tbody></table></div>';
    } else {
      html += '<div class="empty">No approved holidays in this cycle.</div>';
    }
    box.innerHTML = html;
  }

  /* =====================================================================
   * Salary Processing
   * ================================================================== */
  function renderSalary() {
    var html = '<div class="card"><h3>Salary Cycle</h3>' +
      '<p class="card-sub">The cycle runs from the 21st of the previous month to the 20th of the selected month, inclusive. ' +
      'The most recent completed cycle is selected by default. The report download date is never used as the cycle end date.</p>' +
      '<div class="row tight">' +
      '<div style="min-width:320px"><label>Salary Cycle</label><select id="salCycle">' +
      cycleSelectOptions(state.cycleLabel) + '</select></div>' +
      '<button class="btn secondary" id="salUseLatest">Use Latest Completed Cycle</button>' +
      '<div class="spacer"></div><span class="pill" id="salStatusPill"></span>' +
      '</div><div id="salHolidayCheck" class="mt"></div></div>';

    html += '<div class="card"><div class="row tight">' +
      '<div style="flex:1;min-width:220px"><label>Employee Search</label>' +
      '<input id="salSearch" type="text" placeholder="Search by name or ID…" value="' + U.esc(state.empSearch) + '"></div>' +
      '<button class="btn secondary" id="salSelectAll">Select All</button>' +
      '<button class="btn secondary" id="salSelectNone">Clear Selection</button>' +
      '</div><div id="salEmpList" class="mt"></div></div>';

    html += '<div class="card"><h3>Actions</h3><div class="row tight">' +
      '<button class="btn secondary" id="salPreview">Preview Salary</button>' +
      '<button class="btn secondary" id="salExceptions">Review Attendance Exceptions</button>' +
      '<button class="btn" id="salCalculate">Calculate Salary</button>' +
      '<button class="btn" id="salFinalize">Approve and Finalize Payroll</button>' +
      '<button class="btn secondary" id="salReopen">Reopen Payroll</button>' +
      '</div><div id="salActionOut" class="mt"></div></div>';

    html += '<div id="salOut"></div>';
    view().innerHTML = html;

    $('#salCycle').addEventListener('change', function () { state.cycleLabel = this.value; render(); });
    $('#salUseLatest').addEventListener('click', function () { state.cycleLabel = U.cycleLabelForDate(U.todayKey()); render(); });
    $('#salSearch').addEventListener('input', function () { state.empSearch = this.value; renderSalaryEmpList(); });
    $('#salSelectAll').addEventListener('click', function () { visibleEmployees().forEach(function (e) { state.selected[e.empId] = true; }); renderSalaryEmpList(); });
    $('#salSelectNone').addEventListener('click', function () { state.selected = {}; renderSalaryEmpList(); });
    $('#salPreview').addEventListener('click', function () { doCalculate('preview'); });
    $('#salExceptions').addEventListener('click', showExceptions);
    $('#salCalculate').addEventListener('click', function () { doCalculate('calculate'); });
    $('#salFinalize').addEventListener('click', doFinalize);
    $('#salReopen').addEventListener('click', doReopen);

    renderHolidayCheck();
    renderSalaryEmpList();
    renderSalaryOutput();
    updateSalaryStatusPill();
  }

  function updateSalaryStatusPill() {
    var p = $('#salStatusPill');
    if (!p) return;
    p.textContent = 'Payroll: ' + S.payrollStatus(state.cycleLabel);
  }

  function renderHolidayCheck() {
    var box = $('#salHolidayCheck');
    if (!box) return;
    var c = currentCycle();
    var hs = Store.holidaysInRange(c.start, c.end);
    var confirmed = Store.isHolidayListConfirmed(c.label);
    box.innerHTML = notice(confirmed ? 'ok' : 'warn',
      '<b>Approved holiday dates for ' + U.fmtMonth(c.label) + '</b> (' + U.fmt(c.start) + ' – ' + U.fmt(c.end) + '): ' +
      (hs.length ? hs.map(function (h) {
        return U.fmt(h.date) + ' — ' + U.esc(h.name) + ' (' + (h.paid ? 'Paid' : 'Unpaid') + ')';
      }).join('; ') : 'none') +
      '<br>Status: ' + (confirmed ? '<b>Reviewed and confirmed by HR</b>.' :
        '<b>Not confirmed</b> — confirm the holiday list in <b>Holiday &amp; Weekly Off</b> before finalizing payroll.'));
  }

  function visibleEmployees() {
    var q = state.empSearch.trim().toLowerCase();
    return Store.listEmployees().filter(function (e) {
      if (!q) return true;
      return e.name.toLowerCase().indexOf(q) !== -1 || e.empId.toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderSalaryEmpList() {
    var box = $('#salEmpList');
    if (!box) return;
    var emps = visibleEmployees();
    if (!emps.length) { box.innerHTML = '<div class="empty">No employees found.</div>'; return; }
    var c = currentCycle();
    var html = '<div class="table-wrap"><table><thead><tr>' +
      '<th style="width:36px"></th><th>Employee ID</th><th>Name</th>' +
      '<th class="num">Monthly Salary</th><th>Date of Joining</th><th>Status</th>' +
      '<th>Attendance Check</th></tr></thead><tbody>';
    emps.forEach(function (e) {
      var an = A.analyzeCycle(e, c);
      var unresolved = an.summary.pendingReview + A.reconciliationInfo(e, { start: c.start, end: c.end }).unresolvedDates.length;
      var check = unresolved ? '<span class="badge flag">' + unresolved + ' unresolved</span>' : '<span class="badge ok">Clear</span>';
      html += '<tr><td><input type="checkbox" data-pick="' + U.esc(e.empId) + '"' +
        (state.selected[e.empId] ? ' checked' : '') + '></td>' +
        '<td class="strong">' + U.esc(e.empId) + '</td>' +
        '<td>' + U.esc(e.name) + '</td>' +
        '<td class="num">' + U.money(e.monthlySalary) + '</td>' +
        '<td>' + U.fmt(e.doj) + '</td>' +
        '<td>' + (e.status === 'Active' ? '<span class="badge ok">Active</span>' : '<span class="badge">Inactive</span>') + '</td>' +
        '<td>' + check + '</td></tr>';
    });
    html += '</tbody></table></div>';
    box.innerHTML = html;
    box.querySelectorAll('[data-pick]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var id = cb.getAttribute('data-pick');
        if (cb.checked) state.selected[id] = true; else delete state.selected[id];
      });
    });
  }

  function selectedIds() {
    return Object.keys(state.selected).filter(function (k) { return state.selected[k]; });
  }

  function doCalculate(mode) {
    var ids = selectedIds();
    if (!ids.length) { toast('Select at least one employee.', 'error'); return; }
    var c = currentCycle();
    state.rows = S.computeRows(ids, c);
    renderSalaryOutput();
    toast((mode === 'preview' ? 'Preview ready for ' : 'Salary calculated for ') + ids.length + ' employee(s).', 'ok');
  }

  function validationBlock(v) {
    var html = '<div class="small">';
    (v.errors || []).forEach(function (e) { html += '<div style="color:var(--red)">• ' + U.esc(e) + '</div>'; });
    (v.warnings || []).forEach(function (w) { html += '<div style="color:var(--amber)">• ' + U.esc(w) + '</div>'; });
    html += '</div>';
    return html;
  }

  function renderSalaryOutput() {
    var box = $('#salOut');
    if (!box) return;
    var c = currentCycle();
    var frozen = S.frozenRows(c.label);
    var rows = frozen || state.rows;
    if (!rows || !rows.length) {
      box.innerHTML = '<div class="card"><div class="empty">Select employees and use <b>Preview Salary</b> or <b>Calculate Salary</b>.</div></div>';
      return;
    }
    var html = '';
    if (frozen) {
      html += notice('ok', 'Payroll for ' + U.fmtMonth(c.label) + ' is <b>finalized</b> (' +
        new Date(Store.getPayroll(c.label).finalizedAt).toLocaleString('en-IN') + '). Showing frozen figures. ' +
        'Reopen with a reason to recalculate.');
    }
    var total = rows.reduce(function (a, r) { return a + r.finalPayable; }, 0);
    html += '<div class="card"><h3>Salary Calculation — ' + U.fmtMonth(c.label) + '</h3>' +
      '<p class="card-sub">Daily Salary = Monthly Salary ÷ ' + (rows[0] ? rows[0].calendarDays : '—') + ' calendar days in the cycle.</p>';
    html += '<div class="table-wrap"><table><thead><tr>' +
      '<th>Employee</th><th class="num">Monthly Salary</th><th>Cycle</th>' +
      '<th class="num">Eligible Days</th><th class="num">Full</th><th class="num">Half</th>' +
      '<th class="num">Absent</th><th class="num">Paid W/Off</th><th class="num">Paid Hol.</th>' +
      '<th class="num">Unpaid</th><th class="num">Late</th><th class="num">Short</th>' +
      '<th class="num">Penalty (days)</th><th class="num">Add. Ded.</th>' +
      '<th class="num">Final Payable</th><th>Validation</th><th>Breakdown</th></tr></thead><tbody>';
    rows.forEach(function (r, i) {
      var v = r.validation || { ok: true, errors: [], warnings: [] };
      html += '<tr>' +
        '<td>' + U.esc(r.name) + ' <span class="muted small">' + U.esc(r.empId) + '</span></td>' +
        '<td class="num">' + U.money(r.monthlySalary) + '</td>' +
        '<td class="nowrap">' + U.fmt(r.cycleStart) + ' – ' + U.fmt(r.cycleEnd) + '</td>' +
        '<td class="num">' + r.eligibleEmploymentDays + '</td>' +
        '<td class="num">' + r.fullDays + '</td>' +
        '<td class="num">' + r.halfDays + '</td>' +
        '<td class="num">' + r.absences + '</td>' +
        '<td class="num">' + r.paidWeeklyOffs + '</td>' +
        '<td class="num">' + r.paidHolidays + '</td>' +
        '<td class="num">' + r.unpaidDays + '</td>' +
        '<td class="num">' + r.lateCount + '</td>' +
        '<td class="num">' + r.shortHoursCount + '</td>' +
        '<td class="num">' + r.penaltyDays.toFixed(2) + '</td>' +
        '<td class="num">' + U.money(r.additionalDeductions) + '</td>' +
        '<td class="num strong">' + U.money(r.finalPayable) + '</td>' +
        '<td>' + (v.ok ? '<span class="badge ok">OK</span>' : '<span class="badge flag">' + v.errors.length + ' issue(s)</span>') + '</td>' +
        '<td><button class="btn small secondary" data-breakdown="' + i + '">View</button></td></tr>';
      if (!v.ok || (v.warnings && v.warnings.length)) {
        html += '<tr><td colspan="17" style="background:var(--bg-2)">' + validationBlock(v) + '</td></tr>';
      }
    });
    html += '</tbody><tfoot><tr><td colspan="14">Total Final Payable</td><td class="num">' +
      U.money(total) + '</td><td colspan="2"></td></tr></tfoot></table></div>';
    html += '<div class="row mt"><button class="btn secondary" id="salExcel">Download Excel (first employee)</button>' +
      '<button class="btn secondary" id="salPdf">Download PDF (first employee)</button>' +
      '<button class="btn" id="salZip">Download All Reports (ZIP)</button></div>';
    html += '</div>';
    box.innerHTML = html;

    box.querySelectorAll('[data-breakdown]').forEach(function (b) {
      b.addEventListener('click', function () { showBreakdown(rows[Number(b.getAttribute('data-breakdown'))]); });
    });
    $('#salExcel').addEventListener('click', function () {
      R.downloadRowExcel(rows[0]); toast('Excel report generated for ' + rows[0].empId + '.', 'ok');
    });
    $('#salPdf').addEventListener('click', function () {
      R.downloadRowPdf(rows[0]); toast('PDF report generated for ' + rows[0].empId + '.', 'ok');
    });
    $('#salZip').addEventListener('click', function () { downloadZip(rows); });
  }

  function downloadZip(rows) {
    if (!rows.length) { toast('Nothing to download.', 'error'); return; }
    toast('Building ZIP with ' + rows.length + ' report(s)…');
    R.downloadAllZip(rows).then(function () {
      toast('Salary_Reports.zip downloaded (' + rows.length + ' employee(s)).', 'ok');
    }).catch(function (e) {
      console.error(e);
      toast('Failed to build ZIP: ' + e.message, 'error');
    });
  }

  function showBreakdown(row) {
    if (!row) return;
    var html = '<div class="row tight mb">' +
      '<span class="pill">' + U.esc(row.empId) + ' — ' + U.esc(row.name) + '</span>' +
      '<span class="pill">' + U.fmtMonth(row.cycleLabel) + '</span>' +
      '<span class="pill">Daily = ' + U.money(row.divisor ? row.monthlySalary / row.divisor : 0) + '</span>' +
      '</div>';
    html += '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Day</th><th>Status</th>' +
      '<th>In</th><th>Out</th><th class="num">Worked</th><th>Late</th><th>Short</th>' +
      '<th class="num">Penalty</th><th class="num">Day Value</th><th class="num">Daily Salary</th>' +
      '<th class="num">Amount</th><th>Note</th></tr></thead><tbody>';
    row.breakdown.forEach(function (d) {
      html += '<tr>' +
        '<td>' + U.fmt(d.date) + '</td>' +
        '<td>' + U.esc(d.dayName) + '</td>' +
        '<td>' + badgeForStatus(d.status) + '</td>' +
        '<td>' + (d.punchIn || '—') + '</td><td>' + (d.punchOut || '—') + '</td>' +
        '<td class="num">' + d.workedHours.toFixed(2) + '</td>' +
        '<td>' + (d.late ? '<span class="badge flag">Y</span>' : '—') + '</td>' +
        '<td>' + (d.shortHours ? '<span class="badge flag">Y</span>' : '—') + '</td>' +
        '<td class="num">' + d.penaltyDays.toFixed(2) + '</td>' +
        '<td class="num">' + d.finalValue.toFixed(2) + '</td>' +
        '<td class="num">' + U.money(d.dailySalary) + '</td>' +
        '<td class="num">' + U.money(d.amount) + '</td>' +
        '<td class="muted small">' + U.esc(d.note || '') + '</td></tr>';
    });
    html += '</tbody><tfoot><tr><td colspan="11">Gross Payable</td>' +
      '<td class="num">' + U.money(row.grossPayable) + '</td><td></td></tr>' +
      '<tr><td colspan="11">Additional Deductions</td><td class="num">' + U.money(row.additionalDeductions) + '</td><td></td></tr>' +
      '<tr><td colspan="11">Final Payable Salary</td><td class="num">' + U.money(row.finalPayable) + '</td><td></td></tr>' +
      '</tfoot></table></div>';
    openModal('Date-wise Calculation Breakdown', html);
  }

  function showExceptions() {
    var ids = selectedIds();
    if (!ids.length) { toast('Select at least one employee.', 'error'); return; }
    var c = currentCycle();
    var list = S.exceptions(ids, c);
    var box = $('#salActionOut');
    if (!list.length) {
      box.innerHTML = notice('ok', 'No attendance exceptions for the selected employee(s) in ' + U.fmtMonth(c.label) + '.');
      return;
    }
    var html = notice('warn', 'Attendance exceptions must be resolved before payroll can be finalized.');
    html += '<div class="table-wrap"><table><thead><tr><th>Employee</th><th>Issues</th></tr></thead><tbody>';
    list.forEach(function (e) {
      html += '<tr><td>' + U.esc(e.empId) + ' <span class="muted small">' + U.esc(e.name) + '</span></td>' +
        '<td>' + e.issues.map(function (i) { return '<div class="small">• ' + U.esc(i) + '</div>'; }).join('') + '</td></tr>';
    });
    html += '</tbody></table></div>';
    box.innerHTML = html;
  }

  function doFinalize() {
    var ids = selectedIds();
    if (!ids.length) { toast('Select at least one employee.', 'error'); return; }
    var c = currentCycle();
    var rows = S.computeRows(ids, c);
    state.rows = rows;
    renderSalaryOutput();

    var invalid = rows.filter(function (r) { return !r.validated; });
    if (invalid.length) {
      var box = $('#salActionOut');
      box.innerHTML = notice('error', 'Payroll cannot be finalized: ' + invalid.length +
        ' employee(s) have unresolved attendance or validation issues.') +
        '<div class="table-wrap"><table><thead><tr><th>Employee</th><th>Blocking Issues</th></tr></thead><tbody>' +
        invalid.map(function (r) {
          return '<tr><td>' + U.esc(r.empId) + '</td><td>' +
            (r.validation.errors || []).map(function (e) { return '<div class="small" style="color:var(--red)">• ' + U.esc(e) + '</div>'; }).join('') +
            '</td></tr>';
        }).join('') + '</tbody></table></div>';
      toast('Payroll finalization blocked by unresolved attendance.', 'error');
      return;
    }

    var total = rows.reduce(function (a, r) { return a + r.finalPayable; }, 0);
    if (!confirm('Finalize payroll for ' + rows.length + ' employee(s) in ' + U.fmtMonth(c.label) +
      '?\n\nTotal final payable: ' + U.money(total) +
      '\n\nOnce finalized, payroll stays unchanged unless reopened with a reason.')) return;

    var res = S.finalize(rows, c.label);
    if (!res.ok) { toast('Finalization failed.', 'error'); return; }
    $('#salActionOut').innerHTML = notice('ok', 'Payroll finalized for ' + U.fmtMonth(c.label) +
      ' at ' + new Date().toLocaleString('en-IN') + '. Reports are now based on frozen figures.');
    toast('Payroll finalized for ' + U.fmtMonth(c.label) + '.', 'ok');
    updateSalaryStatusPill();
    renderSalaryOutput();
  }

  function doReopen() {
    var c = currentCycle();
    var p = Store.getPayroll(c.label);
    if (!p || p.status !== 'Finalized') { toast('Payroll is not finalized for ' + U.fmtMonth(c.label) + '.', 'error'); return; }
    var reason = prompt('Reason for reopening payroll for ' + U.fmtMonth(c.label) + ':');
    if (!reason || !reason.trim()) { toast('A reason is required to reopen payroll.', 'error'); return; }
    Store.reopenPayroll(c.label, reason.trim());
    toast('Payroll reopened for ' + U.fmtMonth(c.label) + '. Recalculate before finalizing again.', 'ok');
    updateSalaryStatusPill();
    renderSalaryOutput();
  }

  /* =====================================================================
   * Reports
   * ================================================================== */
  function renderReports() {
    var html = '<div class="card"><h3>Bulk Reports — Excel, PDF and ZIP</h3>' +
      '<p class="card-sub">Generates a real .xlsx workbook and .pdf report per selected employee, bundled into Salary_Reports.zip ' +
      'with Excel/ and PDF/ folders. Reports use frozen figures when the cycle is finalized, otherwise the current calculation.</p>' +
      '<div class="row tight">' +
      '<div style="min-width:320px"><label>Salary Cycle</label><select id="repCycle">' +
      cycleSelectOptions(state.cycleLabel) + '</select></div>' +
      '<button class="btn secondary" id="repSelectAll">Select All</button>' +
      '<button class="btn secondary" id="repSelectNone">Clear</button>' +
      '</div><div id="repList" class="mt"></div>' +
      '<div class="row mt"><button class="btn" id="repCalculate">Calculate / Refresh</button>' +
      '<button class="btn" id="repZip">Download All Reports (ZIP)</button></div>' +
      '<div id="repOut" class="mt"></div></div>';
    view().innerHTML = html;

    $('#repCycle').addEventListener('change', function () { state.cycleLabel = this.value; state.rows = []; renderReports(); });
    $('#repSelectAll').addEventListener('click', function () {
      Store.listEmployees().forEach(function (e) { state.selected[e.empId] = true; });
      renderReportsEmpList();
    });
    $('#repSelectNone').addEventListener('click', function () { state.selected = {}; renderReportsEmpList(); });
    $('#repCalculate').addEventListener('click', function () {
      var ids = selectedIds();
      if (!ids.length) { toast('Select at least one employee.', 'error'); return; }
      state.rows = S.computeRows(ids, currentCycle());
      renderReportsOutput();
      toast('Reports prepared for ' + ids.length + ' employee(s).', 'ok');
    });
    $('#repZip').addEventListener('click', function () {
      var rows = rowsForReports();
      if (!rows.length) { toast('Prepare reports first (select employees, then Calculate / Refresh).', 'error'); return; }
      downloadZip(rows);
    });
    renderReportsEmpList();
    renderReportsOutput();
  }

  function rowsForReports() {
    var c = currentCycle();
    var frozen = S.frozenRows(c.label);
    if (frozen) return frozen.filter(function (r) { return state.selected[r.empId]; });
    return state.rows;
  }

  function renderReportsEmpList() {
    var box = $('#repList');
    if (!box) return;
    var emps = Store.listEmployees();
    if (!emps.length) { box.innerHTML = '<div class="empty">No employees.</div>'; return; }
    var html = '<div class="table-wrap"><table><thead><tr><th style="width:36px"></th>' +
      '<th>Employee ID</th><th>Name</th><th>Status</th></tr></thead><tbody>';
    emps.forEach(function (e) {
      html += '<tr><td><input type="checkbox" data-rep-pick="' + U.esc(e.empId) + '"' +
        (state.selected[e.empId] ? ' checked' : '') + '></td>' +
        '<td>' + U.esc(e.empId) + '</td><td>' + U.esc(e.name) + '</td>' +
        '<td>' + (e.status === 'Active' ? '<span class="badge ok">Active</span>' : '<span class="badge">Inactive</span>') + '</td></tr>';
    });
    html += '</tbody></table></div>';
    box.innerHTML = html;
    box.querySelectorAll('[data-rep-pick]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var id = cb.getAttribute('data-rep-pick');
        if (cb.checked) state.selected[id] = true; else delete state.selected[id];
      });
    });
  }

  function renderReportsOutput() {
    var box = $('#repOut');
    if (!box) return;
    var rows = rowsForReports();
    if (!rows.length) { box.innerHTML = '<div class="empty">No prepared reports. Select employees and click Calculate / Refresh.</div>'; return; }
    var html = '<div class="table-wrap"><table><thead><tr><th>Employee</th><th>Cycle</th>' +
      '<th class="num">Final Payable</th><th>Excel</th><th>PDF</th></tr></thead><tbody>';
    rows.forEach(function (r, i) {
      html += '<tr><td>' + U.esc(r.empId) + ' <span class="muted small">' + U.esc(r.name) + '</span></td>' +
        '<td>' + U.fmt(r.cycleStart) + ' – ' + U.fmt(r.cycleEnd) + '</td>' +
        '<td class="num">' + U.money(r.finalPayable) + '</td>' +
        '<td><button class="btn small secondary" data-rex="' + i + '">XLSX</button></td>' +
        '<td><button class="btn small secondary" data-rpdf="' + i + '">PDF</button></td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<p class="muted small mt">ZIP structure: Salary_Reports/Excel/EMP001_Salary_Report.xlsx and Salary_Reports/PDF/EMP001_Salary_Report.pdf</p>';
    box.innerHTML = html;
    box.querySelectorAll('[data-rex]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = rows[Number(b.getAttribute('data-rex'))];
        R.downloadRowExcel(r); toast('Excel generated for ' + r.empId + '.', 'ok');
      });
    });
    box.querySelectorAll('[data-rpdf]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = rows[Number(b.getAttribute('data-rpdf'))];
        R.downloadRowPdf(r); toast('PDF generated for ' + r.empId + '.', 'ok');
      });
    });
  }

  /* =====================================================================
   * Settings
   * ================================================================== */
  function renderSettings() {
    var s = Store.getSettings();
    var html = '<div class="card"><h3>Company &amp; Shift</h3>' +
      '<div class="grid cols-3">' +
      '<div><label>Company Name</label><input id="setCompany" type="text" value="' + U.esc(s.companyName) + '"></div>' +
      '<div><label>HR User</label><input id="setUser" type="text" value="' + U.esc(s.hrUser) + '"></div>' +
      '<div><label>Required Hours / Day</label><input id="setHours" type="number" step="0.5" value="' + s.requiredHours + '"></div>' +
      '<div><label>Shift Start</label><input id="setStart" type="time" value="' + s.shiftStart + '"></div>' +
      '<div><label>Shift End</label><input id="setEnd" type="time" value="' + s.shiftEnd + '"></div>' +
      '<div><label>Break Deduction (minutes)</label><input id="setBreak" type="number" value="' + s.breakMinutes + '"></div>' +
      '<div><label>Late Grace (minutes)</label><input id="setGrace" type="number" value="' + s.lateGraceMinutes + '"></div>' +
      '<div><label>Free Late Arrivals / Cycle</label><input id="setLateFree" type="number" value="' + s.lateFreeLimit + '"></div>' +
      '<div><label>Free Short-Hours Days / Cycle</label><input id="setShortFree" type="number" value="' + s.shortHoursFreeLimit + '"></div>' +
      '<div><label>Max Penalty per Date (days)</label><input id="setMaxPenalty" type="number" step="0.5" value="' + s.maxPenaltyDaysPerDate + '"></div>' +
      '</div><div class="row mt"><button class="btn" id="setSave">Save Settings</button></div>' +
      '<p class="muted small mt">Break deductions are zero by default. Late and short-hours penalties are capped at one half-day per date by default.</p></div>';

    html += '<div class="card"><h3>Additional Deductions</h3>' +
      '<p class="card-sub">Disabled by default. When enabled, the amount per employee is subtracted from gross payable.</p>' +
      '<label class="checkline"><input id="setAddEnabled" type="checkbox"' + (s.additionalDeductionsEnabled ? ' checked' : '') + '> Enable additional deductions</label>' +
      '<div id="addDedList" class="mt"></div>' +
      '<div class="row mt"><button class="btn secondary" id="setAddSave">Save Deductions</button></div></div>';

    html += '<div class="card"><h3>Data Backup &amp; Restore</h3>' +
      '<p class="card-sub">Prototype data is stored in this browser only. Export a backup before clearing site data.</p>' +
      '<div class="row tight"><button class="btn secondary" id="setExport">Export Backup (JSON)</button>' +
      '<label class="btn secondary" style="margin:0">Import Backup<input id="setImport" type="file" accept="application/json" hidden></label>' +
      '<button class="btn secondary" id="setDemo">Load Demo Data</button>' +
      '<button class="btn danger" id="setReset">Reset All Data</button></div>' +
      '<p class="muted small mt">For real HR use, use a secure backend database with authenticated HR access, ' +
      'role-based permissions and server-side audit logs. Browser storage alone is not secure multi-user payroll infrastructure.</p></div>';

    html += '<div class="card"><h3>Audit Log</h3><div id="auditList"></div></div>';

    view().innerHTML = html;

    $('#setSave').addEventListener('click', function () {
      Store.updateSettings({
        companyName: $('#setCompany').value.trim() || 'Company Name',
        hrUser: $('#setUser').value.trim() || 'HR',
        requiredHours: Number($('#setHours').value) || 9,
        shiftStart: $('#setStart').value || '10:00',
        shiftEnd: $('#setEnd').value || '19:00',
        breakMinutes: Number($('#setBreak').value) || 0,
        lateGraceMinutes: Number($('#setGrace').value) || 0,
        lateFreeLimit: Number($('#setLateFree').value) >= 0 ? Number($('#setLateFree').value) : 3,
        shortHoursFreeLimit: Number($('#setShortFree').value) >= 0 ? Number($('#setShortFree').value) : 3,
        maxPenaltyDaysPerDate: Number($('#setMaxPenalty').value) || 0.5
      });
      toast('Settings saved.', 'ok');
      render();
    });

    renderAdditionalDeductions();
    $('#setAddEnabled').addEventListener('change', function () {
      Store.updateSettings({ additionalDeductionsEnabled: this.checked });
      toast('Additional deductions ' + (this.checked ? 'enabled' : 'disabled') + '.', 'ok');
    });
    $('#setAddSave').addEventListener('click', function () {
      var map = {};
      document.querySelectorAll('[data-ded]').forEach(function (inp) {
        var v = Number(inp.value) || 0;
        if (v) map[inp.getAttribute('data-ded')] = v;
      });
      Store.updateSettings({ additionalDeductions: map });
      toast('Additional deductions saved.', 'ok');
    });

    $('#setExport').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(Store.exportBackup(), null, 2)], { type: 'application/json' });
      R.downloadBlob(blob, 'hr_backup_' + U.todayKey() + '.json');
      toast('Backup exported.', 'ok');
    });
    $('#setImport').addEventListener('change', function (ev) {
      var file = ev.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          Store.importBackup(JSON.parse(reader.result));
          toast('Backup imported.', 'ok');
          render();
        } catch (e) { toast('Import failed: ' + e.message, 'error'); }
      };
      reader.readAsText(file);
    });
    $('#setDemo').addEventListener('click', function () {
      if (!confirm('Load demo data? This adds sample employees, punches and holidays; existing data is kept.')) return;
      global.Demo.load(); toast('Demo data loaded.', 'ok'); render();
    });
    $('#setReset').addEventListener('click', function () {
      if (!confirm('Reset ALL data? This cannot be undone. Export a backup first if needed.')) return;
      Store.resetAll(); toast('All data reset.', 'ok'); render();
    });

    renderAuditList();
  }

  function renderAdditionalDeductions() {
    var box = $('#addDedList');
    if (!box) return;
    var s = Store.getSettings();
    var emps = Store.listEmployees();
    if (!emps.length) { box.innerHTML = '<div class="empty">No employees.</div>'; return; }
    var html = '<div class="table-wrap"><table><thead><tr><th>Employee</th><th class="num">Deduction (INR)</th></tr></thead><tbody>';
    emps.forEach(function (e) {
      html += '<tr><td>' + U.esc(e.empId) + ' <span class="muted small">' + U.esc(e.name) + '</span></td>' +
        '<td class="num"><input data-ded="' + U.esc(e.empId) + '" type="number" min="0" step="1" ' +
        'value="' + (s.additionalDeductions[e.empId] || 0) + '" style="max-width:140px;text-align:right"></td></tr>';
    });
    html += '</tbody></table></div>';
    box.innerHTML = html;
  }

  function renderAuditList() {
    var box = $('#auditList');
    if (!box) return;
    var log = Store.auditLog().slice(0, 100);
    if (!log.length) { box.innerHTML = '<div class="empty">No activity recorded.</div>'; return; }
    var html = '<div class="table-wrap"><table><thead><tr><th>When</th><th>User</th><th>Action</th><th>Details</th></tr></thead><tbody>';
    log.forEach(function (l) {
      html += '<tr><td class="muted small nowrap">' + new Date(l.at).toLocaleString('en-IN') + '</td>' +
        '<td>' + U.esc(l.user) + '</td><td>' + U.esc(l.action) + '</td><td>' + U.esc(l.details) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    box.innerHTML = html;
  }

  /* =====================================================================
   * Init
   * ================================================================== */
  function bindGlobal() {
    Array.prototype.forEach.call(document.querySelectorAll('.nav-item'), function (b) {
      b.addEventListener('click', function () { go(b.getAttribute('data-view')); });
    });
    $('#modalClose').addEventListener('click', closeModal);
    $('#modal').addEventListener('click', function (e) { if (e.target.id === 'modal') closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
  }

  global.App = {
    go: go,
    render: render,
    state: state,
    toast: toast,
    openModal: openModal,
    closeModal: closeModal
  };

  document.addEventListener('DOMContentLoaded', function () {
    bindGlobal();
    go('dashboard');
  });
})(window);
