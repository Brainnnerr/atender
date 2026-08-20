import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function SystemLogsTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    fetchLogs();

    // Real-time listener for incoming actions
    const channel = supabase
      .channel('realtime_audit_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, (payload) => {
        setLogs((prev) => [payload.new, ...prev]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(250);

      if (error) throw error;
      setLogs(data || []);
      if (data && data.length > 0) {
        setSelectedLog(data[0]);
      }
    } catch (err) {
      console.error('Error fetching system logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const getModuleBadge = (mod) => {
    switch (mod) {
      case 'EVENTS':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'ATTENDANCE':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'STUDENTS':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'REPORTS':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'ADMINS':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const filteredLogs = logs.filter((log) => {
    const q = searchQuery.toLowerCase().trim();
    const actor = (log.actor_name || '').toLowerCase();
    const email = (log.actor_email || '').toLowerCase();
    const action = (log.action_type || '').toLowerCase();

    const matchesSearch = actor.includes(q) || email.includes(q) || action.includes(q);
    const matchesModule = moduleFilter === 'ALL' || log.module === moduleFilter;

    return matchesSearch && matchesModule;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. TOP HEADER */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">System Audit & Officer Activity Logs</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Immutable log trail of all administrative actions, data edits, and audit reconciliations.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5"
        >
          ↻ Refresh Logs
        </button>
      </div>

      {/* 2. FILTER & SEARCH BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col lg:flex-row gap-4 items-center justify-between">
        <div className="w-full lg:w-96 relative">
          <input
            type="text"
            placeholder="Search officer name, email, or action..."
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

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {['ALL', 'EVENTS', 'ATTENDANCE', 'STUDENTS', 'REPORTS', 'ADMINS'].map((mod) => (
            <button
              key={mod}
              onClick={() => setModuleFilter(mod)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                moduleFilter === mod
                  ? 'bg-[#8b0000] text-white shadow-sm'
                  : 'bg-slate-50 text-slate-600 border border-slate-200/80 hover:text-slate-900'
              }`}
            >
              {mod}
            </button>
          ))}
        </div>
      </div>

      {/* 3. TWO-PANE LOG VIEWER */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT PANE: ACTION STREAM */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Recorded Events ({filteredLogs.length})
            </span>
            <span className="text-[11px] font-bold text-slate-400">Click a record to inspect payload</span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
              Streaming system logs...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-12 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
              No audit logs matching this filter.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
              {filteredLogs.map((log) => {
                const isSelected = selectedLog?.id === log.id;

                return (
                  <button
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className={`w-full p-4 flex items-center justify-between text-left transition cursor-pointer ${
                      isSelected ? 'bg-red-50/70 border-l-4 border-l-[#8b0000]' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex-shrink-0 flex items-center justify-center font-black text-xs text-slate-700">
                        {log.actor_name?.charAt(0) || 'A'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-slate-900 truncate">{log.actor_name}</p>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${getModuleBadge(log.module)}`}>
                            {log.module}
                          </span>
                        </div>
                        <p className="text-[11px] font-mono font-bold text-[#8b0000] mt-0.5">{log.action_type}</p>
                        <p className="text-[10px] text-slate-400 truncate">{log.actor_email}</p>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0 ml-3">
                      <span className="text-[10px] font-mono font-semibold text-slate-500 block">
                        {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span className="text-[9px] font-mono text-slate-400">
                        {new Date(log.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT PANE: AUDIT LOG INSPECTOR */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-5 sticky top-6">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide">
              Action Detail Inspector
            </h3>
            <span className="text-[10px] font-mono font-bold text-slate-400">
              {selectedLog ? `ID: ${selectedLog.id.slice(0, 8)}...` : 'No Selection'}
            </span>
          </div>

          {!selectedLog ? (
            <div className="py-12 text-center text-slate-400 text-xs font-semibold">
              Select an activity from the feed to view its execution payload.
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              {/* Actor Info Box */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Executed By</p>
                <p className="font-bold text-slate-900 text-sm">{selectedLog.actor_name}</p>
                <p className="font-mono text-[11px] text-[#8b0000]">{selectedLog.actor_email}</p>
              </div>

              {/* Action Metadata Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Module</p>
                  <p className="font-black text-slate-800 mt-0.5">{selectedLog.module}</p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Action Type</p>
                  <p className="font-mono font-bold text-slate-800 mt-0.5 truncate">{selectedLog.action_type}</p>
                </div>

                <div className="col-span-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Timestamp</p>
                  <p className="font-mono font-bold text-slate-800 mt-0.5">
                    {new Date(selectedLog.created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Target ID if exists */}
              {selectedLog.target_id && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Target Entity ID</p>
                  <p className="font-mono font-bold text-slate-800 mt-0.5 break-all">{selectedLog.target_id}</p>
                </div>
              )}

              {/* JSON Metadata Payload */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Detailed Payload / Metadata
                </p>
                <pre className="p-3.5 bg-slate-900 text-emerald-400 rounded-xl font-mono text-[11px] overflow-x-auto max-h-56">
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}