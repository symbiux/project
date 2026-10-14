/* =============================================================================
 * reports.js — Real Excel (XLSX), PDF and ZIP report generation
 *
 * Libraries (bundled locally in /vendor):
 *   - SheetJS  (XLSX)          -> genuine .xlsx workbooks
 *   - jsPDF + AutoTable        -> genuine .pdf documents
 *   - JSZip                    -> genuine .zip archive
 *
 * ZIP structure:
 *   Salary_Reports/
 *     Excel/EMP001_Salary_Report.xlsx
 *     PDF/EMP001_Salary_Report.pdf
 * ========================================================================== */
(function (global) {
  'use strict';

  var U = global.Utils;

  function safeId(empId) {
    return String(empId).replace(/[^A-Za-z0-9_-]/g, '_');
  }

  function statusLabel(row) {
    var p = global.Store.getPayroll(row.cycleLabel);
    if (p && p.status === 'Finalized') return 'Finalized';
    if (p && p.status === 'Reopened') return 'Reopened (not final)';
    return 'Preview (not finalized)';
  }

  /* ---------------------------------------------------------------------
   * Excel workbook
   * ------------------------------------------------------------------ */
  function buildWorkbook(row) {
    var XLSX = global.XLSX;
    var status = statusLabel(row);
    var s = row.summary || {};

    var info = [
      ['Salary Report'],
      [],
      ['Employee Name', row.name, 'Employee ID', row.empId],
      ['Date of Joining', U.fmt(row.doj), 'Employment Status', row.status],
      ['Monthly Salary (INR)', row.monthlySalary, 'Calendar Days in Cycle', row.calendarDays],
      ['Salary Cycle', U.fmtMonth(row.cycleLabel), 'Cycle Start', U.fmt(row.cycleStart)],
      ['Cycle End', U.fmt(row.cycleEnd), 'Payroll Status', status],
      ['Report Generated', new Date().toLocaleString('en-IN')],
      []
    ];

    var summaryRows = [
      ['Salary Summary'],
      ['Metric', 'Value'],
      ['Eligible Employment Days', row.eligibleEmploymentDays],
      ['Full Days', row.fullDays],
      ['Half Days', row.halfDays],
      ['Absences', row.absences],
      ['Paid Weekly Offs', row.paidWeeklyOffs],
      ['Paid Holidays', row.paidHolidays],
      ['Unpaid Holidays', row.unpaidHolidays],
      ['Unpaid Days', row.unpaidDays],
      ['Pending Review Days', row.pendingReview],
      ['Late-Arrival Count', row.lateCount],
      ['Late Dates Penalised', row.penalisedLateCount],
      ['Short-Hours Count', row.shortHoursCount],
      ['Short-Hours Dates Penalised', row.penalisedShortCount],
      ['Penalty Days (total)', row.penaltyDays],
      ['Penalty Amount (INR)', row.penaltyAmount],
      ['Additional Deductions (INR)', row.additionalDeductions],
      ['Gross Payable (INR)', row.grossPayable],
      ['Final Payable Salary (INR)', row.finalPayable],
      []
    ];

    var detailHeader = ['Date', 'Day', 'Status', 'Punch In', 'Punch Out',
      'Worked (h)', 'Late', 'Short Hours', 'Penalty Days', 'Day Value',
      'Monthly Salary', 'Daily Salary', 'Amount (INR)', 'Note'];

    var detailRows = row.breakdown.map(function (d) {
      return [d.date, d.dayName, d.status, d.punchIn || '', d.punchOut || '',
        d.workedHours, d.late ? 'Yes' : '', d.shortHours ? 'Yes' : '',
        d.penaltyDays, d.finalValue, d.monthlySalary, d.dailySalary, d.amount, d.note];
    });

    var holidayRows = [
      ['Approved Holidays in Cycle'],
      ['Date', 'Holiday', 'Paid?'],
    ].concat(
      global.Store.holidaysInRange(row.cycleStart, row.cycleEnd).map(function (h) {
        return [h.date, h.name, h.paid ? 'Paid' : 'Unpaid'];
      })
    );

    var aoa = info
      .concat(summaryRows)
      .concat([['Date-wise Attendance & Calculation Breakdown'], detailHeader])
      .concat(detailRows)
      .concat([[]])
      .concat(holidayRows);

    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 13 }, { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 10 },
      { wch: 10 }, { wch: 7 }, { wch: 12 }, { wch: 13 }, { wch: 10 },
      { wch: 14 }, { wch: 13 }, { wch: 14 }, { wch: 34 }
    ];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Salary Report');
    return wb;
  }

  function workbookBlob(row) {
    var wb = buildWorkbook(row);
    var out = global.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  /* ---------------------------------------------------------------------
   * PDF document
   * ------------------------------------------------------------------ */
  function buildPdf(row) {
    var jsPDF = global.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    var status = statusLabel(row);
    var left = 40;

    doc.setFontSize(16);
    doc.text('Salary Report', left, 40);
    doc.setFontSize(10);
    doc.text('Generated: ' + new Date().toLocaleString('en-IN'), left, 58);

    doc.autoTable({
      startY: 70,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [37, 99, 235] },
      head: [['Employee Name', 'Employee ID', 'Date of Joining', 'Monthly Salary (INR)', 'Salary Cycle']],
      body: [[row.name, row.empId, U.fmt(row.doj), U.money(row.monthlySalary),
        U.fmt(row.cycleStart) + ' to ' + U.fmt(row.cycleEnd)]]
    });

    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 12,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [37, 99, 235] },
      head: [['Cycle', 'Status', 'Calendar Days', 'Full Days', 'Half Days',
        'Absences', 'Paid W/Offs', 'Paid Holidays', 'Unpaid Days',
        'Late', 'Short Hrs', 'Penalty Days']],
      body: [[U.fmtMonth(row.cycleLabel), status, row.calendarDays, row.fullDays,
        row.halfDays, row.absences, row.paidWeeklyOffs, row.paidHolidays,
        row.unpaidDays, row.lateCount, row.shortHoursCount, row.penaltyDays]]
    });

    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 12,
      theme: 'striped',
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235] },
      head: [['Date', 'Day', 'Status', 'In', 'Out', 'Worked (h)', 'Late',
        'Short', 'Penalty', 'Day Val', 'Daily (INR)', 'Amount (INR)', 'Note']],
      body: row.breakdown.map(function (d) {
        return [d.date, d.dayName, d.status, d.punchIn || '-', d.punchOut || '-',
          d.workedHours, d.late ? 'Y' : '', d.shortHours ? 'Y' : '',
          d.penaltyDays, d.finalValue, d.dailySalary.toFixed(2),
          d.amount.toFixed(2), d.note];
      })
    });

    var y = doc.lastAutoTable.finalY + 16;
    if (y > doc.internal.pageSize.getHeight() - 90) { doc.addPage(); y = 50; }

    doc.autoTable({
      startY: y,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [37, 99, 235] },
      head: [['Penalty Days', 'Penalty Amount (INR)', 'Additional Deductions (INR)',
        'Gross Payable (INR)', 'Final Payable Salary (INR)']],
      body: [[row.penaltyDays, U.money(row.penaltyAmount),
        U.money(row.additionalDeductions), U.money(row.grossPayable), U.money(row.finalPayable)]]
    });

    var holidays = global.Store.holidaysInRange(row.cycleStart, row.cycleEnd);
    if (holidays.length) {
      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 12,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 3 },
        headStyles: { fillColor: [37, 99, 235] },
        head: [['Approved Holiday', 'Date', 'Paid?']],
        body: holidays.map(function (h) { return [h.name, U.fmt(h.date), h.paid ? 'Paid' : 'Unpaid']; })
      });
    }
    return doc;
  }

  function pdfBlob(row) {
    return buildPdf(row).output('blob');
  }

  /* ---------------------------------------------------------------------
   * Download helpers
   * ------------------------------------------------------------------ */
  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function downloadRowExcel(row) {
    downloadBlob(workbookBlob(row), safeId(row.empId) + '_Salary_Report.xlsx');
  }

  function downloadRowPdf(row) {
    downloadBlob(pdfBlob(row), safeId(row.empId) + '_Salary_Report.pdf');
  }

  /** Builds Salary_Reports/{Excel,PDF} ZIP for all rows and downloads it. */
  function downloadAllZip(rows, onProgress) {
    var zip = new global.JSZip();
    var root = zip.folder('Salary_Reports');
    var excel = root.folder('Excel');
    var pdf = root.folder('PDF');
    var done = 0;

    rows.forEach(function (row) {
      var name = safeId(row.empId) + '_Salary_Report';
      excel.file(name + '.xlsx', workbookBlob(row));
      pdf.file(name + '.pdf', pdfBlob(row));
      done++;
      if (typeof onProgress === 'function') onProgress(done, rows.length);
    });

    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
      .then(function (blob) {
        downloadBlob(blob, 'Salary_Reports.zip');
        return blob;
      });
  }

  global.Reports = {
    buildWorkbook: buildWorkbook,
    workbookBlob: workbookBlob,
    buildPdf: buildPdf,
    pdfBlob: pdfBlob,
    downloadBlob: downloadBlob,
    downloadRowExcel: downloadRowExcel,
    downloadRowPdf: downloadRowPdf,
    downloadAllZip: downloadAllZip
  };
})(window);
