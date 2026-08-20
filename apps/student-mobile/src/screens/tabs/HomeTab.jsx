import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function HomeTab({
  profile,
  events,
  attendanceRecords,
  totalFines,
  refreshing,
  onRefresh,
  onSignOut,
}) {
  return (
    <ScrollView
      style={styles.scrollArea}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#8b0000"
        />
      }
    >
      {/* Top Header */}
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.greetingSub}>ATENDER PORTAL</Text>
          <Text style={styles.greetingName}>
            Hello, {profile?.full_name?.split(' ')[0] || 'Student'} 
          </Text>
        </View>

        <TouchableOpacity onPress={onSignOut} style={styles.logoutPill} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={14} color="#8b0000" style={{ marginRight: 4 }} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Outstanding Fines Card */}
      <View style={styles.fineCard}>
        <View style={styles.fineHeader}>
          <Text style={styles.fineCardTitle}>Outstanding Fines</Text>
          <View style={styles.fineStatusTag}>
            <Text style={styles.fineStatusText}>
              {totalFines > 0 ? 'Action Needed' : 'Cleared'}
            </Text>
          </View>
        </View>
        <Text style={styles.fineAmount}>₱{totalFines.toFixed(2)}</Text>
        <Text style={styles.fineDescription}>
          {totalFines > 0
            ? 'Accumulated penalty for unexcused event absences.'
            : 'You have no outstanding event fines. Keep it up!'}
        </Text>
      </View>

      {/* Assemblies & Attendance Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Assemblies & Attendance</Text>
        <Text style={styles.sectionCount}>{events.length} Events</Text>
      </View>

      {events.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={36} color="#94a3b8" />
          <Text style={styles.emptyText}>No assemblies or events listed yet.</Text>
        </View>
      ) : (
        events.map((evt) => {
          const att = attendanceRecords[evt.id];
          const hasRecord = !!(att?.time_in || att?.time_out);
          const recordedTime = att?.time_in || att?.time_out;

          return (
            <View key={evt.id} style={styles.eventCard}>
              <View style={styles.eventHeaderRow}>
                <Text style={styles.eventTitle}>{evt.title}</Text>
                <View style={styles.penaltyBadge}>
                  <Text style={styles.penaltyBadgeText}>
                    ₱{parseFloat(evt.fine_amount || 0).toFixed(0)} Fine
                  </Text>
                </View>
              </View>

              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={13} color="#64748b" />
                <Text style={styles.eventLocation}> {evt.location || 'ESSU Gymnasium'}</Text>
              </View>

              <View style={styles.metaRow}>
                <Ionicons name="time-outline" size={13} color="#94a3b8" />
                <Text style={styles.eventTime}>
                  {' '}
                  {new Date(evt.start_time).toLocaleDateString()} •{' '}
                  {new Date(evt.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                  {new Date(evt.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>

              {/* Single Status Indicator: LOGGED vs NO RECORD */}
              <View style={styles.statusBoxContainer}>
                <View style={[styles.statusBox, hasRecord ? styles.statusBoxSuccess : styles.statusBoxPending]}>
                  <View style={styles.statusHeaderRow}>
                    <Text style={[styles.statusBoxLabel, hasRecord ? styles.statusTextSuccess : styles.statusTextPending]}>
                      {hasRecord ? '✓ LOGGED' : '○ NO RECORD'}
                    </Text>
                    {hasRecord && (
                      <Ionicons name="checkmark-circle" size={14} color="#059669" />
                    )}
                  </View>
                  <Text style={styles.statusBoxTime}>
                    {hasRecord
                      ? `Scanned at ${new Date(recordedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : 'Pending QR Scan'}
                  </Text>
                </View>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 22, paddingTop: 54, paddingBottom: 110 },
  topHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  greetingSub: { fontSize: 11, fontWeight: '800', color: '#8b0000', letterSpacing: 1.5 },
  greetingName: { fontSize: 22, fontWeight: '900', color: '#0f172a', marginTop: 2 },
  logoutPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12 },
  logoutText: { color: '#8b0000', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  fineCard: { backgroundColor: '#8b0000', borderRadius: 20, padding: 20, marginBottom: 24, elevation: 6 },
  fineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fineCardTitle: { color: '#fecaca', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  fineStatusTag: { backgroundColor: 'rgba(255, 255, 255, 0.2)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  fineStatusText: { color: '#ffffff', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  fineAmount: { color: '#ffffff', fontSize: 34, fontWeight: '900', marginTop: 8 },
  fineDescription: { color: '#fee2e2', fontSize: 12, fontWeight: '500', marginTop: 4, lineHeight: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: '#0f172a', textTransform: 'uppercase', letterSpacing: 1 },
  sectionCount: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  emptyContainer: { backgroundColor: '#ffffff', padding: 36, borderRadius: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#e2e8f0' },
  emptyText: { color: '#94a3b8', fontSize: 13, fontWeight: '600', marginTop: 8 },
  eventCard: { backgroundColor: '#ffffff', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1.5, borderColor: '#e2e8f0', elevation: 2 },
  eventHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  eventTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', flex: 1, paddingRight: 8 },
  penaltyBadge: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  penaltyBadgeText: { color: '#8b0000', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  eventLocation: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  eventTime: { color: '#94a3b8', fontSize: 11, fontWeight: '500' },
  statusBoxContainer: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderColor: '#f1f5f9' },
  statusBox: { width: '100%', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5 },
  statusBoxSuccess: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  statusBoxPending: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  statusHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBoxLabel: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  statusTextSuccess: { color: '#059669' },
  statusTextPending: { color: '#94a3b8' },
  statusBoxTime: { fontSize: 11, fontWeight: '700', color: '#334155', marginTop: 3 },
});