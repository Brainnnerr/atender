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
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { supabase } from '../services/supabase';
import { initOfflineDB, queueOfflineAttendance } from '../services/offlineDb';
import { Html5QrcodeScanner } from 'html5-qrcode';

const { width, height } = Dimensions.get('window');

export default function QRScannerModal({ visible, profile, onClose, onScanComplete }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [step, setStep] = useState('SCAN'); // 'SCAN' | 'SELFIE' | 'UPLOADING'
  const [scannedData, setScannedData] = useState(null);
  const [facing, setFacing] = useState('back');
  const [validating, setValidating] = useState(false);
  const cameraRef = useRef(null);

  // Web browser webcam references for selfie capture
  const webVideoRef = useRef(null);
  const webCanvasRef = useRef(null);
  const [webMediaStream, setWebMediaStream] = useState(null);

  const stopWebcam = () => {
    if (webMediaStream) {
      webMediaStream.getTracks().forEach(track => track.stop());
      setWebMediaStream(null);
    }
  };

  useEffect(() => {
    if (visible) {
      initOfflineDB(); // Initialize table
      setScanned(false);
      setStep('SCAN');
      setScannedData(null);
      setFacing('back');
      setValidating(false);
      stopWebcam();

            if (Platform.OS === 'web') {
        // INJECT CUSTOM CSS TO STYLE PLAIN HTML5-QRCODE BUTTONS
        const customStyleId = 'html5-qrcode-custom-styles';
        if (!document.getElementById(customStyleId)) {
          const style = document.createElement('style');
          style.id = customStyleId;
          style.innerHTML = `
            #web-qr-reader-container button {
              background-color: #8b0000 !important;
              color: white !important;
              font-family: inherit !important;
              font-size: 11px !important;
              font-weight: 800 !important;
              text-transform: uppercase !important;
              letter-spacing: 0.5px !important;
              padding: 10px 18px !important;
              border: none !important;
              border-radius: 12px !important;
              cursor: pointer !important;
              box-shadow: 0 4px 12px rgba(139, 0, 0, 0.3) !important;
              margin-top: 10px !important;
              transition: background 0.2s ease !important;
            }
            #web-qr-reader-container button:hover {
              background-color: #a00000 !important;
            }
            #web-qr-reader-container select {
              background-color: #1f2937 !important;
              color: white !important;
              font-family: inherit !important;
              font-size: 11px !important;
              padding: 8px 12px !important;
              border: 1px solid rgba(255, 255, 255, 0.2) !important;
              border-radius: 10px !important;
              outline: none !important;
              margin-bottom: 10px !important;
            }
            #web-qr-reader-container__dashboard_section_csr button {
              background-color: #334155 !important;
            }
          `;
          document.head.appendChild(style);
        }

        setTimeout(() => {
          const scanner = new Html5QrcodeScanner(
            'web-qr-reader-container',
            { 
              fps: 10, 
              qrbox: { width: 250, height: 250 },
              facingMode: "environment"
            },
            false
          );
          scanner.render(
            (decodedText) => {
              scanner.clear().catch(err => console.warn('Scanner clear error:', err));
              handleBarcodeScanned({ data: decodedText });
            },
            (error) => {}
          );
        }, 300);
            }
      
    } else {
      stopWebcam();
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

      let eventData = null;
      let existingAttendance = null;

      // 1. TRY ONLINE LIVE CHECK FIRST
      try {
        const { data: liveEventData, error: evErr } = await supabase
          .from('events')
          .select('id, title, start_time, end_time, fine_amount, attendance_access')
          .eq('id', payload.eventId)
          .single();

        if (!evErr && liveEventData) {
          eventData = liveEventData;
        }

        const { data: liveAttendance, error: checkErr } = await supabase
          .from('attendance')
          .select('*')
          .eq('event_id', payload.eventId)
          .eq('student_id', profile.id)
          .maybeSingle();

        if (!checkErr) {
          existingAttendance = liveAttendance;
        }
      } catch (networkErr) {
        console.log('Network unreachable, switching to offline cache lookup...');
      }

      // 2. IF ONLINE FETCH FAILED, FALLBACK TO LOCAL ASYNCSTORAGE CACHE
      if (!eventData) {
        try {
          const cachedEventsStr = await AsyncStorage.getItem(`@cached_events_${profile.id}`);
          const cachedEvents = cachedEventsStr ? JSON.parse(cachedEventsStr) : [];
          eventData = cachedEvents.find(e => e.id === payload.eventId);
        } catch (e) {
          eventData = null;
        }

        if (!eventData) {
          Alert.alert('Offline Error', 'Event details not found locally. Please connect to the internet at least once before the event.');
          setScanned(false);
          setValidating(false);
          return;
        }
      }

      // Check local offline queue for duplicates if online check didn't catch it
      if (!existingAttendance) {
        try {
          const localQueueStr = await AsyncStorage.getItem('@offline_scans');
          const localQueue = localQueueStr ? JSON.parse(localQueueStr) : [];
          existingAttendance = localQueue.find(item => item.eventId === payload.eventId && item.studentId === profile.id);
        } catch (e) {
          existingAttendance = null;
        }
      }

      if (existingAttendance) {
        Alert.alert('Already Scanned', 'You have already checked in for this event!');
        if (onScanComplete) onScanComplete();
        onClose();
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

      if (!isOpen) {
        Alert.alert(
          'QR SCANNING LOCKED',
          now > end || access === 'force_closed'
            ? `SESSION EXPIRED: Attendance for "${eventData.title}" is CLOSED.`
            : `SESSION NOT STARTED: Attendance for "${eventData.title}" will open at ${new Date(eventData.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
        );

        if (onScanComplete) onScanComplete();
        onClose();
        return;
      }

      // Session is valid: proceed to verification selfie
      setScannedData(payload);
      setFacing('front');
      setStep('SELFIE');
      
      if (Platform.OS === 'web') {
        setTimeout(async () => {
          try {
            // Forces front camera for the selfie verification step
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            setWebMediaStream(stream);
            if (webVideoRef.current) webVideoRef.current.srcObject = stream;
          } catch (e) {
            alert('Camera access denied for selfie.');
          }
        }, 200);
      }

    } catch (err) {
      Alert.alert('Error', 'Unable to process QR code.');
      setScanned(false);
    } finally {
      setValidating(false);
    }
  };

  const handleTakeSelfie = async () => {
    setStep('UPLOADING');

    try {
      let photoBase64 = '';

      if (Platform.OS === 'web') {
        if (!webVideoRef.current || !webCanvasRef.current) throw new Error('Web camera not ready');
        const video = webVideoRef.current;
        const canvas = webCanvasRef.current;
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        photoBase64 = canvas.toDataURL('image/jpeg', 0.3);
        stopWebcam();
      } else {
        if (!cameraRef.current) return;
        const photo = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.2,
          skipProcessing: true,
        });
        photoBase64 = `data:image/jpeg;base64,${photo.base64}`;
      }

      // 1. Request GPS permission and get current location for geofencing validation
      let currentLat = null;
      let currentLon = null;

      try {
        if (Platform.OS === 'web') {
          const position = await new Promise((res, rej) => 
            navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true })
          );
          currentLat = position.coords.latitude;
          currentLon = position.coords.longitude;
        } else {
          let { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            currentLat = location.coords.latitude;
            currentLon = location.coords.longitude;
          }
        }
      } catch (locErr) {
        console.log('Location fetch warning:', locErr);
      }
      
      // 2. ATTEMPT ONLINE UPLOAD & GEOFENCING CHECK VIA SUPABASE RPC
      const { data: res, error: rpcErr } = await supabase.rpc('record_student_attendance', {
        p_event_id: scannedData.eventId,
        p_student_id: profile.id,
        p_proof_photo_url: photoBase64,
        p_latitude: currentLat,
        p_longitude: currentLon,
      });

      if (rpcErr || !res?.success) {
        throw new Error(res?.message || rpcErr?.message || 'Network request failed');
      }

      Alert.alert('Attendance Verified!', res.message || 'Your presence has been recorded to the server.');
      if (onScanComplete) onScanComplete();
      onClose();

    } catch (err) {
      if (err.message && err.message.toLowerCase().includes('out of range')) {
        Alert.alert('Out of Range 🚫', err.message);
        setStep('SELFIE');
        return;
      }

      console.log("Online upload failed, saving to offline queue...", err.message);

      try {
        if (Platform.OS === 'web') {
          throw new Error(err.message || 'Network request failed. Please check your connection.');
        }

        const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.1 });
        const fallbackBase64 = `data:image/jpeg;base64,${photo.base64}`;

        queueOfflineAttendance(scannedData.eventId, profile.id, fallbackBase64);

        Alert.alert(
          'Saved Offline 📴', 
          'No internet connection detected. Your attendance proof has been saved securely on your device and will sync automatically when you reconnect.'
        );

        if (onScanComplete) onScanComplete();
        onClose();
      } catch (offlineErr) {
        Alert.alert('Error', offlineErr.message || 'Could not process attendance.');
        setStep('SELFIE');
      }
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
        {Platform.OS === 'web' ? (
          <View style={styles.webContainer}>
            <View style={styles.topBar}>
              <View style={styles.headerBadge}>
                <Text style={styles.headerTitle}>
                  {step === 'SCAN' ? 'SCAN EVENT QR' : step === 'SELFIE' ? 'TAKE SELFIE' : 'PROCESSING'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => { stopWebcam(); onClose(); }} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {step === 'SCAN' && (
              <View style={styles.webScannerCard}>
                <Text style={styles.webInstructionText}>Align Event QR Code within frame</Text>
                <div id="web-qr-reader-container" style={{ width: '100%', borderRadius: '16px', overflow: 'hidden', background: '#000' }} />
              </View>
            )}

            {step === 'SELFIE' && (
              <View style={styles.webSelfieWrapper}>
                <Text style={styles.selfieGuideText}>Take a quick selfie to verify attendance</Text>
                <div style={{ width: '100%', maxWidth: '320px', aspectRatio: '3/4', background: '#000', borderRadius: '24px', overflow: 'hidden', position: 'relative', border: '2px solid rgba(255,255,255,0.2)', margin: '16px 0' }}>
                  <video ref={webVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                  <canvas ref={webCanvasRef} style={{ display: 'none' }} />
                </div>
                <TouchableOpacity onPress={handleTakeSelfie} style={styles.shutterBtn} activeOpacity={0.85}>
                  <View style={styles.shutterInner} />
                </TouchableOpacity>
              </View>
            )}

            {step === 'UPLOADING' && (
              <View style={styles.uploadingContainer}>
                <ActivityIndicator size="large" color="#ffffff" />
                <Text style={styles.uploadingText}>Verifying Location & Attendance...</Text>
              </View>
            )}
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

              {step === 'UPLOADING' && (
                <View style={styles.uploadingContainer}>
                  <ActivityIndicator size="large" color="#ffffff" />
                  <Text style={styles.uploadingText}>Verifying Location & Attendance...</Text>
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
  webContainer: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center', padding: 20 },
  webScannerCard: { width: '100%', maxWidth: '380px', backgroundColor: '#111827', borderRadius: 28, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  webSelfieWrapper: { alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: '380px', backgroundColor: '#111827', borderRadius: 28, padding: 20, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  webInstructionText: { color: '#ffffff', fontSize: 12, fontWeight: '700', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 },
  uploadingText: { color: '#ffffff', fontSize: 12, fontWeight: '800', marginTop: 14, textTransform: 'uppercase', letterSpacing: 1 },
  permText: { color: '#ffffff', fontSize: 13, textAlign: 'center', marginBottom: 20, lineHeight: 18 },
  permButton: { backgroundColor: '#8b0000', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, minWidth: 160, alignItems: 'center' },
  permButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
});
