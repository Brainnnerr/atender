import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Conditionally import expo-sqlite only if NOT on web
let SQLite = null;
let db = null;

if (Platform.OS !== 'web') {
  SQLite = require('expo-sqlite');
  db = SQLite.openDatabaseSync('atender_offline.db');
}

export function initOfflineDB() {
  if (Platform.OS === 'web') return; // Skip on web
  try {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS offline_attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT,
        student_id TEXT,
        proof_photo TEXT,
        timestamp TEXT
      );
    `);
  } catch (err) {
    console.log("SQLite init error:", err);
  }
}

export function queueOfflineAttendance(eventId, studentId, proofPhoto) {
  if (Platform.OS === 'web') {
    // Fallback for web testing via AsyncStorage
    AsyncStorage.getItem('@offline_scans').then((dataStr) => {
      const queue = dataStr ? JSON.parse(dataStr) : [];
      queue.push({ eventId, studentId, photoBase64: proofPhoto, timestamp: new Date().toISOString() });
      AsyncStorage.setItem('@offline_scans', JSON.stringify(queue));
    });
    return;
  }

  // Native SQLite logic
  const statement = db.prepareSync(
    `INSERT INTO offline_attendance (event_id, student_id, proof_photo, timestamp) VALUES (?, ?, ?, ?)`
  );
  try {
    statement.executeSync([eventId, studentId, proofPhoto, new Date().toISOString()]);
  } finally {
    statement.finalizeSync();
  }
}

export function getOfflineQueue() {
  if (Platform.OS === 'web') return []; // Handled in SettingsTab via AsyncStorage
  const result = db.getAllSync(`SELECT * FROM offline_attendance`);
  return result;
}

export function removeOfflineRecord(id) {
  if (Platform.OS === 'web') return;
  const statement = db.prepareSync(`DELETE FROM offline_attendance WHERE id = ?`);
  try {
    statement.executeSync([id]);
  } finally {
    statement.finalizeSync();
  }
}