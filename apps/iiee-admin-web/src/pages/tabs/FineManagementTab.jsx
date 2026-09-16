import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../../lib/supabaseClient';
import { logAdminAction } from '../../lib/auditLogger';
import fcoLogo from '../../assets/FCO-LOGOO.png';
import essuLogo from '../../assets/essu-logo-mini.png';

export default function FineManagementTab({ currentUser }) {
  const [fines, setFines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  
  // Advanced dropdown filter states
  const [programFilter, setProgramFilter] = useState('ALL');
  const [yearFilter, setYearFilter] = useState('ALL');
  const [sectionFilter, setSectionFilter] = useState('ALL');
  const [semesterFilter, setSemesterFilter] = useState('1st Semester'); // Default to 1st Semester

  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  
  // PDF Preview Modal States
  const [pdfPreviewModalOpen, setPdfPreviewModalOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [pdfDocInstance, setPdfDocInstance] = useState(null);
  
  // Remarks Modal States
  const [remarksModalOpen, setRemarksModalOpen] = useState(false);
  const [selectedStudentForAction, setSelectedStudentForAction] = useState(null);
  const [selectedRemark, setSelectedRemark] = useState('Member');

  useEffect(() => {
    fetchStudentFinesMasterlist();
  }, [semesterFilter]); // Re-fetch or re-filter when semester changes

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3500);
  };

  const fetchStudentFinesMasterlist = async () => {
    try {
      setLoading(true);
      
      // 1. Fetch all students
      const { data: students, error: studErr } = await supabase
        .from('profiles')
        .select('id, full_name, student_id, year_level, section, course')
        .eq('role', 'student');

      if (studErr) throw studErr;

      // 2. Fetch all fines records along with parent event's semester property
      const { data: finesData, error: fineErr } = await supabase
        .from('fines')
        .select('id, amount, status, remarks, student_id, event_id, events(semester)');

      if (fineErr) throw fineErr;

      // 3. Aggregate fines per student filtered strictly by selected semester
      const aggregatedList = students.map(student => {
        const studentFines = (finesData || []).filter(f => {
          if (f.student_id !== student.id) return false;
          if (semesterFilter === 'ALL') return true;
          const eventSemester = f.events?.semester || '1st Semester';
          return eventSemester.toLowerCase() === semesterFilter.toLowerCase();
        });
        
        // Unpaid fines sum
        const unpaidFines = studentFines.filter(f => String(f.status || '').toLowerCase() === 'unpaid');
        const unpaidAmount = unpaidFines.reduce((sum, f) => sum + parseFloat(f.amount || 0), 0);

        // Check if student has any paid fines to reflect collection history
        const hasPaidRecords = studentFines.some(f => String(f.status || '').toLowerCase() === 'paid');

        // Determine aggregated status and display amount
        let status = 'unpaid';
        let displayAmount = unpaidAmount;

        if (unpaidAmount === 0 && hasPaidRecords) {
          status = 'paid';
          displayAmount = studentFines.reduce((sum, f) => sum + parseFloat(f.amount || 0), 0);
        } else if (unpaidAmount === 0 && studentFines.length === 0) {
          status = 'paid';
          displayAmount = 0;
        }

        const remarks = studentFines[0]?.remarks || 'Member';
        const fineIds = studentFines.map(f => f.id);

        return {
          studentId: student.id,
          profiles: student,
          fineIds: fineIds,
          amount: displayAmount,
          unpaidAmount: unpaidAmount,
          status: status,
          remarks: remarks
        };
      });

      setFines(aggregatedList);
    } catch (err) {
      console.error('Error fetching masterlist:', err.message || err);
      showToast('Failed to load student records.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenRemarksModal = (studentRecord) => {
    if (parseFloat(studentRecord.unpaidAmount || 0) <= 0) return;
    setSelectedStudentForAction(studentRecord);
    setSelectedRemark('Member');
    setRemarksModalOpen(true);
  };

  const handleConfirmMarkPaid = async () => {
    if (!selectedStudentForAction) return;

    try {
      // 1. Mark the student's fine records as paid
      if (selectedStudentForAction.fineIds && selectedStudentForAction.fineIds.length > 0) {
        const { error } = await supabase
          .from('fines')
          .update({ 
            status: 'paid',
            remarks: selectedRemark 
          })
          .in('id', selectedStudentForAction.fineIds);

        if (error) throw error;

        // 2. Fetch the event IDs tied to these fines so we can hide them from the student view
        const { data: fineRecords } = await supabase
          .from('fines')
          .select('event_id')
          .in('id', selectedStudentForAction.fineIds);

        const eventIdsToHide = [...new Set((fineRecords || []).map(f => f.event_id).filter(Boolean))];

        // 3. Hide the associated event(s) from the student dashboard
        if (eventIdsToHide.length > 0) {
          const { error: eventErr } = await supabase
            .from('events')
            .update({ hidden_from_student: true })
            .in('id', eventIdsToHide);

          if (eventErr) console.warn('Could not hide event from student:', eventErr);
        }
      }

      showToast('Fines marked as paid successfully!');

      await logAdminAction({
        currentUser,
        actionType: 'UPDATE_STUDENT_FINES_PAID',
        module: 'FINES',
        targetId: selectedStudentForAction.studentId,
        details: { remarks: selectedRemark, status: 'paid', cleared_total: selectedStudentForAction.unpaidAmount },
      });

      setRemarksModalOpen(false);
      setSelectedStudentForAction(null);
      fetchStudentFinesMasterlist();
    } catch (err) {
      showToast(err.message || 'Operation failed.', 'error');
    }
  };

  // Extract unique options for filter dropdowns
  const uniquePrograms = ['ALL', ...new Set(fines.map(f => f.profiles?.course).filter(Boolean))];
  const uniqueYears = ['ALL', ...new Set(fines.map(f => f.profiles?.year_level).filter(Boolean))];
  const uniqueSections = ['ALL', ...new Set(fines.map(f => f.profiles?.section).filter(Boolean))];

  // Filter pipeline
  const filteredFines = fines.filter((f) => {
    const student = f.profiles || {};
    const matchesSearch =
      (student.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (student.student_id || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'ALL' || f.status.toLowerCase() === statusFilter.toLowerCase();

    const matchesProgram = programFilter === 'ALL' || student.course === programFilter;
    const matchesYear = yearFilter === 'ALL' || String(student.year_level) === String(yearFilter);
    const matchesSection = sectionFilter === 'ALL' || student.section === sectionFilter;

    return matchesSearch && matchesStatus && matchesProgram && matchesYear && matchesSection;
  });

  const totalUnpaidAmount = filteredFines
    .filter(f => f.status === 'unpaid')
    .reduce((sum, f) => sum + parseFloat(f.unpaidAmount || 0), 0);

  const totalPaidAmount = filteredFines
    .filter(f => f.status === 'paid')
    .reduce((sum, f) => sum + parseFloat(f.amount || 0), 0);

  // Helper to load logo as Base64 for jsPDF
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

  const buildPdfDocument = async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
    const pageWidth = doc.internal.pageSize.getWidth();

    const base64Fco = await getBase64ImageFromUrl(fcoLogo);
    if (base64Fco) {
      doc.addImage(base64Fco, 'PNG', 45, 34, 46, 46);
    }

    const base64Essu = await getBase64ImageFromUrl(essuLogo);
    if (base64Essu) {
      doc.addImage(base64Essu, 'PNG', pageWidth - 45 - 46, 34, 46, 46);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text('FEDERATED CLASS ORGANIZATION', pageWidth / 2, 48, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 58, 138);
    doc.text('COLLEGE OF ENGINEERING', pageWidth / 2, 60, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(139, 0, 0);
    doc.text('OFFICIAL STUDENT FINES & SANCTIONS AUDIT REPORT', pageWidth / 2, 80, { align: 'center' });

    // Include the active semester filter in the metadata subheader
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Semester: ${semesterFilter} | Scope: ${statusFilter} | Generated: ${new Date().toLocaleString()}`, pageWidth / 2, 93, { align: 'center' });

    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(45, 108, pageWidth - 90, 26, 4, 4, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(`Total Students: ${filteredFines.length}`, 60, 124);
    doc.setTextColor(220, 38, 38);
    doc.text(`Unpaid Total: PHP ${totalUnpaidAmount.toFixed(2)}`, 200, 124);
    doc.setTextColor(5, 150, 105);
    doc.text(`Collected Total: PHP ${totalPaidAmount.toFixed(2)}`, 385, 124);

    const tableColumns = [
      { header: 'Student ID', dataKey: 'studentId' },
      { header: 'Full Name', dataKey: 'fullName' },
      { header: 'Program', dataKey: 'program' },
      { header: 'Yr & Sec', dataKey: 'yearSec' },
      { header: 'Remarks', dataKey: 'remarks' },
      { header: 'Amount (PHP)', dataKey: 'amount' },
      { header: 'Status', dataKey: 'status' },
    ];

    const tableRows = filteredFines.map((f) => ({
      studentId: f.profiles?.student_id || 'N/A',
      fullName: f.profiles?.full_name || 'Unknown',
      program: f.profiles?.course || 'BSCpE',
      yearSec: `${f.profiles?.year_level || ''}${f.profiles?.section || ''}`,
      remarks: (f.remarks || 'Member').toUpperCase(),
      amount: `PHP ${parseFloat(f.status === 'unpaid' ? f.unpaidAmount : f.amount || 0).toFixed(2)}`,
      status: f.status.toUpperCase(),
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
        fullName: { cellWidth: 130, fontStyle: 'bold' },
        program: { cellWidth: 55, halign: 'center' },
        yearSec: { cellWidth: 50, halign: 'center' },
        remarks: { cellWidth: 65, halign: 'center', fontStyle: 'bold' },
        amount: { cellWidth: 65, halign: 'right', fontStyle: 'bold', textColor: [139, 0, 0] },
        status: { cellWidth: 87, halign: 'center', fontStyle: 'bold' },
      },
      didParseCell: function (data) {
        if (data.section === 'body' && data.column.dataKey === 'status') {
          if (data.cell.raw === 'PAID') {
            data.cell.styles.textColor = [5, 150, 105];
          } else {
            data.cell.styles.textColor = [220, 38, 38];
          }
        }
      },
    });

    return doc;
  };

  const handleOpenPdfPreview = async () => {
    const doc = await buildPdfDocument();
    setPdfDocInstance(doc);
    const pdfBlobUrl = doc.output('bloburl');
    setPdfPreviewUrl(pdfBlobUrl);
    setPdfPreviewModalOpen(true);
  };

  const handleDownloadPDF = async () => {
    try {
      const doc = pdfDocInstance || (await buildPdfDocument());
      doc.save(`Student_Fines_Audit_Report_${semesterFilter.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);

      await logAdminAction({
        currentUser,
        actionType: 'EXPORT_AUDIT_REPORT',
        module: 'FINES',
        details: { export_format: 'PDF', semester: semesterFilter, total_records: filteredFines.length },
      });
    } catch (err) {
      console.error('Error downloading PDF:', err);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto relative">
      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed top-6 right-6 z-[100] animate-bounce print:hidden">
          <div className={`px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 border text-xs font-bold ${
            toast.type === 'error' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}>
            <span>{toast.type === 'error' ? '⚠️' : '✓'}</span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* TOP METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 print:hidden">
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <h3 className="text-base font-black text-slate-800">Total Unpaid Fines ({semesterFilter})</h3>
          <p className="text-3xl font-black text-red-600 mt-2">₱{totalUnpaidAmount.toFixed(2)}</p>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">Pending Collection</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <h3 className="text-base font-black text-slate-800">Total Collected ({semesterFilter})</h3>
          <p className="text-3xl font-black text-emerald-600 mt-2">₱{totalPaidAmount.toFixed(2)}</p>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">Cleared Sanctions</p>
        </div>
      </div>

      {/* ACTION BAR */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm print:hidden">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-black text-slate-800 tracking-tight">Student Fine & Sanction Management</h2>
            <span className="px-3 py-1 bg-red-50 text-[#8b0000] border border-red-200 rounded-full text-[10px] font-black uppercase tracking-wider">
              📅 {semesterFilter}
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Manage student compliance, filter by program/year/section, and download vectorized PDF audit reports.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* SEARCH, STATUS, & DROPDOWN FILTERS */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col lg:flex-row gap-4 items-center justify-between print:hidden">
        <div className="w-full lg:w-72 relative">
          <input
            type="text"
            placeholder="Search student name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 focus:border-[#8b0000]"
          />
          <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* Program Dropdown Filter */}
          <select
            value={programFilter}
            onChange={(e) => setProgramFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 uppercase cursor-pointer"
          >
            <option value="ALL">Program: All</option>
            {uniquePrograms.filter(p => p !== 'ALL').map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          {/* Year Level Dropdown Filter */}
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 uppercase cursor-pointer"
          >
            <option value="ALL">Year: All</option>
            {uniqueYears.filter(y => y !== 'ALL').map(y => (
              <option key={y} value={y}>Year {y}</option>
            ))}
          </select>

          {/* Section Dropdown Filter */}
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 uppercase cursor-pointer"
          >
            <option value="ALL">Section: All</option>
            {uniqueSections.filter(s => s !== 'ALL').map(s => (
              <option key={s} value={s}>Section {s}</option>
            ))}
          </select>

          {/* Semester Filter Dropdown */}
          <select
            value={semesterFilter}
            onChange={(e) => setSemesterFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 uppercase cursor-pointer"
          >
            <option value="1st Semester">1st Semester</option>
            <option value="2nd Semester">2nd Semester</option>
            <option value="Summer Term">Summer Term</option>
            <option value="ALL">All Semesters</option>
          </select>

          {/* Status Pills */}
          <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200/80">
            {['ALL', 'UNPAID', 'PAID'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition ${
                  statusFilter === st ? 'bg-[#8b0000] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* FINES TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
            Loading student masterlist for {semesterFilter}...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Student Info</th>
                  <th className="px-6 py-4">Remarks</th>
                  <th className="px-6 py-4">Amount ({semesterFilter})</th>
                  <th className="px-6 py-4">Payment Status</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-xs">
                {filteredFines.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-slate-400 font-bold uppercase tracking-wider">
                      No student records found matching your filters for {semesterFilter}.
                    </td>
                  </tr>
                ) : (
                  filteredFines.map((f) => {
                    const student = f.profiles || {};
                    const isPaid = f.status === 'paid';
                    const amountVal = parseFloat(f.status === 'unpaid' ? f.unpaidAmount : f.amount || 0);

                    return (
                      <tr key={f.studentId} className="hover:bg-slate-50/50 transition">
                        <td className="px-6 py-4">
                          <p className="font-bold text-slate-900 text-sm">{student.full_name || 'Unknown'}</p>
                          <p className="text-slate-400 text-[11px] font-mono mt-0.5">ID: {student.student_id || 'N/A'} • {student.course || 'BSCpE'} {student.year_level}{student.section}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg font-bold text-[10px] uppercase">
                            {f.remarks || 'Member'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-black text-slate-900 font-mono text-sm">₱{amountVal.toFixed(2)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            isPaid ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isPaid ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            {f.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {f.unpaidAmount > 0 ? (
                            <button
                              onClick={() => handleOpenRemarksModal(f)}
                              className="px-3.5 py-1.5 rounded-xl font-bold text-[11px] uppercase tracking-wider transition cursor-pointer shadow-sm bg-emerald-600 text-white hover:bg-emerald-700"
                            >
                              Mark Paid ✓
                            </button>
                          ) : (
                            <span className="text-slate-300 font-bold uppercase text-[10px]">No Balance</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* REMARKS SELECTION MODAL */}
      {remarksModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4 text-left">
            <h3 className="font-black text-slate-800 uppercase tracking-wide text-xs">
              Select Student Category / Remark
            </h3>
            <p className="text-xs text-slate-500">
              Please choose the appropriate category before marking as paid (this will update status to paid):
            </p>

            <div className="space-y-2 py-2 max-h-60 overflow-y-auto pr-1">
  {[
    'Member',
    'Athlete',
    "Dean's Lister",
    'Officer',
    'President Lister',
    'IIEE Officer',
    'FCO Officer',
    'ICPEP Officer',
    'PICE Officer',
    'Sub-Org Committee',
    'FCO Committee',
    'Publication (Algorithm)',
    'Others'
  ].map((rem) => (
    <label key={rem} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100 transition">
      <input
        type="radio"
        name="studentRemark"
        value={rem}
        checked={selectedRemark === rem}
        onChange={(e) => setSelectedRemark(e.target.value)}
        className="text-[#8b0000] focus:ring-[#8b0000]"
      />
      <span className="text-xs font-bold text-slate-800 uppercase">{rem}</span>
    </label>
  ))}
</div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setRemarksModalOpen(false)}
                className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmMarkPaid}
                className="w-1/2 py-2.5 bg-[#8b0000] hover:bg-[#700000] text-white font-bold rounded-xl text-xs uppercase tracking-wider transition cursor-pointer"
              >
                Confirm Paid
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF PREVIEW MODAL */}
      {pdfPreviewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full h-[88vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/70 flex-shrink-0">
              <div className="flex items-center gap-3">
                <img src={fcoLogo} alt="FCO Logo" className="w-8 h-8 object-contain" />
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                    PDF Audit Report Preview ({semesterFilter})
                  </h3>
                  <p className="text-[10px] text-slate-400 font-semibold">
                    Inspect table format before downloading document
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