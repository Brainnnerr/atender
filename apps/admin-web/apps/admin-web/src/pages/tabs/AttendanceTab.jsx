import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { logAdminAction } from '../../lib/auditLogger';

export default function AttendanceTab({ currentUser }) {
  const [events, setEvents] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('ALL');
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Manual Attendance Modal States
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualEventId, setManualEventId] = useState('');
  const [manualStudentId, setManualStudentId] = useState('');
  const [manualStudentSearch, setManualStudentSearch] = useState('');
  const [manualSubmitting, setManualSubmitting] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [programFilter, setProgramFilter] = useState('ALL');
  const [yearFilter, setYearFilter] = useState('ALL');

  // Selected Student for Right Drawer
  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    fetchEventsList();
    fetchStudentsList();
  }, []);

  useEffect(() => {
    fetchAttendanceData();

    // Listen to both attendance logs and student profile changes
    const channel = supabase
      .channel('realtime_admin_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        () => fetchAttendanceData()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        () => fetchAttendanceData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedEventId]);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'success' });
    }, 3500);
  };

  const fetchEventsList = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, start_time, end_time, fine_amount')
        .order('start_time', { ascending: false });

      if (error) throw error;
      setEvents(data || []);
      if (data && data.length > 0) {
        setSelectedEventId(data[0].id);
        setManualEventId(data[0].id);
      }
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  const fetchStudentsList = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, student_id, course')
        .order('full_name', { ascending: true });

      if (error) throw error;
      setStudents(data || []);
    } catch (err) {
      console.error('Error fetching student list:', err);
    }
  };

  const fetchAttendanceData = async () => {
    try {
      setLoading(true);

      // 1. Fetch raw attendance records
      let attQuery = supabase
        .from('attendance')
        .select('*')
        .order('time_in', { ascending: false });

      if (selectedEventId && selectedEventId !== 'ALL') {
        attQuery = attQuery.eq('event_id', selectedEventId);
      }

      const { data: rawAttendance, error: attError } = await attQuery;
      if (attError) throw attError;

      if (!rawAttendance || rawAttendance.length === 0) {
        setAttendanceLogs([]);
        setSelectedLog(null);
        return;
      }

      // 2. Fetch linked Student Profiles
      const studentIds = [...new Set(rawAttendance.map((a) => a.student_id).filter(Boolean))];
      const { data: profilesData, error: profError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', studentIds);

      if (profError) throw profError;

      // 3. Fetch linked Events
      const eventIds = [...new Set(rawAttendance.map((a) => a.event_id).filter(Boolean))];
      const { data: eventsData, error: evError } = await supabase
        .from('events')
        .select('*')
        .in('id', eventIds);

      if (evError) throw evError;

      // 4. Merge into unified logs
      const profileMap = {};
      (profilesData || []).forEach((p) => {
        profileMap[p.id] = p;
      });

      const eventMap = {};
      (eventsData || []).forEach((e) => {
        eventMap[e.id] = e;
      });

      const mergedLogs = rawAttendance.map((item) => ({
        ...item,
        profiles: profileMap[item.student_id] || {
          full_name: 'Unknown Student',
          student_id: 'N/A',
          course: 'COE',
        },
        events: eventMap[item.event_id] || null,
      }));

      setAttendanceLogs(mergedLogs);

      if (mergedLogs.length > 0) {
        setSelectedLog((prev) => {
          if (!prev) return mergedLogs[0];
          return mergedLogs.find((l) => l.id === prev.id) || mergedLogs[0];
        });
      } else {
        setSelectedLog(null);
      }
    } catch (err) {
      console.error('Error loading attendance logs:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handle manual attendance submission via RPC
const handleManualAttendanceSubmit = async (e) => {
    e.preventDefault();
    if (!manualEventId || !manualStudentId) {
      showToast('Please select both an event and a student.', 'error');
      return;
    }

    setManualSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('admin_override_attendance_present', {
        p_event_id: manualEventId,
        p_student_id: manualStudentId,
      });

      if (error) throw error;

      // Find student and event names for the audit log metadata
      const targetStudent = students.find((s) => s.id === manualStudentId);
      const targetEvent = events.find((ev) => ev.id === manualEventId);

      // Record system audit log for manual attendance assignment
      await logAdminAction({
        currentUser,
        actionType: 'MANUAL_ATTENDANCE_OVERRIDE',
        module: 'ATTENDANCE',
        targetId: manualStudentId,
        details: {
          student_name: targetStudent?.full_name || 'Unknown Student',
          student_number: targetStudent?.student_id || 'N/A',
          event_title: targetEvent?.title || 'Assembly Event',
        },
      });

      showToast('Student successfully marked present and any fines waived!');
      setManualModalOpen(false);
      setManualStudentId('');
      setManualStudentSearch('');
      await fetchAttendanceData();
    } catch (err) {
      showToast(err.message || 'Failed to record manual attendance.', 'error');
    } finally {
      setManualSubmitting(false);
    }
  };

  // Invalidate Attendance, assess fine, and record audit log
  const handleDeleteAttendance = async (log) => {
    const studentName = log.profiles?.full_name || 'this student';
    const eventTitle = log.events?.title || 'the event';
    const fineAmount = parseFloat(log.events?.fine_amount || 0);

    const confirmed = window.confirm(
      `Reject attendance proof for ${studentName}?\n\n` +
      `• The attendance record will be DELETED.\n` +
      `• The student will be marked ABSENT.\n` +
      `• An unpaid penalty of ₱${fineAmount.toFixed(2)} will be immediately applied for "${eventTitle}".`
    );

    if (!confirmed) return;

    try {
      setDeleting(true);
      const { data: res, error } = await supabase.rpc('admin_invalidate_attendance', {
        p_attendance_id: log.id,
      });

      if (error || (res && res.success === false)) {
        throw new Error(res?.message || error?.message || 'Failed to reject attendance.');
      }

      await logAdminAction({
        currentUser,
        actionType: 'REJECT_ATTENDANCE',
        module: 'ATTENDANCE',
        targetId: log.id,
        details: {
          student_name: studentName,
          student_id: log.profiles?.student_id,
          event_title: eventTitle,
          fine_issued: fineAmount,
        },
      });

      showToast(`Attendance rejected. ₱${fineAmount.toFixed(2)} fine applied to ${studentName}.`);
      await fetchAttendanceData();
    } catch (err) {
      showToast(err.message || 'Error invalidating attendance.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const filteredLogs = attendanceLogs.filter((log) => {
    const prof = log.profiles || {};
    const name = (prof.full_name || '').toLowerCase();
    const sId = (prof.student_id || '').toLowerCase();
    const course = prof.course || '';
    const year = prof.year_level?.toString() || '';

    const matchesSearch =
      name.includes(searchQuery.toLowerCase()) || sId.includes(searchQuery.toLowerCase());
    const matchesProgram = programFilter === 'ALL' || course === programFilter;
    const matchesYear = yearFilter === 'ALL' || year === yearFilter;

    return matchesSearch && matchesProgram && matchesYear;
  });

  // Filter student list inside the manual attendance modal search bar
  const filteredModalStudents = students.filter((stu) => {
    const name = (stu.full_name || '').toLowerCase();
    const sId = (stu.student_id || '').toLowerCase();
    const query = manualStudentSearch.toLowerCase();
    return name.includes(query) || sId.includes(query);
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto relative">
      {/* Toast Notification Banner */}
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

      {/* 1. TOP BAR WITH MANUAL ATTENDANCE BUTTON MOVED TO THE RIGHT CORNER */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Attendance Audit & Verification</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Inspect real-time student check-ins, verify selfie photo proofs, or manually assign attendance for past events.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          {/* Event Selector Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Event:</span>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full md:w-56 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 focus:border-[#8b0000] cursor-pointer"
            >
              <option value="ALL">All Events & Assemblies</option>
              {events.map((evt) => (
                <option key={evt.id} value={evt.id}>
                  {evt.title}
                </option>
              ))}
            </select>
          </div>

          {/* Manual Attendance Button (Top-Right Corner) */}
          <button
            onClick={() => setManualModalOpen(true)}
            className="px-4 py-2.5 bg-[#8b0000] hover:bg-[#700000] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition shadow-md shadow-[#8b0000]/20 flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <span>+ Manual Attendance</span>
          </button>
        </div>
      </div>

      {/* 2. FILTER & SEARCH BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col lg:flex-row gap-4 items-center justify-between">
        <div className="w-full lg:w-80 relative">
          <input
            type="text"
            placeholder="Search student number or name..."
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
            {['ALL', 'BSCE', 'BSEE', 'BSCpE'].map((dept) => (
              <button
                key={dept}
                onClick={() => setProgramFilter(dept)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  programFilter === dept ? 'bg-[#8b0000] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {dept}
              </button>
            ))}
          </div>

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
        </div>
      </div>

      {/* 3. TWO-PANE LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT PANE: ATTENDANCE RECORDS */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Logged Students ({filteredLogs.length})
            </span>
            <span className="text-[11px] font-bold text-slate-400">Click a record to inspect proof</span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
              Loading attendance logs...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-12 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
              No attendance records logged for this filter.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[620px] overflow-y-auto">
              {filteredLogs.map((log) => {
                const isSelected = selectedLog?.id === log.id;
                const student = log.profiles || {};
                const logTime = log.time_in || log.time_out || log.created_at;

                return (
                  <button
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className={`w-full p-4 flex items-center justify-between text-left transition cursor-pointer ${
                      isSelected ? 'bg-red-50/70 border-l-4 border-l-[#8b0000]' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-slate-200 border border-slate-300 flex-shrink-0 overflow-hidden flex items-center justify-center">
                        {student.avatar_url ? (
                          <img src={student.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <span className="font-black text-xs text-slate-600">
                            {student.full_name?.charAt(0) || 'S'}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{student.full_name || 'Registered Student'}</p>
                        <p className="text-[11px] font-mono text-slate-400">{student.student_id || 'ID Pending'}</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">
                          {student.course || 'COE'} • {student.year_level || ''}{student.section || ''}
                        </p>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0 ml-3">
                      <span className="inline-block px-2.5 py-1 bg-emerald-50 text-emerald-700 font-black text-[10px] uppercase rounded-md border border-emerald-200">
                        Logged: {new Date(logTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT PANE: DETAIL & SELFIE PHOTO PROOF DRAWER */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6 sticky top-6">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide">
              Verification & Photo Proof
            </h3>
            <span className="text-[10px] font-extrabold uppercase text-[#8b0000] bg-red-50 px-2 py-0.5 rounded border border-red-100">
              {selectedLog ? 'Inspecting Log' : 'No Selection'}
            </span>
          </div>

          {!selectedLog ? (
            <div className="py-12 text-center text-slate-400 text-xs font-semibold">
              Select a student from the list to view attendance photo proof and full records.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Profile Card Summary */}
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="w-12 h-12 rounded-full bg-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {selectedLog.profiles?.avatar_url ? (
                    <img src={selectedLog.profiles.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-black text-base text-slate-600">
                      {selectedLog.profiles?.full_name?.charAt(0) || 'S'}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-black text-slate-900 truncate">
                    {selectedLog.profiles?.full_name || 'Registered Student'}
                  </h4>
                  <p className="text-xs font-mono font-bold text-[#8b0000]">
                    {selectedLog.profiles?.student_id || 'ID Pending'}
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium truncate">
                    {selectedLog.events?.title || 'Assembly Event'}
                  </p>
                </div>
              </div>

              {/* Attendance Proof Photo Preview */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  📷 Selfie Attendance Proof
                </label>
                <div className="w-full h-64 rounded-2xl bg-slate-900 overflow-hidden border border-slate-200 flex items-center justify-center relative shadow-inner">
                  {selectedLog.proof_photo_url ? (
                    <img
                      src={selectedLog.proof_photo_url}
                      alt="Selfie Attendance Proof"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center p-4">
                      <span className="text-2xl">📸</span>
                      <p className="text-slate-400 text-xs font-semibold mt-1">
                        No selfie photo proof recorded (Manually assigned).
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Academic & Timestamps Audit */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Program</p>
                  <p className="font-black text-slate-800 mt-0.5">{selectedLog.profiles?.course || 'COE'}</p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Year & Section</p>
                  <p className="font-black text-slate-800 mt-0.5">
                    {selectedLog.profiles?.year_level ? `${selectedLog.profiles.year_level}th` : ''} - Sec {selectedLog.profiles?.section || ''}
                  </p>
                </div>

                <div className="col-span-2 p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                  <p className="text-[10px] font-bold text-emerald-700 uppercase">Time Logged At</p>
                  <p className="font-black text-emerald-900 mt-0.5">
                    {new Date(selectedLog.time_in || selectedLog.time_out || selectedLog.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </p>
                </div>
              </div>

              {/* Invalidate / Reject Attendance Button */}
              <div className="pt-2 border-t border-slate-100">
                <button
                  onClick={() => handleDeleteAttendance(selectedLog)}
                  disabled={deleting}
                  className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition shadow-md shadow-red-600/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>{deleting ? 'Processing...' : 'Reject Proof & Issue Fine'}</span>
                </button>
                <p className="text-[10px] text-slate-400 text-center font-medium mt-1.5">
                  Deletes check-in and immediately issues a ₱{parseFloat(selectedLog.events?.fine_amount || 0).toFixed(2)} fine.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MANUAL ATTENDANCE ASSIGNMENT MODAL WITH SEARCH BAR */}
      {manualModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <h3 className="font-black text-slate-800 uppercase tracking-wide text-sm">
                Manual Attendance Assignment
              </h3>
              <button
                onClick={() => setManualModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl leading-none cursor-pointer"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleManualAttendanceSubmit} className="space-y-4 mt-4 text-xs font-bold uppercase text-slate-700">
              <div>
                <label className="block mb-1.5">Select Event (Past or Present)</label>
                <select
                  required
                  value={manualEventId}
                  onChange={(e) => setManualEventId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 focus:border-[#8b0000]"
                >
                  <option value="">-- Choose Event / Assembly --</option>
                  {events.map((evt) => (
                    <option key={evt.id} value={evt.id}>
                      {evt.title} ({new Date(evt.start_time).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block mb-1.5">Search & Select Student</label>
                {/* Search Bar inside the Modal */}
                <input
                  type="text"
                  placeholder="Type student name or ID..."
                  value={manualStudentSearch}
                  onChange={(e) => setManualStudentSearch(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-normal text-slate-900 placeholder-slate-400 mb-2 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 focus:border-[#8b0000]"
                />
                
                <select
                  required
                  size={4}
                  value={manualStudentId}
                  onChange={(e) => setManualStudentId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 focus:border-[#8b0000]"
                >
                  <option value="">-- Choose Student from Results --</option>
                  {filteredModalStudents.map((stu) => (
                    <option key={stu.id} value={stu.id}>
                      {stu.full_name} ({stu.student_id || 'No ID'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 font-normal text-[11px] leading-relaxed">
                ℹ️ Recording attendance here will mark the student as **Present** for the chosen event (such as Soakfest) and automatically waive any associated fines.
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setManualModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={manualSubmitting}
                  className="px-5 py-2.5 bg-[#8b0000] hover:bg-[#700000] text-white font-bold rounded-xl tracking-wider uppercase transition shadow-md cursor-pointer"
                >
                  {manualSubmitting ? 'Recording...' : 'Mark Present'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}