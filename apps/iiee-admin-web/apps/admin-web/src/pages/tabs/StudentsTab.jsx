import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../../lib/supabaseClient';
import { logAdminAction } from '../../lib/auditLogger';
import fcoLogo from '../../assets/FCO-LOGOO.png';

export default function StudentsTab({ currentUser }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [programFilter, setProgramFilter] = useState('ALL');
  const [sectionFilter, setSectionFilter] = useState('ALL');
  const [yearFilter, setYearFilter] = useState('ALL'); // <--- Added Year Filter State
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Form states
  const [studentId, setStudentId] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [course, setCourse] = useState('BSCE');
  const [yearLevel, setYearLevel] = useState('1');
  const [section, setSection] = useState('A');

  useEffect(() => {
    fetchStudents();

    // Realtime sync for student profile edits and password resets
    const channel = supabase
      .channel('realtime_students_admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          fetchStudents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'success' });
    }, 3500);
  };

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'student')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStudents(data || []);
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setLoading(false);
    }
  };

  // Program counts
  const ceCount = students.filter((s) => s.course === 'BSCE').length;
  const eeCount = students.filter((s) => s.course === 'BSEE').length;
  const cpeCount = students.filter((s) => s.course === 'BSCpE').length;

  const handleOpenCreateModal = () => {
    setIsEditing(false);
    setSelectedStudentId(null);
    setStudentId('');
    setFullName('');
    setEmail('');
    setCourse('BSCE');
    setYearLevel('1');
    setSection('A');
    setModalOpen(true);
  };

  const handleOpenEditModal = (student) => {
    setIsEditing(true);
    setSelectedStudentId(student.id);
    setStudentId(student.student_id || '');
    setFullName(student.full_name || '');
    setEmail(student.email || '');
    setCourse(student.course || 'BSCE');
    setYearLevel(student.year_level?.toString() || '1');
    setSection(student.section || 'A');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!studentId.trim() || !fullName.trim()) {
      showToast('Please fill in the student number and name.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing) {
        const { error } = await supabase.rpc('admin_update_student', {
          p_user_id: selectedStudentId,
          p_student_id: studentId.trim(),
          p_full_name: fullName.trim(),
          p_course: course,
          p_year_level: parseInt(yearLevel, 10),
          p_section: section.trim().toUpperCase(),
          p_email: email.trim() || null,
        });

        if (error) throw error;

        await logAdminAction({
          currentUser,
          actionType: 'UPDATE_STUDENT',
          module: 'STUDENTS',
          targetId: selectedStudentId,
          details: {
            student_id: studentId.trim(),
            full_name: fullName.trim(),
            course,
            year_level: parseInt(yearLevel, 10),
            section: section.trim().toUpperCase(),
          },
        });

        showToast(`Student record for ${fullName} updated successfully!`);
      } else {
        const { error } = await supabase.rpc('admin_register_student', {
          p_student_id: studentId.trim(),
          p_full_name: fullName.trim(),
          p_course: course,
          p_year_level: parseInt(yearLevel, 10),
          p_section: section.trim().toUpperCase(),
          p_email: email.trim() || null,
        });

        if (error) throw error;

        await logAdminAction({
          currentUser,
          actionType: 'REGISTER_STUDENT',
          module: 'STUDENTS',
          targetId: studentId.trim(),
          details: {
            student_id: studentId.trim(),
            full_name: fullName.trim(),
            course,
            year_level: parseInt(yearLevel, 10),
            section: section.trim().toUpperCase(),
          },
        });

        showToast(`Student ${fullName} registered! Password set to ${studentId.trim()}`);
      }

      setModalOpen(false);
      fetchStudents();
    } catch (err) {
      showToast(err.message || 'Action failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (student) => {
    const confirmed = window.confirm(
      `Reset password for ${student.full_name} (${student.student_id})?\n\nTheir login password will revert to default: "${student.student_id}".`
    );
    if (!confirmed) return;

    try {
      const { data: res, error } = await supabase.rpc('admin_reset_student_password', {
        p_student_id: student.id,
      });

      if (error || (res && res.success === false)) {
        throw new Error(res?.message || error?.message || 'Failed to reset password.');
      }

      await logAdminAction({
        currentUser,
        actionType: 'RESET_STUDENT_PASSWORD',
        module: 'STUDENTS',
        targetId: student.id,
        details: {
          student_id: student.student_id,
          student_name: student.full_name,
        },
      });

      showToast(`Password for ${student.student_id} reset to default student number!`);
      fetchStudents();
    } catch (err) {
      showToast(err.message || 'Failed to reset password.', 'error');
    }
  };

  const handleDeleteStudent = async (student) => {
    if (!window.confirm(`Are you sure you want to delete ${student.full_name}'s account?`)) return;

    try {
      const { error } = await supabase.rpc('admin_delete_student', {
        p_user_id: student.id,
      });

      if (error) throw error;

      await logAdminAction({
        currentUser,
        actionType: 'DELETE_STUDENT',
        module: 'STUDENTS',
        targetId: student.id,
        details: {
          student_id: student.student_id,
          student_name: student.full_name,
        },
      });

      showToast(`Student account deleted.`);
      fetchStudents();
    } catch (err) {
      showToast(err.message || 'Failed to delete student.', 'error');
    }
  };

  // Filter logic including Year Level
  const filteredStudents = students.filter((s) => {
    const sId = s.student_id || '';
    const sName = s.full_name || '';
    const sCourse = s.course || '';
    const sSection = s.section || '';
    const sYear = s.year_level?.toString() || '';

    const matchesSearch =
      sName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProgram = programFilter === 'ALL' || sCourse === programFilter;
    const matchesSection = sectionFilter === 'ALL' || sSection.toUpperCase() === sectionFilter;
    const matchesYear = yearFilter === 'ALL' || sYear === yearFilter;

    return matchesSearch && matchesProgram && matchesSection && matchesYear;
  });

  // PDF Export & Preview Generator
  const handleDownloadPDF = () => {
    if (filteredStudents.length === 0) {
      showToast('No student records available to export for the current filters.', 'error');
      return;
    }

    const doc = new jsPDF();

    const img = new Image();
    img.src = fcoLogo;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const dataURL = canvas.toDataURL('image/png');

      doc.addImage(dataURL, 'PNG', 14, 10, 18, 18);

      doc.setFontSize(14);
      doc.setTextColor(139, 0, 0);
      doc.text('EASTERN SAMAR STATE UNIVERSITY', 36, 15);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text('College of Engineering - Student Masterlist Roster', 36, 21);
      doc.text(`Program: ${programFilter} | Year: ${yearFilter} | Section: ${sectionFilter}`, 14, 32);
      doc.text(`Generated On: ${new Date().toLocaleDateString()}`, 14, 38);

      const tableColumn = ['No.', 'Student Number', 'Full Name', 'Program', 'Year & Section'];
      const tableRows = [];

      filteredStudents.forEach((item, index) => {
        const studentData = [
          index + 1,
          item.student_id || 'N/A',
          item.full_name || 'N/A',
          item.course || 'N/A',
          `${item.year_level || ''}${item.section || ''}`,
        ];
        tableRows.push(studentData);
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 44,
        theme: 'grid',
        headStyles: { fillColor: [139, 0, 0] },
        styles: { fontSize: 9 },
      });

      doc.output('dataurlnewwindow');
      showToast('PDF Roster with logo generated successfully!');
    };

    img.onerror = () => {
      doc.setFontSize(14);
      doc.setTextColor(139, 0, 0);
      doc.text('EASTERN SAMAR STATE UNIVERSITY', 36, 15);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text('College of Engineering - Student Masterlist', 36, 21);
      
      doc.text(`Program: ${programFilter} | Year: ${yearFilter} | Section: ${sectionFilter}`, 14, 32);

      const tableColumn = ['No.', 'Student Number', 'Full Name', 'Program', 'Year & Section'];
      const tableRows = [];

      filteredStudents.forEach((item, index) => {
        tableRows.push([
          index + 1,
          item.student_id || 'N/A',
          item.full_name || 'N/A',
          item.course || 'N/A',
          `${item.year_level || ''}${item.section || ''}`,
        ]);
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 40,
        theme: 'grid',
        headStyles: { fillColor: [139, 0, 0] },
        styles: { fontSize: 9 },
      });

      doc.output('dataurlnewwindow');
      showToast('PDF Roster generated successfully!');
    };
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto relative">
      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed top-6 right-6 z-[100] animate-bounce">
          <div
            className={`px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 border text-xs font-bold ${
              toast.type === 'error'
                ? 'bg-red-50 text-red-800 border-red-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
          >
            <span>{toast.type === 'error' ? '⚠️' : '✓'}</span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* 1. TOP 3 STAT CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <h3 className="text-base font-black text-slate-800">Civil Engineering</h3>
          <p className="text-3xl font-black text-slate-900 mt-2">{ceCount}</p>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">Enrolled Students</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <h3 className="text-base font-black text-slate-800">Electrical Engineering</h3>
          <p className="text-3xl font-black text-slate-900 mt-2">{eeCount}</p>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">Enrolled Students</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <h3 className="text-base font-black text-slate-800">Computer Engineering</h3>
          <p className="text-3xl font-black text-slate-900 mt-2">{cpeCount}</p>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">Enrolled Students</p>
        </div>
      </div>

      {/* 2. ACTION & EXPORT BUTTON BAR */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-800 tracking-tight">Student Accounts Masterlist</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Initial password defaults to the student number until changed by the student on mobile.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadPDF}
            className="px-4 py-3 bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white font-bold text-xs uppercase tracking-widest rounded-xl transition shadow-md flex items-center gap-2 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Download PDF Roster</span>
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="px-5 py-3 bg-[#8b0000] hover:bg-[#700000] active:scale-[0.99] text-white font-bold text-xs uppercase tracking-widest rounded-xl transition shadow-md shadow-[#8b0000]/20 flex items-center gap-2 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Register Student</span>
          </button>
        </div>
      </div>

      {/* 3. MULTI-FILTER SEARCH BAR WITH YEAR LEVEL */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col lg:flex-row gap-4 items-center justify-between">
        <div className="w-full lg:w-96 relative">
          <input
            type="text"
            placeholder="Search by student ID or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 focus:border-[#8b0000]"
          />
          <svg
            className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200/80">
            {['ALL', 'BSCE', 'BSEE', 'BSCpE'].map((prog) => (
              <button
                key={prog}
                onClick={() => setProgramFilter(prog)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  programFilter === prog
                    ? 'bg-[#8b0000] text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {prog}
              </button>
            ))}
          </div>

          {/* Year Level Filter Dropdown */}
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 cursor-pointer"
          >
            <option value="ALL">All Year Levels</option>
            <option value="1">1st Year</option>
            <option value="2">2nd Year</option>
            <option value="3">3rd Year</option>
            <option value="4">4th Year</option>
          </select>

          {/* Section Filter Dropdown */}
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 cursor-pointer"
          >
            <option value="ALL">All Sections</option>
            <option value="A">Section A</option>
            <option value="B">Section B</option>
            <option value="C">Section C</option>
            <option value="D">Section D</option>
          </select>
        </div>
      </div>

      {/* 4. STUDENTS MASTERLIST TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
            Fetching student accounts...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Student Profile</th>
                  <th className="px-6 py-4">Program</th>
                  <th className="px-6 py-4">Year & Section</th>
                  <th className="px-6 py-4">Password Status</th>
                  <th className="px-6 py-4 text-right">Account Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-xs">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-slate-400 font-bold uppercase tracking-wider">
                      No students found matching the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center border border-slate-300">
                            {item.avatar_url ? (
                              <img src={item.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                              <span className="font-black text-xs text-slate-600">
                                {item.full_name?.charAt(0) || 'S'}
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm">{item.full_name}</p>
                            <p className="text-slate-400 font-mono text-[11px] mt-0.5">{item.student_id}</p>
                            <p className="text-slate-400 font-normal text-[10px] mt-0.5 truncate max-w-[200px]">
                              {item.email || 'No email provided'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-slate-800 text-xs">
                          {item.course}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-slate-800 font-mono text-xs">
                          {item.year_level}{item.section}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {item.password_changed ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Custom Password
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200">
                            <span className="font-mono">{item.student_id}</span>
                            <span className="text-[9px] font-bold text-amber-600">(Default)</span>
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right space-x-1.5">
                        <button
                          onClick={() => handleOpenEditModal(item)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] uppercase tracking-wider rounded-lg transition cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleResetPassword(item)}
                          title="Revert student password to default student number"
                          className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[11px] uppercase tracking-wider rounded-lg transition cursor-pointer"
                        >
                          Reset PW
                        </button>
                        <button
                          onClick={() => handleDeleteStudent(item)}
                          className="px-2.5 py-1.5 text-red-600 hover:text-red-800 font-bold uppercase text-[11px] rounded-lg transition hover:bg-red-50 cursor-pointer"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. CREATE / EDIT MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-black text-slate-800 uppercase tracking-wide text-sm">
                  {isEditing ? 'Update Student Profile' : 'Register Engineering Student'}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isEditing ? 'Modify student academic details' : 'Initial password is set to Student Number'}
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl leading-none cursor-pointer"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 mt-5 text-xs font-bold uppercase text-slate-700">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1.5">Student Number / ID</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 23-10452"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 focus:border-[#8b0000]"
                  />
                </div>
                <div>
                  <label className="block mb-1.5">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Juan Dela Cruz"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 focus:border-[#8b0000]"
                  />
                </div>
              </div>

              <div>
                <label className="block mb-1.5">Email Address (Optional)</label>
                <input
                  type="email"
                  placeholder="e.g. student@essu.edu.ph"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 focus:border-[#8b0000]"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block mb-1.5">Program</label>
                  <select
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 cursor-pointer"
                  >
                    <option value="BSCE">BSCE</option>
                    <option value="BSEE">BSEE</option>
                    <option value="BSCpE">BSCpE</option>
                  </select>
                </div>

                <div>
                  <label className="block mb-1.5">Year Level</label>
                  <select
                    value={yearLevel}
                    onChange={(e) => setYearLevel(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 cursor-pointer"
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </select>
                </div>

                <div>
                  <label className="block mb-1.5">Section</label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    placeholder="A"
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-center text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20"
                  />
                </div>
              </div>

              {!isEditing && (
                <div className="p-3 bg-red-50/60 rounded-xl border border-red-100 text-[11px] normal-case font-medium text-[#8b0000]">
                  🔑 <strong>Default Credentials:</strong> The student will log in on mobile using their Student ID as both username and initial password. Once changed, the student number will be permanently disabled for authentication until an admin resets it here.
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 bg-[#8b0000] hover:bg-[#700000] disabled:opacity-50 text-white font-bold rounded-xl tracking-wider uppercase transition shadow-md shadow-[#8b0000]/20 cursor-pointer"
                >
                  {submitting
                    ? isEditing ? 'Updating...' : 'Registering...'
                    : isEditing ? 'Save Changes' : 'Register Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}