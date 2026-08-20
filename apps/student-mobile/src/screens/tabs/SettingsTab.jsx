import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../services/supabase';

export default function SettingsTab({ profile, onSignOut }) {
  // Password Modal State
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Show / Hide Password Visibility Toggles
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Offline Sync State
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadOfflineQueue();
  }, []);

  const loadOfflineQueue = async () => {
    try {
      const dataStr = await AsyncStorage.getItem('@offline_scans');
      const queue = dataStr ? JSON.parse(dataStr) : [];
      setOfflineQueue(queue);
    } catch {
      setOfflineQueue([]);
    }
  };

  const handleSyncOfflineData = async () => {
    if (offlineQueue.length === 0) {
      Alert.alert('All Synced', 'There are no pending offline attendance scans.');
      return;
    }

    setSyncing(true);
    let successCount = 0;
    const remainingQueue = [];

    for (const item of offlineQueue) {
      try {
        const { data: res, error: rpcErr } = await supabase.rpc('record_student_attendance', {
          p_event_id: item.eventId,
          p_student_id: item.studentId,
          p_proof_photo_url: item.photoBase64,
        });

        if (rpcErr || !res?.success) {
          remainingQueue.push(item);
        } else {
          successCount++;
        }
      } catch {
        remainingQueue.push(item);
      }
    }

    await AsyncStorage.setItem('@offline_scans', JSON.stringify(remainingQueue));
    setOfflineQueue(remainingQueue);
    setSyncing(false);

    if (successCount > 0) {
      Alert.alert(
        'Sync Complete',
        `Successfully synced ${successCount} attendance log(s) to the server!`
      );
    } else {
      Alert.alert(
        'Sync Incomplete',
        'Could not upload records. Check your internet connection.'
      );
    }
  };

  const handleChangePasswordSubmit = async () => {
    if (!currentPassword.trim() || !newPassword.trim()) {
      Alert.alert('Missing Fields', 'Please enter your current and new password.');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Weak Password', 'New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'New password and confirmation do not match.');
      return;
    }

    setChangingPassword(true);
    try {
      // Safe resolution of user ID (from profile prop or active auth session)
      let userId = profile?.id;
      if (!userId) {
        const { data: authData } = await supabase.auth.getUser();
        userId = authData?.user?.id;
      }

      if (!userId) {
        Alert.alert('Error', 'User session not found. Please log in again.');
        return;
      }

      const { data: res, error } = await supabase.rpc('student_change_password', {
        p_user_id: userId,
        p_current_password: currentPassword.trim(),
        p_new_password: newPassword.trim(),
      });

      if (error || !res?.success) {
        Alert.alert('Failed', res?.message || error?.message || 'Current password incorrect.');
        return;
      }

      Alert.alert('Success', 'Your password has been changed successfully.');
      setPasswordModalVisible(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    } catch (err) {
      Alert.alert('Error', err.message || 'An unexpected error occurred.');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.topHeader}>
        <Text style={styles.greetingSub}>SECURITY & PREFERENCES</Text>
        <Text style={styles.greetingName}>Account Settings</Text>
      </View>

      {/* 1. Offline Storage & Sync Card */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>Offline Attendance Sync</Text>
        <View style={styles.syncRow}>
          <View>
            <Text style={styles.syncTitle}>Pending Offline Scans</Text>
            <Text style={styles.syncSub}>
              {offlineQueue.length > 0
                ? `${offlineQueue.length} attendance record(s) queued for upload`
                : 'All scans synced with cloud server'}
            </Text>
          </View>
          <View style={[styles.badge, offlineQueue.length > 0 ? styles.badgePending : styles.badgeSuccess]}>
            <Text style={[styles.badgeText, offlineQueue.length > 0 ? styles.badgeTextPending : styles.badgeTextSuccess]}>
              {offlineQueue.length} QUEUED
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleSyncOfflineData}
          disabled={syncing || offlineQueue.length === 0}
          style={[styles.syncButton, (syncing || offlineQueue.length === 0) && styles.syncButtonDisabled]}
          activeOpacity={0.85}
        >
          {syncing ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <View style={styles.btnContent}>
              <Ionicons name="cloud-upload-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.syncButtonText}>Sync Scans Now</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* 2. Security & Account Actions */}
      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardHeader}>Security & Account</Text>

        <TouchableOpacity
          onPress={() => setPasswordModalVisible(true)}
          style={styles.settingsRow}
          activeOpacity={0.7}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="key-outline" size={18} color="#0f172a" style={styles.rowIcon} />
            <Text style={styles.rowTitle}>Change Password</Text>
          </View>
          <Ionicons name="chevron-forward-outline" size={18} color="#94a3b8" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onSignOut}
          style={[styles.settingsRow, { borderBottomWidth: 0 }]}
          activeOpacity={0.7}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="log-out-outline" size={18} color="#8b0000" style={styles.rowIcon} />
            <Text style={[styles.rowTitle, { color: '#8b0000' }]}>Sign Out</Text>
          </View>
          <Ionicons name="chevron-forward-outline" size={18} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* 3. Password Change Modal */}
      <Modal
        visible={passwordModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPasswordModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity onPress={() => setPasswordModalVisible(false)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Current Password Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Current Password</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={styles.passwordInput}
                  secureTextEntry={!showCurrentPassword}
                  placeholder="Enter current password"
                  placeholderTextColor="#94a3b8"
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                  style={styles.eyeBtn}
                >
                  <Ionicons
                    name={showCurrentPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color="#64748b"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* New Password Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>New Password (Min. 6 chars)</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={styles.passwordInput}
                  secureTextEntry={!showNewPassword}
                  placeholder="Enter new password"
                  placeholderTextColor="#94a3b8"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowNewPassword(!showNewPassword)}
                  style={styles.eyeBtn}
                >
                  <Ionicons
                    name={showNewPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color="#64748b"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Confirm Password Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Confirm New Password</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={styles.passwordInput}
                  secureTextEntry={!showConfirmPassword}
                  placeholder="Re-type new password"
                  placeholderTextColor="#94a3b8"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeBtn}
                >
                  <Ionicons
                    name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color="#64748b"
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setPasswordModalVisible(false)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleChangePasswordSubmit}
                disabled={changingPassword}
                style={styles.submitBtn}
              >
                {changingPassword ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Update</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 22, paddingTop: 54, paddingBottom: 110 },
  topHeader: { marginBottom: 20 },
  greetingSub: { fontSize: 11, fontWeight: '800', color: '#8b0000', letterSpacing: 1.5 },
  greetingName: { fontSize: 22, fontWeight: '900', color: '#0f172a', marginTop: 2 },
  card: { backgroundColor: '#ffffff', borderRadius: 20, padding: 18, borderWidth: 1.5, borderColor: '#e2e8f0' },
  cardHeader: { fontSize: 11, fontWeight: '900', color: '#8b0000', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  syncRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  syncTitle: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  syncSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  badgePending: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  badgeSuccess: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  badgeText: { fontSize: 10, fontWeight: '900' },
  badgeTextPending: { color: '#8b0000' },
  badgeTextSuccess: { color: '#059669' },
  syncButton: { backgroundColor: '#8b0000', height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  syncButtonDisabled: { opacity: 0.5 },
  btnContent: { flexDirection: 'row', alignItems: 'center' },
  syncButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  settingsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  rowLeft: { flexDirection: 'row', alignItems: 'center' },
  rowIcon: { marginRight: 10 },
  rowTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { backgroundColor: '#ffffff', width: '100%', maxWidth: 360, borderRadius: 20, padding: 20, borderWidth: 1.5, borderColor: '#e2e8f0' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 15, fontWeight: '900', color: '#0f172a' },
  inputGroup: { marginBottom: 12 },
  inputLabel: { fontSize: 10, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    fontSize: 13,
    color: '#0f172a',
  },
  eyeBtn: {
    paddingLeft: 8,
    paddingVertical: 4,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, height: 42, backgroundColor: '#f1f5f9', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { color: '#475569', fontSize: 12, fontWeight: '700' },
  submitBtn: { flex: 1, height: 42, backgroundColor: '#8b0000', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  submitBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
});