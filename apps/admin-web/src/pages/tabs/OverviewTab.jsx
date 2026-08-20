import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function OverviewTab() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalStudents: 0,
    totalEvents: 0,
    activeEvents: 0,
    totalAttendanceScans: 0,
  });
  const [recentEvents, setRecentEvents] = useState([]);
  const [recentFines, setRecentFines] = useState([]);
  const [studentFineBalances, setStudentFineBalances] = useState([]);

  // Ledger Filter & Pagination States
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerProgram, setLedgerProgram] = useState('ALL');
  const [ledgerSort, setLedgerSort] = useState('highest_fine'); // 'highest_fine', 'lowest_fine', 'most_absences', 'name_asc'
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    fetchOverviewData();
  }, []);

  const fetchOverviewData = async () => {
    try {
      setLoading(true);

      // 1. Sync expired events and assess fines for absent students
      await supabase.rpc('sync_absent_student_fines');

      // 2. Total Registered Students
      const { count: studentCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'student');

      // 3. Events Counts
      const { data: eventsData } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false });

      // 4. Attendance Records Count
      const { count: attendanceCount } = await supabase
        .from('attendance')
        .select('*', { count: 'exact', head: true });

      // 5. Fines Aggregation & Per-Student Breakdown
      const { data: finesData } = await supabase
        .from('fines')
        .select('id, amount, status, created_at, student_id, profiles(full_name, student_id, course, year_level, section, avatar_url), events(title)')
        .order('created_at', { ascending: false });

      const studentMap = {};

      (finesData || []).forEach((fine) => {
        const val = parseFloat(fine.amount) || 0;

        if (fine.status === 'unpaid' || fine.status === 'pending_approval') {
          const sId = fine.student_id;
          if (!studentMap[sId]) {
            studentMap[sId] = {
              id: sId,
              studentId: fine.profiles?.student_id || 'N/A',
              fullName: fine.profiles?.full_name || 'Registered Student',
              course: fine.profiles?.course || 'COE',
              yearLevel: fine.profiles?.year_level || '',
              section: fine.profiles?.section || '',
              avatarUrl: fine.profiles?.avatar_url || null,
              totalDue: 0,
              absenceCount: 0,
            };
          }
          studentMap[sId].totalDue += val;
          studentMap[sId].absenceCount += 1;
        }
      });

      const rawBalances = Object.values(studentMap);

      setMetrics({
        totalStudents: studentCount || 0,
        totalEvents: eventsData?.length || 0,
        activeEvents: (eventsData || []).filter(e => new Date(e.start_time).getTime() <= Date.now() && new Date(e.end_time).getTime() >= Date.now()).length,
        totalAttendanceScans: attendanceCount || 0,
      });

      setStudentFineBalances(rawBalances);
      setRecentEvents((eventsData || []).slice(0, 4));
      setRecentFines((finesData || []).slice(0, 4));
    } catch (err) {
      console.error('Error loading analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  // Ledger Filter, Sort & Pagination Pipeline
  const filteredLedger = studentFineBalances
    .filter((student) => {
      const matchesSearch =
        student.fullName.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
        student.studentId.toLowerCase().includes(ledgerSearch.toLowerCase());
      const matchesProgram = ledgerProgram === 'ALL' || student.course === ledgerProgram;
      return matchesSearch && matchesProgram;
    })
    .sort((a, b) => {
      if (ledgerSort === 'highest_fine') return b.totalDue - a.totalDue;
      if (ledgerSort === 'lowest_fine') return a.totalDue - b.totalDue;
      if (ledgerSort === 'most_absences') return b.absenceCount - a.absenceCount;
      if (ledgerSort === 'name_asc') return a.fullName.localeCompare(b.fullName);
      return 0;
    });

  const totalPages = Math.ceil(filteredLedger.length / itemsPerPage) || 1;
  const paginatedLedger = filteredLedger.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  if (loading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center space-y-3">
        <div className="w-10 h-10 border-4 border-[#8b0000]/20 border-t-[#8b0000] rounded-full animate-spin" />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          Compiling Real-Time Analytics...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* 1. TOP HEADER CARD */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Executive Dashboard</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Real-time telemetry, student headcounts, and organizational revenue tracking.
          </p>
        </div>
        <button
          onClick={fetchOverviewData}
          className="self-start sm:self-auto px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer"
        >
          ↻ Refresh Data
        </button>
      </div>

      {/* 2. ANALYTICAL KPI CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Total Students */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Students</p>
            <p className="text-3xl font-black text-slate-900 mt-2">{metrics.totalStudents}</p>
            <span className="text-[11px] font-semibold text-emerald-600 mt-1 inline-block">Registered Profiles</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
        </div>

        {/* Total Events */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Events Conducted</p>
            <p className="text-3xl font-black text-blue-600 mt-2">{metrics.totalEvents}</p>
            <span className="text-[11px] font-semibold text-blue-500 mt-1 inline-block">{metrics.activeEvents} Active / Ongoing</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        </div>

        {/* Total Attendance Scans */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Check-Ins</p>
            <p className="text-3xl font-black text-emerald-600 mt-2">{metrics.totalAttendanceScans}</p>
            <span className="text-[11px] font-semibold text-emerald-600 mt-1 inline-block">Logged QR Scans</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
        </div>

        {/* College Info */}
        <div className="bg-gradient-to-br from-[#8b0000] to-[#590000] p-6 rounded-2xl shadow-sm text-white flex flex-col justify-between sm:col-span-2 lg:col-span-3">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-200 bg-white/10 px-2 py-0.5 rounded">
                Academic Unit
              </span>
              <h4 className="text-lg font-black mt-2">College of Engineering</h4>
              <p className="text-xs text-red-100 font-medium">Federated Class Organization</p>
            </div>
            <p className="text-[11px] text-red-200 text-right">Atender Automated Management</p>
          </div>
        </div>
      </div>

      {/* 3. STUDENT FINE LIABILITY ACCUMULATION TABLE (WITH SEARCH, FILTER & PAGINATION) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden space-y-4">
        {/* Ledger Header */}
        <div className="p-6 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">
              Student Fine Liability Ledger (Absence Summary)
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Accumulated sanctions owed by students with unexcused event absences
            </p>
          </div>
          <span className="self-start sm:self-auto px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold uppercase tracking-wider">
            {filteredLedger.length} Students Filtered
          </span>
        </div>

        {/* Filter Controls Bar */}
        <div className="px-6 pb-2 flex flex-col lg:flex-row gap-3 items-center justify-between">
          {/* Search Input */}
          <div className="w-full lg:w-80 relative">
            <input
              type="text"
              placeholder="Search liable student or ID..."
              value={ledgerSearch}
              onChange={(e) => {
                setLedgerSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 focus:border-[#8b0000]"
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

          {/* Department & Sort Controls */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
              {['ALL', 'BSCE', 'BSEE', 'BSCpE'].map((dept) => (
                <button
                  key={dept}
                  onClick={() => {
                    setLedgerProgram(dept);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    ledgerProgram === dept
                      ? 'bg-[#8b0000] text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {dept}
                </button>
              ))}
            </div>

            <select
              value={ledgerSort}
              onChange={(e) => setLedgerSort(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 cursor-pointer"
            >
              <option value="highest_fine">Highest Balance (₱)</option>
              <option value="lowest_fine">Lowest Balance (₱)</option>
              <option value="most_absences">Most Absences</option>
              <option value="name_asc">Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Ledger Table */}
        {filteredLedger.length === 0 ? (
          <div className="p-8 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
            No liable students found matching your criteria.
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 border-y border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Student Profile</th>
                    <th className="px-6 py-3.5">Program</th>
                    <th className="px-6 py-3.5">Year & Section</th>
                    <th className="px-6 py-3.5">Unexcused Absences</th>
                    <th className="px-6 py-3.5 text-right">Total Fine Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-xs">
                  {paginatedLedger.map((student) => (
                    <tr key={student.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center border border-slate-300">
                            {student.avatarUrl ? (
                              <img src={student.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                              <span className="font-black text-[11px] text-slate-600">
                                {student.fullName?.charAt(0) || 'S'}
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{student.fullName}</p>
                            <p className="text-slate-400 font-mono text-[11px]">{student.studentId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="font-bold text-slate-800">{student.course}</span>
                      </td>
                      <td className="px-6 py-3.5 font-mono text-slate-700">
                        {student.yearLevel ? `${student.yearLevel}${student.section}` : 'N/A'}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-50 text-red-700 border border-red-200">
                          {student.absenceCount} Absent {student.absenceCount === 1 ? 'Event' : 'Events'}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <span className="font-black text-sm text-[#8b0000]">
                          ₱{student.totalDue.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-slate-500 font-medium">
                Showing{' '}
                <span className="font-bold text-slate-800">
                  {(currentPage - 1) * itemsPerPage + 1}
                </span>{' '}
                to{' '}
                <span className="font-bold text-slate-800">
                  {Math.min(currentPage * itemsPerPage, filteredLedger.length)}
                </span>{' '}
                of <span className="font-bold text-slate-800">{filteredLedger.length}</span> students
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  Previous
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold transition cursor-pointer ${
                        currentPage === pageNum
                          ? 'bg-[#8b0000] text-white shadow-sm'
                          : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700'
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. DUAL ACTIVITY PREVIEW TABLES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Events Table */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">Recent Assemblies</h3>
            <span className="text-[11px] text-slate-400 font-bold uppercase">Latest 4</span>
          </div>

          {recentEvents.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No events listed yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentEvents.map((evt) => (
                <div key={evt.id} className="py-3 flex justify-between items-center">
                  <div>
                    <p className="text-xs font-bold text-slate-800">{evt.title}</p>
                    <p className="text-[11px] text-slate-400">{evt.location || 'Campus Hall'}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                      {evt.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Sanction Submissions */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">Fine Audit Feed</h3>
            <span className="text-[11px] text-slate-400 font-bold uppercase">Latest 4</span>
          </div>

          {recentFines.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No sanctions recorded.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentFines.map((fine, idx) => (
                <div key={idx} className="py-3 flex justify-between items-center">
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      {fine.profiles?.full_name || 'Engineering Student'}
                    </p>
                    <p className="text-[11px] text-slate-400">{fine.events?.title || 'General Event'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-[#8b0000]">₱{parseFloat(fine.amount).toFixed(2)}</p>
                    <span
                      className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                        fine.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {fine.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}