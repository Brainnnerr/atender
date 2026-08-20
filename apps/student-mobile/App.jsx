import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import StudentDashboard from './src/screens/StudentDashboard';

export default function App() {
  const [isSplashDone, setIsSplashDone] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);

  // 1. Show Splash Screen first
  if (!isSplashDone) {
    return <SplashScreen onFinish={() => setIsSplashDone(true)} />;
  }

  // 2. If logged in, render Student Dashboard
  if (currentUserProfile) {
    return (
      <>
        <StatusBar style="light" />
        <StudentDashboard
          profile={currentUserProfile}
          onSignOut={() => setCurrentUserProfile(null)}
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