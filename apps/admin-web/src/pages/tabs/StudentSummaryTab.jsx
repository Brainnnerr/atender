import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function StudentSummaryTab() {
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [summaryData, setSummaryData] = useState({ events: [], attendanceMap: {}, fines: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStudentsList();
  }, []);

  useEffect(() => {
    if (selectedStudent) {
      fetchStudentDetails(selectedStudent.id);
    }
  }, [selectedStudent]);

  const fetchStudentsList = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, student_id, course, year_level, section, avatar_url, email')
        .eq('role', 'student')
        .order('full_name', { ascending: true });

      if (error) throw error;
      setStudents(data || []);
      if (data && data.length > 0) {
        setSelectedStudent(data[0]);
      }
    } catch (err) {
      console.error('Error fetching students:', err);
    }
  };

  const fetchStudentDetails = async (studentId) => {
    try {
      setLoading(true);

      const { data: eventsData, error: evErr } = await supabase
        .from('events')
        .select('*')
        .order('start_time', { ascending: false });
      if (evErr) throw evErr;

      const { data: attData, error: attErr } = await supabase
        .from('attendance')
        .select('*')
        .eq('student_id', studentId);
      if (attErr) throw attErr;

      const { data: finesData, error: fineErr } = await supabase
        .from('fines')
        .select('*')
        .eq('student_id', studentId);
      if (fineErr) throw fineErr;

      const attendanceMap = {};
      (attData || []).forEach((att) => {
        attendanceMap[att.event_id] = att;
      });

      setSummaryData({
        events: eventsData || [],
        attendanceMap,
        fines: finesData || [],
      });
    } catch (err) {
      console.error('Error loading student summary:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = students.filter((s) => {
    const name = (s.full_name || '').toLowerCase();
    const sId = (s.student_id || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    return name.includes(q) || sId.includes(q);
  });

  const totalEvents = summaryData.events.length;
  const attendedCount = Object.keys(summaryData.attendanceMap).length;
  const absentCount = Math.max(0, totalEvents - attendedCount);
  const totalUnpaidFines = summaryData.fines
    .filter((f) => f.status === 'unpaid' || f.status === 'pending_approval')
    .reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <h2 className="text-xl font-black text-slate-800 tracking-tight">Student Summary & Attendance Report</h2>
        <p className="text-xs text-slate-500 font-medium mt-0.5">
          Inspect individual event attendance history, absences, and financial penalties for each student.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left List */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col h-[700px]">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <input
              type="text"
              placeholder="Search student name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 focus:border-[#8b0000]"
            />
          </div>

          <div className="divide-y divide-slate-100 overflow-y-auto flex-1">
            {filteredStudents.length === 0 ? (
              <div className="p-8 text-center text-xs font-bold text-slate-400 uppercase">No students found</div>
            ) : (
              filteredStudents.map((stu) => {
                const isSelected = selectedStudent?.id === stu.id;
                return (
                  <button
                    key={stu.id}
                    onClick={() => setSelectedStudent(stu)}
                    className={`w-full p-3.5 flex items-center gap-3 text-left transition cursor-pointer ${
                      isSelected ? 'bg-red-50/80 border-l-4 border-l-[#8b0000]' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center border border-slate-300">
                      {stu.avatar_url ? (
                        <img src={stu.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span className="font-black text-xs text-slate-600">{stu.full_name?.charAt(0) || 'S'}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 truncate">{stu.full_name}</p>
                      <p className="text-[11px] font-mono text-slate-400">{stu.student_id}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Details Panel */}
        <div className="lg:col-span-8 space-y-6">
          {!selectedStudent ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-xs text-slate-400 font-bold uppercase">
              Select a student from the left list to inspect their record.
            </div>
          ) : (
            <>
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center border-2 border-[#8b0000]">
                    {selectedStudent.avatar_url ? (
                      <img src={selectedStudent.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-black text-xl text-slate-600">{selectedStudent.full_name?.charAt(0)}</span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">{selectedStudent.full_name}</h3>
                    <p className="text-xs font-mono font-bold text-[#8b0000]">{selectedStudent.student_id}</p>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {selectedStudent.course || 'COE'} • Year {selectedStudent.year_level || '1'} - Section {selectedStudent.section || 'A'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Attended Events</p>
                  <p className="text-2xl font-black text-emerald-600 mt-1">{attendedCount} / {totalEvents}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Absent / Unexcused</p>
                  <p className="text-2xl font-black text-red-600 mt-1">{absentCount}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Outstanding Fines</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">₱{totalUnpaidFines.toFixed(2)}</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Event Participation Breakdown</h4>
                </div>

                {loading ? (
                  <div className="p-12 text-center text-xs font-bold text-slate-400 uppercase">Loading student history...</div>
                ) : summaryData.events.length === 0 ? (
                  <div className="p-12 text-center text-xs font-bold text-slate-400 uppercase">No events registered in system.</div>
                ) : (
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                      <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase">
                        <tr>
                          <th className="px-5 py-3">Event Title</th>
                          <th className="px-5 py-3">Schedule</th>
                          <th className="px-5 py-3">Status</th>
                          <th className="px-5 py-3 text-right">Time Logged</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-xs">
                        {summaryData.events.map((evt) => {
                          const att = summaryData.attendanceMap[evt.id];
                          const hasAttended = !!(att?.time_in || att?.time_out);

                          return (
                            <tr key={evt.id} className="hover:bg-slate-50/50">
                              <td className="px-5 py-3.5 font-bold text-slate-900">{evt.title}</td>
                              <td className="px-5 py-3.5 text-slate-500">
                                {new Date(evt.start_time).toLocaleDateString()} •{' '}
                                {new Date(evt.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="px-5 py-3.5">
                                {hasAttended ? (
                                  <span className="inline-block px-2.5 py-1 bg-emerald-50 text-emerald-700 font-black text-[10px] uppercase rounded border border-emerald-200">
                                    ✓ Present
                                  </span>
                                ) : (
                                  <span className="inline-block px-2.5 py-1 bg-red-50 text-red-700 font-black text-[10px] uppercase rounded border border-red-200">
                                    ✕ Absent
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-3.5 text-right font-mono text-slate-500">
                                {hasAttended
                                  ? new Date(att.time_in || att.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                  : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}