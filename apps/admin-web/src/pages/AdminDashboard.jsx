import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import fcoLogo from '../assets/FCO-LOGOO.png';

// Tab imports
import OverviewTab from './tabs/OverviewTab';
import StudentsTab from './tabs/StudentsTab';
import EventsTab from './tabs/EventsTab';
import AttendanceTab from './tabs/AttendanceTab';
import ReportsTab from './tabs/ReportsTab';
import AdminsTab from './tabs/AdminsTab';
import SystemLogsTab from './tabs/SystemLogsTab';

const SUPER_ADMIN_EMAIL = 'fcocoe92@gmail.com';

export default function AdminDashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [adminPermissions, setAdminPermissions] = useState(null);

  const isSuperAdmin = user?.email?.toLowerCase().trim() === SUPER_ADMIN_EMAIL;

  useEffect(() => {
    fetchCurrentAdminProfile();
  }, [user]);

  const fetchCurrentAdminProfile = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('profiles')
      .select('permissions')
      .eq('id', user.id)
      .single();

    if (data?.permissions) {
      setAdminPermissions(data.permissions);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    if (onLogout) onLogout();
  };

  // Base navigation definition
  const rawNavigationItems = [
    {
      id: 'overview',
      label: 'Overview',
      requiredPermission: null,
      superAdminOnly: false,
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    },
    {
      id: 'events',
      label: 'Events Management',
      requiredPermission: 'can_manage_events',
      superAdminOnly: false,
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: 'attendance',
      label: 'Attendance Records',
      requiredPermission: 'can_manage_attendance',
      superAdminOnly: false,
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    {
      id: 'reports',
      label: 'Reports & Audits',
      requiredPermission: 'can_view_reports',
      superAdminOnly: false,
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: 'students',
      label: 'Student Masterlist',
      requiredPermission: 'can_manage_students',
      superAdminOnly: false,
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      id: 'admins',
      label: 'Admin Accounts',
      requiredPermission: null,
      superAdminOnly: true, // ONLY fcocoe92@gmail.com can see this
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      id: 'logs',
      label: 'System Logs',
      requiredPermission: null,
      superAdminOnly: true, // ONLY fcocoe92@gmail.com can see this
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ];

  // Strictly filter navigation items:
  const navigationItems = rawNavigationItems.filter((item) => {
    // Hide superAdminOnly tabs completely from non-super admins
    if (item.superAdminOnly && !isSuperAdmin) {
      return false;
    }

    // Super admin has unrestricted access to all tabs
    if (isSuperAdmin) {
      return true;
    }

    // Secondary admins check their granted permissions
    if (!item.requiredPermission) return true;
    return !!adminPermissions?.[item.requiredPermission];
  });

  const renderActiveTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab />;
      case 'events':
        return <EventsTab currentUser={user} />;
      case 'attendance':
        return <AttendanceTab currentUser={user} />;
      case 'reports':
        return <ReportsTab currentUser={user} />;
      case 'students':
        return <StudentsTab currentUser={user} />;
      case 'admins':
        if (!isSuperAdmin) {
          return <OverviewTab />;
        }
        return <AdminsTab currentUser={user} />;
      case 'logs':
        if (!isSuperAdmin) {
          return <OverviewTab />;
        }
        return <SystemLogsTab />;
      default:
        return <OverviewTab />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 font-sans overflow-hidden">
      {/* 1. Sidebar */}
      <aside
        className={`${
          isSidebarOpen ? 'w-64' : 'w-20'
        } bg-white border-r border-slate-200 flex flex-col justify-between transition-all duration-300 ease-in-out select-none z-20 flex-shrink-0`}
      >
        <div>
          {/* Header & Toggle Button */}
          <div className="h-16 flex items-center px-4 justify-between border-b border-slate-100">
            {isSidebarOpen ? (
              <>
                <div className="flex items-center gap-3 overflow-hidden">
                  <img src={fcoLogo} alt="FCO Logo" className="w-8 h-8 object-contain flex-shrink-0" />
                  <div>
                    <h1 className="font-black text-base tracking-wider text-[#8b0000] leading-none">ATENDER</h1>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Admin Console</p>
                  </div>
                </div>

                <button
                  onClick={() => setIsSidebarOpen(false)}
                  title="Collapse sidebar"
                  className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsSidebarOpen(true)}
                title="Expand sidebar"
                className="w-full flex justify-center py-2 cursor-pointer"
              >
                <img src={fcoLogo} alt="FCO Logo" className="w-8 h-8 object-contain" />
              </button>
            )}
          </div>

          {/* Dynamic Navigation Links */}
          <nav className="p-3 space-y-1.5 mt-2">
            {navigationItems.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  title={!isSidebarOpen ? tab.label : undefined}
                  className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-[#8b0000] text-white shadow-md shadow-[#8b0000]/25'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {tab.icon}
                  {isSidebarOpen && <span className="truncate">{tab.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sign Out Button */}
        <div className="p-3 border-t border-slate-100">
          <button
            onClick={handleSignOut}
            title={!isSidebarOpen ? 'Sign Out' : undefined}
            className={`w-full flex items-center ${
              isSidebarOpen ? 'justify-start px-3.5' : 'justify-center px-0'
            } py-3 text-slate-600 hover:bg-red-50 hover:text-red-700 rounded-xl text-xs font-bold uppercase tracking-wider transition duration-150 border border-transparent hover:border-red-200 cursor-pointer`}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {isSidebarOpen && <span className="ml-3 truncate">Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 z-10 flex-shrink-0">
          <div>
            <h2 className="text-base font-black text-slate-800 uppercase tracking-wider">
              {navigationItems.find((item) => item.id === activeTab)?.label || 'Overview'}
            </h2>
          </div>

          <div className="flex flex-col items-end">
            <span className="text-xs font-bold text-slate-800">{user?.email}</span>
            <span className="text-[11px] font-bold text-[#8b0000] tracking-wide">
              {isSuperAdmin ? '★ Super Administrator' : 'Admin Officer'}
            </span>
          </div>
        </header>

        {/* Dynamic Body Content */}
        <main className="flex-1 overflow-y-auto p-8">
          {renderActiveTabContent()}
        </main>
      </div>
    </div>
  );
}