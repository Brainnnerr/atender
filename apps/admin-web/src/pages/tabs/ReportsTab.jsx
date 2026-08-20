import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../../lib/supabaseClient';
import fcoLogo from '../../assets/FCO-LOGOO.png';
import essuLogo from '../../assets/essu-logo-mini.png';
import { logAdminAction } from '../../lib/auditLogger';

export default function ReportsTab({ currentUser }) {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('ALL');
  const [programFilter, setProgramFilter] = useState('ALL');
  const [yearFilter, setYearFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [reportType, setReportType] = useState('ALL'); // 'ALL' | 'ATTENDANCE' | 'ABSENTEE'

  // PDF Preview Modal States
  const [pdfPreviewModalOpen, setPdfPreviewModalOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [pdfDocInstance, setPdfDocInstance] = useState(null);

  // Master Raw State
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [fines, setFines] = useState([]);

  useEffect(() => {
    fetchReportData();

    const channel = supabase
      .channel('realtime_reports_master_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => fetchReportData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fines' }, () => fetchReportData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => fetchReportData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedEventId]);

  const fetchReportData = async () => {
    try {
      setLoading(true);

      // 1. Safely sync expired events and assess fines
      try {
        await supabase.rpc('sync_absent_student_fines');
      } catch (err) {
        console.warn('Auto-fine evaluation skipped:', err);
      }

      // 2. Fetch Events
      const { data: evData } = await supabase
        .from('events')
        .select('*')
        .order('start_time', { ascending: false });
      setEvents(evData || []);

      // 3. Fetch Enrolled Students
      const { data: stData } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'student')
        .order('full_name', { ascending: true });
      setStudents(stData || []);

      // 4. Fetch Attendance Logs
      const { data: attData } = await supabase
        .from('attendance')
        .select('*');
      setAttendance(attData || []);

      // 5. Fetch Fines Table
      const { data: fnData } = await supabase
        .from('fines')
        .select('*');
      setFines(fnData || []);
    } catch (err) {
      console.error('Error compiling report data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper to load Logo as Base64 for jsPDF
  const getBase64ImageFromUrl = async (imageUrl) => {
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('Could not load image as base64:', e);
      return null;
    }
  };

  // Compile Comprehensive Attendance and Fine Audit Rows
  const compiledRows = students.map((student) => {
    const relevantEvents = selectedEventId === 'ALL'
      ? events
      : events.filter((e) => e.id === selectedEventId);

    const studentAttendance = attendance.filter((a) => {
      const isThisStudent = String(a.student_id) === String(student.id);
      const isTargetEvent = selectedEventId === 'ALL' || String(a.event_id) === String(selectedEventId);
      return isThisStudent && isTargetEvent && (a.time_in || a.status === 'present');
    });

    const studentDbFines = fines.filter((f) => {
      const isThisStudent = String(f.student_id) === String(student.id);
      const isTargetEvent = selectedEventId === 'ALL' || String(f.event_id) === String(selectedEventId);
      const isUnpaid = String(f.status || '').toLowerCase() === 'unpaid' || String(f.status || '').toLowerCase() === 'pending_approval';
      return isThisStudent && isTargetEvent && isUnpaid;
    });

    const isPresent = studentAttendance.length > 0;
    const dbFineTotal = studentDbFines.reduce((sum, f) => sum + (parseFloat(f.amount) || 0), 0);

    let calculatedAbsenceFine = 0;
    relevantEvents.forEach((evt) => {
      const isClosed = new Date(evt.end_time).getTime() <= Date.now() || evt.attendance_access === 'force_closed';
      const hasAttendedThis = attendance.some((a) => String(a.student_id) === String(student.id) && String(a.event_id) === String(evt.id));
      if (isClosed && !hasAttendedThis) {
        calculatedAbsenceFine += parseFloat(evt.fine_amount || 0);
      }
    });

    const unpaidFineTotal = Math.max(dbFineTotal, calculatedAbsenceFine);

    return {
      id: student.id,
      studentId: student.student_id,
      fullName: student.full_name,
      course: student.course || 'COE',
      yearLevel: student.year_level || '',
      section: student.section || '',
      isPresent,
      unpaidFineTotal,
      checkInTime: studentAttendance[0]?.time_in || studentAttendance[0]?.created_at || null,
    };
  });

  // Filter Pipeline
  const filteredRows = compiledRows.filter((row) => {
    const sName = (row.fullName || '').toLowerCase();
    const sId = (row.studentId || '').toLowerCase();
    const q = searchQuery.toLowerCase().trim();

    const matchesSearch = sName.includes(q) || sId.includes(q);
    const matchesProgram = programFilter === 'ALL' || row.course === programFilter;
    const matchesYear = yearFilter === 'ALL' || String(row.yearLevel) === yearFilter;

    if (reportType === 'ATTENDANCE') {
      return matchesSearch && matchesProgram && matchesYear && row.isPresent;
    } else if (reportType === 'ABSENTEE') {
      return matchesSearch && matchesProgram && matchesYear && !row.isPresent;
    }
    return matchesSearch && matchesProgram && matchesYear;
  });

  // Summary Metrics
  const totalReportStudents = compiledRows.length;
  const totalPresent = compiledRows.filter((r) => r.isPresent).length;
  const totalAbsent = totalReportStudents - totalPresent;
  const totalOutstanding = compiledRows.reduce((sum, r) => sum + r.unpaidFineTotal, 0);

  // Generate jsPDF Document Builder with Left (FCO) and Right (ESSU) Logos
  const buildPdfDocument = async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
    const currentEventTitle = selectedEventId === 'ALL'
      ? 'All Configured Assemblies'
      : events.find((e) => e.id === selectedEventId)?.title || 'Selected Event';

    const pageWidth = doc.internal.pageSize.getWidth();

    // 1. Insert Left FCO Logo
    const base64Fco = await getBase64ImageFromUrl(fcoLogo);
    if (base64Fco) {
      doc.addImage(base64Fco, 'PNG', 45, 34, 46, 46);
    }

    // 2. Insert Right ESSU Logo
    const base64Essu = await getBase64ImageFromUrl(essuLogo);
    if (base64Essu) {
      doc.addImage(base64Essu, 'PNG', pageWidth - 45 - 46, 34, 46, 46);
    }

    // 3. Centered Organization Header Texts
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text('FEDERATED CLASS ORGANIZATION', pageWidth / 2, 48, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 58, 138); // Navy blue accent
    doc.text('COLLEGE OF ENGINEERING', pageWidth / 2, 60, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(139, 0, 0); // #8b0000 Maroon
    doc.text('OFFICIAL ATTENDANCE & COMPLIANCE SUMMARY REPORT', pageWidth / 2, 80, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Event: ${currentEventTitle} | Scope: ${reportType}`, pageWidth / 2, 93, { align: 'center' });

    // 4. Summary Metric Banner Box
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(45, 108, pageWidth - 90, 26, 4, 4, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(`Total Students: ${filteredRows.length}`, 60, 124);
    doc.setTextColor(5, 150, 105);
    doc.text(`Present: ${filteredRows.filter((r) => r.isPresent).length}`, 185, 124);
    doc.setTextColor(220, 38, 38);
    doc.text(`Absent: ${filteredRows.filter((r) => !r.isPresent).length}`, 300, 124);
    doc.setTextColor(139, 0, 0);
    doc.text(`Fines Assessed: PHP ${filteredRows.reduce((sum, r) => sum + r.unpaidFineTotal, 0).toFixed(2)}`, 405, 124);

    // 5. Format Data Table
    const tableColumns = [
      { header: 'Student ID', dataKey: 'studentId' },
      { header: 'Full Name', dataKey: 'fullName' },
      { header: 'Program', dataKey: 'course' },
      { header: 'Yr & Sec', dataKey: 'yearSec' },
      { header: 'Status', dataKey: 'status' },
      { header: 'Check-In', dataKey: 'checkIn' },
      { header: 'Fine (PHP)', dataKey: 'fines' },
    ];

    const tableRows = filteredRows.map((r) => ({
      studentId: r.studentId,
      fullName: r.fullName,
      course: r.course,
      yearSec: `${r.yearLevel}${r.section}`,
      status: r.isPresent ? 'PRESENT' : 'ABSENT',
      checkIn: r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
      fines: r.unpaidFineTotal > 0 ? `PHP ${r.unpaidFineTotal.toFixed(2)}` : '0.00',
    }));

    autoTable(doc, {
      startY: 144,
      margin: { left: 45, right: 45 },
      columns: tableColumns,
      body: tableRows,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 4.5,
        textColor: [51, 65, 85],
        lineColor: [226, 232, 240],
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: [139, 0, 0],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        studentId: { cellWidth: 70, font: 'courier', fontStyle: 'bold' },
        fullName: { cellWidth: 140, fontStyle: 'bold' },
        course: { cellWidth: 50, halign: 'center' },
        yearSec: { cellWidth: 55, halign: 'center' },
        status: { cellWidth: 65, halign: 'center', fontStyle: 'bold' },
        checkIn: { cellWidth: 65, halign: 'center' },
        fines: { cellWidth: 77, halign: 'right', fontStyle: 'bold', textColor: [139, 0, 0] },
      },
      didParseCell: function (data) {
        if (data.section === 'body' && data.column.dataKey === 'status') {
          if (data.cell.raw === 'PRESENT') {
            data.cell.styles.textColor = [5, 150, 105];
          } else {
            data.cell.styles.textColor = [220, 38, 38];
          }
        }
      },
    });

    return doc;
  };

  // Open Preview Modal
  const handleOpenPdfPreview = async () => {
    const doc = await buildPdfDocument();
    setPdfDocInstance(doc);
    const pdfBlobUrl = doc.output('bloburl');
    setPdfPreviewUrl(pdfBlobUrl);
    setPdfPreviewModalOpen(true);
  };

  // Download PDF Directly with Audit Logging
  const handleDownloadPDF = async () => {
    try {
      const doc = pdfDocInstance || (await buildPdfDocument());
      doc.save(`Atender_Report_${selectedEventId}_${reportType}.pdf`);

      await logAdminAction({
        currentUser,
        actionType: 'EXPORT_AUDIT_REPORT',
        module: 'REPORTS',
        details: {
          export_format: 'PDF',
          report_type: reportType,
          program_filter: programFilter,
          year_filter: yearFilter,
          event_scope: selectedEventId,
          total_records: filteredRows.length,
        },
      });
    } catch (err) {
      console.error('Error downloading PDF report:', err);
    }
  };

  // CSV Export Handler with Audit Logging
  const handleExportCSV = async () => {
    const headers = [
      'Student ID',
      'Full Name',
      'Program',
      'Year & Section',
      'Attendance Status',
      'Check-In Time',
      'Outstanding Fines (PHP)',
    ];

    const csvRows = filteredRows.map((r) => [
      `"${r.studentId}"`,
      `"${r.fullName}"`,
      `"${r.course}"`,
      `"${r.yearLevel}${r.section}"`,
      `"${r.isPresent ? 'PRESENT' : 'ABSENT'}"`,
      `"${r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}"`,
      r.unpaidFineTotal.toFixed(2),
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...csvRows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Atender_Report_${selectedEventId}_${reportType}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    await logAdminAction({
      currentUser,
      actionType: 'EXPORT_AUDIT_REPORT',
      module: 'REPORTS',
      details: {
        export_format: 'CSV',
        report_type: reportType,
        program_filter: programFilter,
        year_filter: yearFilter,
        event_scope: selectedEventId,
        total_records: filteredRows.length,
      },
    });
  };

  const handlePrint = async () => {
    window.print();

    await logAdminAction({
      currentUser,
      actionType: 'EXPORT_AUDIT_REPORT',
      module: 'REPORTS',
      details: {
        export_format: 'PRINT',
        report_type: reportType,
        program_filter: programFilter,
        year_filter: yearFilter,
        event_scope: selectedEventId,
        total_records: filteredRows.length,
      },
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. TOP HEADER & ACTION BUTTONS */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Official Reports & Attendance Audit</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Preview and download vectorized PDF files, export structured CSV sheets, or print directly.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Sync */}
          <button
            onClick={fetchReportData}
            title="Refresh database records"
            className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer"
          >
            ↻
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Export CSV</span>
          </button>

          {/* PDF Preview & Download Button */}
          <button
            onClick={handleOpenPdfPreview}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span>Preview & Download PDF</span>
          </button>

          {/* Direct Print Report */}
          <button
            onClick={handlePrint}
            className="px-4 py-2.5 bg-[#8b0000] hover:bg-[#700000] text-white rounded-xl text-xs font-black uppercase tracking-wider transition shadow-sm shadow-[#8b0000]/20 flex items-center gap-1.5 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* 2. STAT SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 print:hidden">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Enrolled</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{totalReportStudents}</p>
          <span className="text-[11px] font-semibold text-slate-500 mt-0.5 inline-block">Registered Students</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Present Count</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">{totalPresent}</p>
          <span className="text-[11px] font-semibold text-emerald-600 mt-0.5 inline-block">
            {totalReportStudents > 0 ? Math.round((totalPresent / totalReportStudents) * 100) : 0}% Turnout
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Absentee Count</p>
          <p className="text-2xl font-black text-red-600 mt-1">{totalAbsent}</p>
          <span className="text-[11px] font-semibold text-red-600 mt-0.5 inline-block">Unexcused</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Fines Assessed</p>
          <p className="text-2xl font-black text-[#8b0000] mt-1">₱{totalOutstanding.toFixed(2)}</p>
          <span className="text-[11px] font-semibold text-amber-600 mt-0.5 inline-block">Unpaid Liabilities</span>
        </div>
      </div>

      {/* 3. REPORT CONFIGURATION & FILTER BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
            {[
              { id: 'ALL', label: 'All Students' },
              { id: 'ATTENDANCE', label: 'Present Only' },
              { id: 'ABSENTEE', label: 'Absent Only' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setReportType(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  reportType === t.id ? 'bg-[#8b0000] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Target Event:</span>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 cursor-pointer"
            >
              <option value="ALL">All Assemblies & Events</option>
              {events.map((evt) => (
                <option key={evt.id} value={evt.id}>
                  {evt.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between pt-2 border-t border-slate-100">
          <div className="w-full sm:w-80 relative">
            <input
              type="text"
              placeholder="Search student number or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20"
            />
            <svg
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={programFilter}
              onChange={(e) => setProgramFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Programs</option>
              <option value="BSCE">BSCE</option>
              <option value="BSEE">BSEE</option>
              <option value="BSCpE">BSCpE</option>
            </select>

            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Years</option>
              <option value="1">1st Year</option>
              <option value="2">2nd Year</option>
              <option value="3">3rd Year</option>
              <option value="4">4th Year</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4. OFFICIAL REPORT SHEET TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden p-6">
        {/* Printable/Browser Header Matching Design */}
        <div className="hidden print:block text-center pb-6 border-b border-slate-200 mb-6">
          <div className="flex items-center justify-between px-6 mb-2">
            <img src={fcoLogo} alt="FCO Logo" className="w-14 h-14 object-contain" />
            <div className="text-center flex-1 mx-4">
              <h1 className="text-base font-black text-slate-900 tracking-wider">
                FEDERATED CLASS ORGANIZATION
              </h1>
              <p className="text-[11px] font-bold text-blue-900 uppercase">
                COLLEGE OF ENGINEERING
              </p>
              <h2 className="text-sm font-black text-[#8b0000] uppercase tracking-wide mt-2">
                OFFICIAL ATTENDANCE & COMPLIANCE SUMMARY REPORT
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Event: {selectedEventId === 'ALL' ? 'All Configured Assemblies' : events.find((e) => e.id === selectedEventId)?.title} | Scope: {reportType}
              </p>
            </div>
            <img src={essuLogo} alt="ESSU Logo" className="w-14 h-14 object-contain" />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
            Compiling audit logs...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-12 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
            No student records matching this report configuration.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Student Number</th>
                  <th className="px-5 py-3.5">Student Full Name</th>
                  <th className="px-5 py-3.5">Course / Program</th>
                  <th className="px-5 py-3.5">Year & Section</th>
                  <th className="px-5 py-3.5">Attendance Status</th>
                  <th className="px-5 py-3.5">Check-In Time</th>
                  <th className="px-5 py-3.5 text-right">Outstanding Fines</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-xs">
                {filteredRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-5 py-3.5 font-mono font-bold text-slate-900">{row.studentId}</td>
                    <td className="px-5 py-3.5 font-bold text-slate-900">{row.fullName}</td>
                    <td className="px-5 py-3.5 font-bold text-slate-800">{row.course}</td>
                    <td className="px-5 py-3.5 font-mono text-slate-700">
                      {row.yearLevel}{row.section}
                    </td>
                    <td className="px-5 py-3.5">
                      {row.isPresent ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Present
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-50 text-red-700 border border-red-200">
                          Absent
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-600">
                      {row.checkInTime ? new Date(row.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {row.unpaidFineTotal > 0 ? (
                        <span className="font-bold text-red-600 font-mono">
                          ₱{row.unpaidFineTotal.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono">₱0.00</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. PDF PREVIEW & DOWNLOAD MODAL */}
      {pdfPreviewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full h-[88vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/70 flex-shrink-0">
              <div className="flex items-center gap-3">
                <img src={fcoLogo} alt="FCO Logo" className="w-8 h-8 object-contain" />
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                    PDF Document Preview
                  </h3>
                  <p className="text-[10px] text-slate-400 font-semibold">
                    Inspect formatted dual-logo table report before saving
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadPDF}
                  className="px-4 py-2 bg-[#8b0000] hover:bg-[#700000] text-white rounded-xl text-xs font-black uppercase tracking-wider transition shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Save PDF Document</span>
                </button>
                <button
                  onClick={() => setPdfPreviewModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 font-bold text-xl leading-none cursor-pointer"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Modal Body / Embedded PDF Viewer */}
            <div className="flex-1 bg-slate-200 p-2 overflow-hidden">
              {pdfPreviewUrl ? (
                <iframe
                  src={pdfPreviewUrl}
                  title="PDF Preview"
                  className="w-full h-full rounded-2xl bg-white border-0 shadow-inner"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-500">
                  Generating document stream...
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}