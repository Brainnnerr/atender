import React, { useState, useEffect } from 'react';
import LandingPage from './LandingPage';
import Sidebar from './Sidebar';
import OverviewTab from './tabs/OverviewTab'; // <--- 1. IMPORT OVERVIEW TAB
import IIEEEventsTab from './tabs/IIEEEventsTab';
import IIEEMasterlistTab from './tabs/IIEEMasterlistTab';
import AttendanceTab from './tabs/AttendanceTab';
import FineManagementTab from './tabs/FineManagementTab'; 
import StudentSummaryTab from './tabs/StudentSummaryTab';
import ReportsTab from './tabs/ReportsTab';
import { supabase } from './services/supabase'; // Adjust path if your supabase client is located elsewhere

export default function App() {
  const [adminUser, setAdminUser] = useState(() => {
    const savedUser = localStorage.getItem('iiee_admin_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  
  const [currentTab, setCurrentTab] = useState('overview'); // Default landing tab set to overview
  const [collapsed, setCollapsed] = useState(false);

  // States for Overview analytics metrics
  const [students, setStudents] = useState([]);
  const [events, setEvents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [fines, setFines] = useState([]);

  useEffect(() => {
    if (adminUser) {
      localStorage.setItem('iiee_admin_user', JSON.stringify(adminUser));
      fetchOverviewData();
    } else {
      localStorage.removeItem('iiee_admin_user');
    }
  }, [adminUser]);

  const fetchOverviewData = async () => {
    try {
      const [stRes, evRes, attRes, fnRes] = await Promise.all([
        supabase.from('profiles').select('*').or('course.ilike.%BSEE%,course.ilike.%ELECTRICAL%'),
        supabase.from('iiee_events').select('*'),
        supabase.from('iiee_attendance').select('*'),
        supabase.from('iiee_fines').select('*')
      ]);

      setStudents(stRes.data || []);
      setEvents(evRes.data || []);
      setAttendance(attRes.data || []);
      setFines(fnRes.data || []);
    } catch (err) {
      console.error('Error loading overview data:', err);
    }
  };

  if (!adminUser) {
    return <LandingPage onLoginSuccess={(userData) => setAdminUser(userData)} />;
  }

  const renderContent = () => {
    switch (currentTab) {
      case 'overview':
        return (
          <OverviewTab 
            students={students}
            events={events}
            attendance={attendance}
            fines={fines}
            refreshData={fetchOverviewData}
            setCurrentTab={setCurrentTab}
          />
        );
      case 'events':
        return <IIEEEventsTab />;
      case 'masterlist':
        return <IIEEMasterlistTab />;
      case 'attendance':
        return <AttendanceTab currentUser={adminUser} />;
      case 'fines':
      case 'fine-management':
        return <FineManagementTab currentUser={adminUser} />;
      case 'summary':
      case 'student-summary':
        return <StudentSummaryTab currentUser={adminUser} />;
      case 'reports':
      case 'audit':
      case 'reports-audits':
        return <ReportsTab currentUser={adminUser} />;
      default:
        return (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748b', fontFamily: 'sans-serif' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase' }}>{currentTab}</h2>
            <p>This module is currently under development.</p>
          </div>
        );
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc', fontFamily: 'sans-serif' }}>
      <Sidebar 
        currentTab={currentTab} 
        setCurrentTab={setCurrentTab} 
        collapsed={collapsed} 
        setCollapsed={setCollapsed} 
        onSignOut={() => setAdminUser(null)} 
      />

      <div style={{ 
        flex: 1, 
        marginLeft: collapsed ? '80px' : '280px', 
        transition: 'margin-left 0.3s ease',
        padding: '24px'
      }}>
        {renderContent()}
      </div>
    </div>
  );
}