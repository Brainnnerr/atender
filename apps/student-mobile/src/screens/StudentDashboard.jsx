import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';

import HomeTab from './tabs/HomeTab';
import ProfileTab from './tabs/ProfileTab';
import SettingsTab from './tabs/SettingsTab';
import QRScannerModal from './QRScannerModal';

export default function StudentDashboard({ profile: initialProfile, onSignOut }) {
  const [profile, setProfile] = useState(initialProfile || null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [scannerVisible, setScannerVisible] = useState(false);
  
  // NEW: State to track which scanner mode is active
  const [subOrgScannerActive, setSubOrgScannerActive] = useState(false);

  const [events, setEvents] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState({});
  const [totalFines, setTotalFines] = useState(0.0);

  // Sub-Organization States
  const [subOrgEvents, setSubOrgEvents] = useState([]);
  const [subOrgAttendance, setSubOrgAttendance] = useState({});
  const [subOrgFines, setSubOrgFines] = useState(0.0);

  const studentUserId = initialProfile?.id || profile?.id;

  useEffect(() => {
    loadDashboardData();

    if (!studentUserId) return;

    // Real-time synchronization for fines, events, and attendance changes
    const channel = supabase
      .channel(`student_realtime_${studentUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fines', filter: `student_id=eq.${studentUserId}` },
        () => loadDashboardData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance', filter: `student_id=eq.${studentUserId}` },
        () => loadDashboardData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => loadDashboardData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [studentUserId]);

  const loadDashboardData = async () => {
    try {
      if (!refreshing) setLoading(true);

      if (!studentUserId) {
        if (onSignOut) onSignOut();
        return;
      }

      const course = (profile?.course || '').toUpperCase();

      // 1. Fetch Main Fines
      const { data: finesData, error: finesErr } = await supabase
        .from('fines')
        .select('amount, status, event_id')
        .eq('student_id', studentUserId);

      let paidEventIds = [];
      let totalUnpaidSum = 0;

      if (!finesErr && finesData) {
        finesData.forEach((f) => {
          if (String(f.status || '').toLowerCase() === 'paid' && f.event_id) {
            paidEventIds.push(f.event_id);
          }
          if (['unpaid', 'pending_approval'].includes(String(f.status || '').toLowerCase())) {
            totalUnpaidSum += parseFloat(f.amount) || 0;
          }
        });
        setTotalFines(totalUnpaidSum);
        await AsyncStorage.setItem(`@cached_fines_${studentUserId}`, JSON.stringify(totalUnpaidSum));
      }

      // 2. Fetch Main FCO Events
      const { data: eventsData, error: eventsErr } = await supabase
        .from('events')
        .select('*')
        .eq('hidden_from_student', false)
        .order('start_time', { ascending: false });

      if (eventsErr) throw eventsErr;

      const activeEvents = (eventsData || []).filter(evt => !paidEventIds.includes(evt.id));
      if (activeEvents) {
        setEvents(activeEvents);
        await AsyncStorage.setItem(`@cached_events_${studentUserId}`, JSON.stringify(activeEvents));
      }

      // 3. FETCH SUB-ORG EVENTS DYNAMICALLY BASED ON STUDENT COURSE
      let subOrgEventsTable = 'pice_events';
      let subOrgAttendanceTable = 'pice_attendance';

      if (course.includes('BSEE') || course.includes('ELECTRICAL')) {
        subOrgEventsTable = 'iiee_events';
        subOrgAttendanceTable = 'iiee_attendance';
      } else if (course.includes('BSCE') || course.includes('CIVIL')) {
        subOrgEventsTable = 'pice_events';
        subOrgAttendanceTable = 'pice_attendance';
      }

      const { data: subOrgEventsData, error: subOrgErr } = await supabase
        .from(subOrgEventsTable)
        .select('*')
        .order('start_time', { ascending: false });

      if (!subOrgErr && subOrgEventsData) {
        setSubOrgEvents(subOrgEventsData);
        await AsyncStorage.setItem(`@cached_sub_events_${studentUserId}`, JSON.stringify(subOrgEventsData));
      }

      // 4. FETCH MAIN FCO ATTENDANCE LOGS
      const { data: attendanceData, error: attErr } = await supabase
        .from('attendance')
        .select('event_id, time_in, time_out, status')
        .eq('student_id', studentUserId);

      if (!attErr && attendanceData) {
        const attendanceMap = {};
        attendanceData.forEach((rec) => {
          attendanceMap[rec.event_id] = rec;
        });
        setAttendanceRecords(attendanceMap);
        await AsyncStorage.setItem(`@cached_attendance_${studentUserId}`, JSON.stringify(attendanceMap));
      }

      // 5. 🚀 NEW: FETCH SUB-ORG ATTENDANCE LOGS (PICE OR IIEE)
      const { data: subAttData, error: subAttErr } = await supabase
        .from(subOrgAttendanceTable)
        .select('event_id, time_in, time_out, status')
        .eq('student_id', studentUserId);

      if (!subAttErr && subAttData) {
        const subAttendanceMap = {};
        subAttData.forEach((rec) => {
          subAttendanceMap[rec.event_id] = rec;
        });
        setSubOrgAttendance(subAttendanceMap);
        await AsyncStorage.setItem(`@cached_sub_attendance_${studentUserId}`, JSON.stringify(subAttendanceMap));
      }

    } catch (err) {
      console.log('Offline fallback cache...', err.message);

      try {
        const cachedEvents = await AsyncStorage.getItem(`@cached_events_${studentUserId}`);
        const cachedSubEvents = await AsyncStorage.getItem(`@cached_sub_events_${studentUserId}`);
        const cachedAttendance = await AsyncStorage.getItem(`@cached_attendance_${studentUserId}`);
        const cachedSubAttendance = await AsyncStorage.getItem(`@cached_sub_attendance_${studentUserId}`);
        const cachedFines = await AsyncStorage.getItem(`@cached_fines_${studentUserId}`);

        if (cachedEvents) setEvents(JSON.parse(cachedEvents));
        if (cachedSubEvents) setSubOrgEvents(JSON.parse(cachedSubEvents));
        if (cachedAttendance) setAttendanceRecords(JSON.parse(cachedAttendance));
        if (cachedSubAttendance) setSubOrgAttendance(JSON.parse(cachedSubAttendance));
        if (cachedFines) setTotalFines(JSON.parse(cachedFines));
      } catch (cacheErr) {
        console.log('Error loading offline cache:', cacheErr);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Sign out error:', e);
    } finally {
      if (onSignOut) onSignOut();
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#8b0000" />
        <Text style={styles.loadingText}>Syncing Atender Feed...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

        {activeTab === 'home' && (
          <HomeTab
            profile={profile}
            events={events}
            attendanceRecords={attendanceRecords}
            totalFines={totalFines}
            subOrgEvents={subOrgEvents}
            subOrgAttendance={subOrgAttendance}
            subOrgFines={subOrgFines}
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadDashboardData();
            }}
            onSignOut={handleSignOut}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileTab 
            profile={profile} 
            onProfileUpdated={(updatedFields) => {
              if (updatedFields) {
                setProfile(updatedFields);
              }
              loadDashboardData();
            }} 
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab 
            profile={profile} 
            onSignOut={handleSignOut} 
            // NEW: Pass the handler to trigger Chapter Mode
            onOpenChapterScanner={() => {
              setSubOrgScannerActive(true);
              setScannerVisible(true);
            }}
          />
        )}

        {/* CURVED BOTTOM NAVBAR */}
        <View style={styles.bottomBarContainer}>
          <View style={styles.bottomBar}>
            {/* Home Tab */}
            <TouchableOpacity
              style={styles.navItem}
              onPress={() => setActiveTab('home')}
              activeOpacity={0.7}
            >
              <Ionicons
                name={activeTab === 'home' ? 'home' : 'home-outline'}
                size={22}
                color={activeTab === 'home' ? '#ffffff' : '#fca5a5'}
              />
              <Text style={[styles.navLabel, activeTab === 'home' && styles.navLabelActive]}>
                Home
              </Text>
            </TouchableOpacity>

            {/* Profile Tab */}
            <TouchableOpacity
              style={styles.navItem}
              onPress={() => setActiveTab('profile')}
              activeOpacity={0.7}
            >
              <Ionicons
                name={activeTab === 'profile' ? 'person' : 'person-outline'}
                size={22}
                color={activeTab === 'profile' ? '#ffffff' : '#fca5a5'}
              />
              <Text style={[styles.navLabel, activeTab === 'profile' && styles.navLabelActive]}>
                Profile
              </Text>
            </TouchableOpacity>

            {/* Settings Tab */}
            <TouchableOpacity
              style={styles.navItem}
              onPress={() => setActiveTab('settings')}
              activeOpacity={0.7}
            >
              <Ionicons
                name={activeTab === 'settings' ? 'settings' : 'settings-outline'}
                size={22}
                color={activeTab === 'settings' ? '#ffffff' : '#fca5a5'}
              />
              <Text style={[styles.navLabel, activeTab === 'settings' && styles.navLabelActive]}>
                Settings
              </Text>
            </TouchableOpacity>

            <View style={styles.navItemSpacer} />
          </View>

          {/* Elevated Circular QR Code Button (Main FCO Scanner) */}
          <TouchableOpacity
            style={styles.elevatedQrButton}
            activeOpacity={0.88}
            onPress={() => {
              // NEW: Ensure Sub-Org mode is explicitly disabled for the main scanner
              setSubOrgScannerActive(false); 
              setScannerVisible(true);
            }}
          >
            <View style={styles.qrIconInner}>
              <Ionicons name="qr-code-outline" size={28} color="#8b0000" />
            </View>
            <Text style={styles.qrButtonLabel}>Scan QR</Text>
          </TouchableOpacity>
        </View>

        {/* Fullscreen Camera Modal */}
        <QRScannerModal
          visible={scannerVisible}
          profile={profile}
          // NEW: Pass the mode down to the modal
          isSubOrgMode={subOrgScannerActive}
          onClose={() => {
            setScannerVisible(false);
            // Reset state upon closing just to be safe
            setSubOrgScannerActive(false);
          }}
          onScanComplete={loadDashboardData}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 12,
  },
  bottomBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  },
  bottomBar: {
    height: Platform.OS === 'ios' ? 84 : 72,
    backgroundColor: '#8b0000',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 20 : 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    paddingVertical: 4,
  },
  navItemSpacer: {
    width: 68,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fca5a5',
    marginTop: 3,
  },
  navLabelActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  elevatedQrButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? -22 : -24,
    right: 22,
    alignItems: 'center',
    zIndex: 999,
    elevation: 20,
  },
  qrIconInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ffffff',
    borderWidth: 3.5,
    borderColor: '#8b0000',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 12,
  },
  qrButtonLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#ffffff',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});