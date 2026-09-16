import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient'; 
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';

export default function App() {
  const [sessionUser, setSessionUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check initial auth session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        verifyAdmin(session.user);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        verifyAdmin(session.user);
      } else {
        setSessionUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const verifyAdmin = async (user) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role === 'admin') {
      setSessionUser(user);
    } else {
      await supabase.auth.signOut();
      setSessionUser(null);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-xs font-bold tracking-widest text-slate-400 uppercase">Loading Atender...</p>
      </div>
    );
  }

  if (!sessionUser) {
    return <AdminLogin onLoginSuccess={(user) => setSessionUser(user)} />;
  }

  return <AdminDashboard user={sessionUser} onLogout={() => setSessionUser(null)} />;
}