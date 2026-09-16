import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './src/services/supabase';
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import StudentDashboard from './src/screens/StudentDashboard';

export default function App() {
  const [isSplashDone, setIsSplashDone] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    // 1. Check for persisted student profile on app startup
    const checkActiveSession = async () => {
      try {
        const storedProfile = await AsyncStorage.getItem('@student_profile');
        if (storedProfile) {
          setCurrentUserProfile(JSON.parse(storedProfile));
        }
      } catch (err) {
        console.warn('Session load error:', err);
      } finally {
        setCheckingSession(false);
      }
    };

    checkActiveSession();
  }, []);

  // 1. Show Splash Screen first, or wait until session check finishes
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
            try {
              await AsyncStorage.removeItem('@student_profile');
              await supabase.auth.signOut();
            } catch (e) {
              console.warn('Sign out error:', e);
            } finally {
              setCurrentUserProfile(null);
            }
          }}
        />
      </>
    );
  }

  // 3. Otherwise show Login Screen
  return (
    <>
      <StatusBar style="light" />
      <LoginScreen
        onLoginSuccess={async (profile) => {
          try {
            // Save profile locally so it persists when the app closes
            await AsyncStorage.setItem('@student_profile', JSON.stringify(profile));
            setCurrentUserProfile(profile);
          } catch (err) {
            console.warn('Failed to save profile session:', err);
            setCurrentUserProfile(profile);
          }
        }}
      />
    </>
  );
}