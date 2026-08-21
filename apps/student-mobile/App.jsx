import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { supabase } from './src/services/supabase';
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import StudentDashboard from './src/screens/StudentDashboard';

export default function App() {
  const [isSplashDone, setIsSplashDone] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    // 1. Check for persisted session on startup
    const checkActiveSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          // Fetch the full student profile linked to this user ID
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profile) {
            setCurrentUserProfile(profile);
          }
        }
      } catch (err) {
        console.warn('Session check error:', err);
      } finally {
        setCheckingSession(false);
      }
    };

    checkActiveSession();

    // 2. Listen for auth changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setCurrentUserProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 1. Show Splash Screen first
  if (!isSplashDone || checkingSession) {
    return <SplashScreen onFinish={() => setIsSplashDone(true)} />;
  }

  // 2. If logged in, render Student Dashboard
  if (currentUserProfile) {
    return (
      <>
        <StatusBar style="light" />
        <StudentDashboard
          profile={currentUserProfile}
          onSignOut={async () => {
            await supabase.auth.signOut();
            setCurrentUserProfile(null);
          }}
        />
      </>
    );
  }

  // 3. Otherwise show Login Screen
  return (
    <>
      <StatusBar style="light" />
      <LoginScreen onLoginSuccess={(profile) => setCurrentUserProfile(profile)} />
    </>
  );
}