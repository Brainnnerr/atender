import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  StatusBar,
  Dimensions,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';

const { width, height } = Dimensions.get('window');

export default function QRScannerModal({ visible, profile, onClose, onScanComplete }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [step, setStep] = useState('SCAN'); // 'SCAN' | 'SELFIE' | 'UPLOADING'
  const [scannedData, setScannedData] = useState(null);
  const [facing, setFacing] = useState('back');
  const [validating, setValidating] = useState(false);
  const cameraRef = useRef(null);

  useEffect(() => {
    if (visible) {
      setScanned(false);
      setStep('SCAN');
      setScannedData(null);
      setFacing('back');
      setValidating(false);
    }
  }, [visible]);

  const handleBarcodeScanned = async ({ data }) => {
    if (scanned || step !== 'SCAN' || validating) return;
    setScanned(true);

    try {
      const payload = JSON.parse(data);
      if (!payload.eventId) {
        Alert.alert('Invalid QR', 'This is not an official Atender QR Stand.');
        setScanned(false);
        return;
      }

      setValidating(true);

      // Instant live database check
      const { data: eventData, error: evErr } = await supabase
        .from('events')
        .select('id, title, start_time, end_time, fine_amount, attendance_access')
        .eq('id', payload.eventId)
        .single();

      if (evErr || !eventData) {
        Alert.alert('Error', 'Event session could not be found.');
        setScanned(false);
        setValidating(false);
        return;
      }

      const now = new Date().getTime();
      const start = new Date(eventData.start_time).getTime();
      const end = new Date(eventData.end_time).getTime();
      const access = eventData.attendance_access || 'auto';

      let isOpen = false;
      if (access === 'force_open') isOpen = true;
      else if (access === 'force_closed') isOpen = false;
      else isOpen = now >= start && now <= end;

      // HARD REJECTION IF EXPIRED OR CLOSED
      if (!isOpen) {
        await supabase.rpc('process_expired_event_fines').catch(() => null);

        Alert.alert(
          'QR SCANNING LOCKED',
          now > end || access === 'force_closed'
            ? `SESSION EXPIRED: Attendance for "${eventData.title}" is CLOSED.\n\nYou have been marked absent and fined ₱${parseFloat(eventData.fine_amount || 0).toFixed(2)}.`
            : `SESSION NOT STARTED: Attendance for "${eventData.title}" will open at ${new Date(eventData.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
        );

        if (onScanComplete) onScanComplete();
        onClose();
        return;
      }

      // Session is OPEN: proceed to verification selfie
      setScannedData(payload);
      setFacing('front');
      setStep('SELFIE');
    } catch {
      Alert.alert('Error', 'Unable to process QR code.');
      setScanned(false);
    } finally {
      setValidating(false);
    }
  };

  const handleTakeSelfie = async () => {
    if (!cameraRef.current) return;
    setStep('UPLOADING');

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.2,
        skipProcessing: true,
      });

      const photoBase64 = `data:image/jpeg;base64,${photo.base64}`;

      const { data: res, error: rpcErr } = await supabase.rpc('record_student_attendance', {
        p_event_id: scannedData.eventId,
        p_student_id: profile.id,
        p_proof_photo_url: photoBase64,
      });

      if (rpcErr || !res?.success) {
        throw new Error(res?.message || rpcErr?.message || 'Attendance window closed');
      }

      Alert.alert('Attendance Verified!', 'Your presence has been recorded.');

      if (onScanComplete) onScanComplete();
      onClose();
    } catch (err) {
      Alert.alert('Upload Failed', err.message || 'Could not verify attendance proof.');
      setStep('SELFIE');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <View style={styles.fullScreenContainer}>
        {!permission ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#8b0000" />
          </View>
        ) : !permission.granted ? (
          <View style={styles.centerContainer}>
            <Ionicons name="camera-outline" size={54} color="#ffffff" style={{ marginBottom: 16 }} />
            <Text style={styles.permText}>Camera permission is required to scan attendance QR codes.</Text>
            <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
              <Text style={styles.permButtonText}>Grant Permission</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.permButton, { backgroundColor: '#64748b', marginTop: 10 }]} onPress={onClose}>
              <Text style={styles.permButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={StyleSheet.absoluteFillObject}>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFillObject}
              facing={facing}
              barcodeScannerSettings={step === 'SCAN' ? { barcodeTypes: ['qr'] } : undefined}
              onBarcodeScanned={step === 'SCAN' ? handleBarcodeScanned : undefined}
            />

            <View style={styles.overlay} pointerEvents="box-none">
              {/* Top Navigation Bar */}
              <View style={styles.topBar}>
                <View style={styles.headerBadge}>
                  <Text style={styles.headerTitle}>
                    {step === 'SCAN' ? 'SCAN EVENT QR' : step === 'SELFIE' ? 'TAKE ATTENDANCE SELFIE' : 'PROCESSING'}
                  </Text>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.8}>
                  <Ionicons name="close" size={24} color="#ffffff" />
                </TouchableOpacity>
              </View>

              {/* Dead Center Frame & Overlay */}
              {step === 'SCAN' && (
                <View style={styles.centerTargetContainer} pointerEvents="none">
                  <View style={styles.guideBox}>
                    <View style={[styles.corner, styles.topLeft]} />
                    <View style={[styles.corner, styles.topRight]} />
                    <View style={[styles.corner, styles.bottomLeft]} />
                    <View style={[styles.corner, styles.bottomRight]} />
                    <View style={styles.laserLine} />
                  </View>
                  <Text style={styles.guideText}>
                    {validating ? 'Verifying Live Access...' : 'Align Event QR Code within frame'}
                  </Text>
                </View>
              )}

              {/* Selfie Mode Shutter on Bottom */}
              {step === 'SELFIE' && (
                <View style={styles.bottomSelfieContainer}>
                  <Text style={styles.selfieGuideText}>
                    Take a quick selfie to verify attendance
                  </Text>
                  <TouchableOpacity onPress={handleTakeSelfie} style={styles.shutterBtn} activeOpacity={0.85}>
                    <View style={styles.shutterInner} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Uploading State */}
              {step === 'UPLOADING' && (
                <View style={styles.uploadingContainer}>
                  <ActivityIndicator size="large" color="#ffffff" />
                  <Text style={styles.uploadingText}>Verifying Attendance Window...</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullScreenContainer: { flex: 1, width, height, backgroundColor: '#000000' },
  centerContainer: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center', padding: 24 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', zIndex: 10 },
  topBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 50,
  },
  headerBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  headerTitle: { color: '#ffffff', fontSize: 12, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  centerTargetContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 20 },
  guideBox: {
    width: width * 0.72,
    height: width * 0.72,
    borderRadius: 24,
    backgroundColor: 'transparent',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  laserLine: {
    width: '90%',
    height: 2,
    backgroundColor: '#8b0000',
    shadowColor: '#ff0000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  corner: { position: 'absolute', width: 32, height: 32, borderColor: '#ffffff' },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 20 },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 20 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 20 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 20 },
  guideText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  bottomSelfieContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 50 : 36,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
  },
  selfieGuideText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
  },
  shutterBtn: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#8b0000' },
  uploadingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  uploadingText: { color: '#ffffff', fontSize: 12, fontWeight: '800', marginTop: 14, textTransform: 'uppercase', letterSpacing: 1 },
  permText: { color: '#ffffff', fontSize: 13, textAlign: 'center', marginBottom: 20, lineHeight: 18 },
  permButton: { backgroundColor: '#8b0000', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, minWidth: 160, alignItems: 'center' },
  permButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
});