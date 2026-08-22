import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

const SUPER_ADMIN_EMAIL = 'fcocoe92@gmail.com';

const DEFAULT_PERMISSIONS = {
  can_manage_events: true,
  can_manage_attendance: true,
  can_manage_students: true,
  can_view_reports: true,
};

const PERMISSION_DEFINITIONS = [
  { key: 'can_manage_events', title: 'Events Management', desc: 'Create assemblies, modify schedules, and generate QR stands' },
  { key: 'can_manage_attendance', title: 'Attendance Audit', desc: 'Inspect selfie proofs, check attendance records, and reject invalid check-ins' },
  { key: 'can_manage_students', title: 'Student Masterlist', desc: 'Register students, edit profiles, and reset student default passwords' },
  { key: 'can_view_reports', title: 'Official Reports', desc: 'Preview, export CSV files, and generate official PDF summary sheets' },
];

export default function AdminsTab({ currentUser }) {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Form States
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS);

  // Edit Permissions Modal States
  const [editPermModalOpen, setEditPermModalOpen] = useState(false);
  const [adminToEdit, setAdminToEdit] = useState(null);

  const isSuperAdmin = currentUser?.email?.toLowerCase().trim() === SUPER_ADMIN_EMAIL;

  useEffect(() => {
    fetchAdmins();
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'success' });
    }, 3500);
  };

  const fetchAdmins = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'admin')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAdmins(data || []);
    } catch (err) {
      console.error('Error fetching admins:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setFullName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setPermissions(DEFAULT_PERMISSIONS);
    setModalOpen(true);
  };

  const togglePermission = (key) => {
    setPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleOpenEditPermissions = (admin) => {
    setAdminToEdit(admin);
    setPermissions({
      ...DEFAULT_PERMISSIONS,
      ...(admin.permissions || {}),
    });
    setEditPermModalOpen(true);
  };

  const handleSubmitCreate = async (e) => {
    e.preventDefault();

    if (!fullName.trim() || !email.trim() || !password.trim()) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }

    if (password.length < 6) {
      showToast('Password must be at least 6 characters.', 'error');
      return;
    }

    if (password !== confirmPassword) {
      showToast('Passwords do not match.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const cleanEmail = email.trim().toLowerCase();

      // Call the registration RPC procedure
      const { data: res, error: rpcError } = await supabase.rpc('admin_register_admin_user', {
        p_email: cleanEmail,
        p_full_name: fullName.trim(),
        p_password: password.trim(),
        p_permissions: {
          ...permissions,
          can_manage_admins: false,
        },
      });

      if (rpcError || (res && res.success === false)) {
        throw new Error(res?.message || rpcError?.message || 'Failed to create admin.');
      }

      showToast(`Admin officer ${fullName} created successfully!`);
      setModalOpen(false);
      fetchAdmins();
    } catch (err) {
      showToast(err.message || 'Registration failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveUpdatedPermissions = async () => {
    if (!adminToEdit) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          permissions: { ...permissions, can_manage_admins: false },
          updated_at: new Date().toISOString(),
        })
        .eq('id', adminToEdit.id);

      if (error) throw error;

      showToast(`Permissions updated for ${adminToEdit.full_name}.`);
      setEditPermModalOpen(false);
      fetchAdmins();
    } catch (err) {
      showToast(err.message || 'Update failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAdmin = async (admin) => {
    if (admin.email?.toLowerCase() === SUPER_ADMIN_EMAIL) {
      showToast('The Primary Super Admin account cannot be deleted.', 'error');
      return;
    }

    if (admin.email === currentUser?.email) {
      showToast('You cannot delete your own active admin account.', 'error');
      return;
    }

    const confirmed = window.confirm(
      `Revoke privileges and delete ${admin.full_name} (${admin.email})?`
    );
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', admin.id);

      if (error) throw error;

      showToast(`Admin profile removed.`);
      fetchAdmins();
    } catch (err) {
      showToast(err.message || 'Failed to delete admin user.', 'error');
    }
  };

  const filteredAdmins = admins.filter((a) => {
    const q = searchQuery.toLowerCase().trim();
    const name = (a.full_name || '').toLowerCase();
    const mail = (a.email || '').toLowerCase();
    return name.includes(q) || mail.includes(q);
  });

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

      {/* 1. TOP HEADER & ACTION BAR */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-800 tracking-tight">System Administrators & Permission Control</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Full root access is reserved for <strong className="text-[#8b0000]">{SUPER_ADMIN_EMAIL}</strong>.
          </p>
        </div>

        {isSuperAdmin && (
          <button
            onClick={handleOpenCreateModal}
            className="px-5 py-3 bg-[#8b0000] hover:bg-[#700000] active:scale-[0.99] text-white font-bold text-xs uppercase tracking-widest rounded-xl transition shadow-md shadow-[#8b0000]/20 flex items-center gap-2 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            <span>Add Admin Officer</span>
          </button>
        )}
      </div>

      {/* 2. SEARCH BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="w-full sm:w-96 relative">
          <input
            type="text"
            placeholder="Search by name or email..."
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

        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Total Administrators: <strong className="text-slate-800">{admins.length}</strong>
        </span>
      </div>

      {/* 3. ADMIN LIST TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
            Loading administrator accounts...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Officer Profile</th>
                  <th className="px-6 py-4">Email Address</th>
                  <th className="px-6 py-4">Access Rights</th>
                  <th className="px-6 py-4">Account Type</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-xs">
                {filteredAdmins.map((item) => {
                  const isMainSuper = item.email?.toLowerCase().trim() === SUPER_ADMIN_EMAIL;
                  const isSelf = item.email === currentUser?.email;
                  const perms = item.permissions || {};

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-red-50 border border-red-200 flex-shrink-0 flex items-center justify-center">
                            <span className="font-black text-xs text-[#8b0000]">
                              {item.full_name?.charAt(0) || 'A'}
                            </span>
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm">
                              {item.full_name}
                              {isSelf && (
                                <span className="ml-2 text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                  You
                                </span>
                              )}
                            </p>
                            <p className="text-slate-400 font-mono text-[11px]">Administrator</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="font-bold text-slate-800 text-xs font-mono">{item.email}</span>
                      </td>

                      <td className="px-6 py-4">
                        {isMainSuper ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-red-50 text-[#8b0000] border border-red-200">
                            ★ Full Access
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {perms.can_manage_events && (
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[9px] font-bold uppercase">
                                Events
                              </span>
                            )}
                            {perms.can_manage_attendance && (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[9px] font-bold uppercase">
                                Attendance
                              </span>
                            )}
                            {perms.can_manage_students && (
                              <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded text-[9px] font-bold uppercase">
                                Students
                              </span>
                            )}
                            {perms.can_view_reports && (
                              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[9px] font-bold uppercase">
                                Reports
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4 font-mono text-slate-500 text-xs">
                        {isMainSuper ? (
                          <span className="font-black text-[#8b0000] uppercase text-[10px]">Super Admin</span>
                        ) : (
                          <span className="font-bold text-slate-600 uppercase text-[10px]">Officer</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right space-x-1.5">
                        {isSuperAdmin && !isMainSuper && (
                          <>
                            <button
                              onClick={() => handleOpenEditPermissions(item)}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] uppercase tracking-wider rounded-lg transition cursor-pointer"
                            >
                              Permissions
                            </button>
                            <button
                              onClick={() => handleDeleteAdmin(item)}
                              className="px-2.5 py-1.5 text-red-600 hover:text-red-800 font-bold uppercase text-[11px] rounded-lg transition hover:bg-red-50 cursor-pointer"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. REGISTER ADMIN MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-black text-slate-800 uppercase tracking-wide text-sm">
                  Register Administrator Officer
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Set login details and specify module permissions
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl leading-none cursor-pointer"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmitCreate} className="space-y-4 mt-5 text-xs font-bold uppercase text-slate-700">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1.5">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Officer Full Name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 focus:border-[#8b0000]"
                  />
                </div>

                <div>
                  <label className="block mb-1.5">Admin Email</label>
                  <input
                    type="email"
                    required
                    placeholder="officer@essu.edu.ph"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 focus:border-[#8b0000]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1.5">Login Password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Min. 6 chars"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 focus:border-[#8b0000]"
                  />
                </div>

                <div>
                  <label className="block mb-1.5">Confirm Password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 focus:border-[#8b0000]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showPass"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  className="w-4 h-4 accent-[#8b0000] cursor-pointer"
                />
                <label htmlFor="showPass" className="text-slate-600 text-xs font-semibold cursor-pointer normal-case">
                  Show Passwords
                </label>
              </div>

              {/* Permission Checkboxes */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <label className="block text-slate-800 font-black tracking-wider text-[11px]">
                  Assigned Module Permissions
                </label>
                <div className="space-y-2">
                  {PERMISSION_DEFINITIONS.map((def) => (
                    <label
                      key={def.key}
                      className="flex items-start gap-3 p-2.5 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200/80 cursor-pointer transition"
                    >
                      <input
                        type="checkbox"
                        checked={!!permissions[def.key]}
                        onChange={() => togglePermission(def.key)}
                        className="w-4 h-4 accent-[#8b0000] cursor-pointer mt-0.5"
                      />
                      <div>
                        <p className="text-xs font-bold text-slate-800 normal-case">{def.title}</p>
                        <p className="text-[10px] text-slate-500 font-normal normal-case">{def.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

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
                  {submitting ? 'Creating...' : 'Create Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. EDIT PERMISSIONS MODAL */}
      {editPermModalOpen && adminToEdit && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-black text-slate-800 uppercase tracking-wide text-sm">
                  Modify Access Permissions
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Update privileges for {adminToEdit.full_name}
                </p>
              </div>
              <button
                onClick={() => setEditPermModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl leading-none cursor-pointer"
              >
                ×
              </button>
            </div>

            <div className="space-y-2.5 my-5">
              {PERMISSION_DEFINITIONS.map((def) => (
                <label
                  key={def.key}
                  className="flex items-start gap-3 p-2.5 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200/80 cursor-pointer transition"
                >
                  <input
                    type="checkbox"
                    checked={!!permissions[def.key]}
                    onChange={() => togglePermission(def.key)}
                    className="w-4 h-4 accent-[#8b0000] cursor-pointer mt-0.5"
                  />
                  <div>
                    <p className="text-xs font-bold text-slate-800">{def.title}</p>
                    <p className="text-[10px] text-slate-500 font-medium">{def.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditPermModalOpen(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSaveUpdatedPermissions}
                className="px-5 py-2.5 bg-[#8b0000] hover:bg-[#700000] disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition shadow-md shadow-[#8b0000]/20 cursor-pointer"
              >
                {submitting ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}