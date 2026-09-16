import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  CalendarDays, 
  ClipboardCheck, 
  Receipt, 
  Users, 
  BarChart3, 
  Contact, 
  LogOut,
  ChevronLeft
} from 'lucide-react';

export default function Sidebar({ currentTab, setCurrentTab, collapsed, setCollapsed, onSignOut }) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const menuItems = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={18} /> },
    { id: 'events', label: 'Events Management', icon: <CalendarDays size={18} /> },
    { id: 'attendance', label: 'Attendance Records', icon: <ClipboardCheck size={18} /> },
    { id: 'fines', label: 'Fine Management', icon: <Receipt size={18} /> },
    { id: 'summary', label: 'Student Summary', icon: <Users size={18} /> },
    { id: 'reports', label: 'Reports & Audits', icon: <BarChart3 size={18} /> },
    { id: 'masterlist', label: 'Student Masterlist', icon: <Contact size={18} /> },
  ];

  return (
    <>
      <aside style={{ 
        width: collapsed ? '80px' : '280px', 
        backgroundColor: '#ffffff', 
        borderRight: '1px solid #e2e8f0', 
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'space-between', 
        position: 'fixed', 
        top: 0, 
        bottom: 0, 
        left: 0,
        transition: 'width 0.3s ease',
        zIndex: 10
      }}>
        <div>
          {/* Header with Logo & Toggle */}
          <div style={{ padding: '20px 16px', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', borderBottom: '1px solid #f1f5f9', minHeight: '40px' }}>
            {!collapsed ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                  <img src="/PICE-LOGO.jpg" alt="PICE Logo" style={{ width: '34px', height: '34px', borderRadius: '50%', border: '1.5px solid #b45309', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '900', color: '#b45309' }}>ATENDER</div>
                    <div style={{ fontSize: '9px', fontWeight: '800', color: '#64748b', letterSpacing: '0.5px' }}>PICE CONTROL</div>
                  </div>
                </div>
                <button onClick={() => setCollapsed(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px', flexShrink: 0 }}>
                  <ChevronLeft size={20} />
                </button>
              </>
            ) : (
              <button onClick={() => setCollapsed(false)} title="Expand Sidebar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                <img src="/PICE-LOGO.jpg" alt="PICE Logo" style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1.5px solid #b45309' }} />
              </button>
            )}
          </div>

          {/* Navigation Items */}
          <nav style={{ padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {menuItems.map(item => {
              const active = currentTab === item.id;
              return (
                <button 
                  key={item.id}
                  onClick={() => setCurrentTab(item.id)} 
                  title={collapsed ? item.label : ''}
                  style={{ 
                    width: '100%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px', 
                    padding: collapsed ? '12px 0' : '12px 14px', 
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    backgroundColor: active ? '#b45309' : 'transparent', 
                    color: active ? '#ffffff' : '#334155', 
                    borderRadius: '10px', 
                    border: 'none', 
                    cursor: 'pointer', 
                    fontWeight: '800', 
                    fontSize: '12px', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.5px' 
                  }}
                >
                  {item.icon}
                  {!collapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sign Out Trigger */}
        <div style={{ padding: '16px 10px', borderTop: '1px solid #f1f5f9' }}>
          <button 
            onClick={() => setShowConfirmModal(true)} 
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: '10px', padding: '12px 14px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', fontWeight: '700', fontSize: '13px' }}
          >
            <LogOut size={18} color="#b45309" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, fontFamily: 'sans-serif' }}>
          <div style={{ backgroundColor: '#ffffff', padding: '32px', borderRadius: '20px', width: '380px', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#fef2f2', color: '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
              <LogOut size={24} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '900', color: '#0f172a', margin: '0 0 8px 0' }}>Sign Out Confirmation</h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 24px 0', lineHeight: '1.4' }}>Are you sure you want to sign out from the PICE Admin Console?</p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => setShowConfirmModal(false)}
                style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#334155', border: 'none', padding: '12px', borderRadius: '10px', fontWeight: '800', fontSize: '12px', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                No
              </button>
              <button 
                onClick={() => {
                  setShowConfirmModal(false);
                  if (onSignOut) onSignOut();
                }}
                style={{ flex: 1, backgroundColor: '#991b1b', color: '#ffffff', border: 'none', padding: '12px', borderRadius: '10px', fontWeight: '800', fontSize: '12px', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}