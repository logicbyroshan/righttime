import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { useColorScheme } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';

import {
  getActiveSession,
  getAttendanceHistory,
  getSessionEvents,
  getSessionBreaks,
  getSessionCorrections,
  checkIn,
  startBreak,
  endBreak,
  checkOut,
  recordCorrection,
  ActiveSessionDetails,
} from '@/db/attendanceRepo';
import {
  AttendanceSession,
  AttendanceEvent,
  BreakSession,
  AttendanceCorrection,
} from '@/db/types';

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatTime(isoString: string | null): string {
  if (!isoString) return '--:--';
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function AttendanceScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];

  const [refreshing, setRefreshing] = useState(false);
  const [activeSession, setActiveSession] = useState<ActiveSessionDetails | null>(null);
  const [history, setHistory] = useState<AttendanceSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<AttendanceSession | null>(null);
  const [sessionEvents, setSessionEvents] = useState<AttendanceEvent[]>([]);
  const [sessionBreaks, setSessionBreaks] = useState<BreakSession[]>([]);
  const [sessionCorrections, setSessionCorrections] = useState<AttendanceCorrection[]>([]);

  // Correction Modal State
  const [correctModalVisible, setCorrectModalVisible] = useState(false);
  const [correctReason, setCorrectReason] = useState('');
  const [correctStartTime, setCorrectStartTime] = useState('');
  const [correctEndTime, setCorrectEndTime] = useState('');
  const [correctNotes, setCorrectNotes] = useState('');

  const loadData = useCallback(() => {
    try {
      const active = getActiveSession();
      setActiveSession(active);

      const hist = getAttendanceHistory(50);
      setHistory(hist);

      if (selectedSession) {
        const events = getSessionEvents(selectedSession.id);
        const breaks = getSessionBreaks(selectedSession.id);
        const corrs = getSessionCorrections(selectedSession.id);
        setSessionEvents(events);
        setSessionBreaks(breaks);
        setSessionCorrections(corrs);
      }
    } catch (e: any) {
      console.error('Error loading attendance data:', e);
    }
  }, [selectedSession]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
    setRefreshing(false);
  }, [loadData]);

  const selectSessionDetails = (session: AttendanceSession) => {
    setSelectedSession(session);
    setSessionEvents(getSessionEvents(session.id));
    setSessionBreaks(getSessionBreaks(session.id));
    setSessionCorrections(getSessionCorrections(session.id));
  };

  const openCorrectionDialog = (session: AttendanceSession) => {
    setSelectedSession(session);
    setCorrectStartTime(session.start_time);
    setCorrectEndTime(session.end_time || '');
    setCorrectNotes(session.notes);
    setCorrectReason('');
    setCorrectModalVisible(true);
  };

  const handleSaveCorrection = () => {
    if (!selectedSession) return;
    if (!correctReason.trim()) {
      Alert.alert('Reason Required', 'Please provide an audit explanation for this correction.');
      return;
    }

    try {
      recordCorrection(selectedSession.id, correctReason.trim(), {
        startTime: correctStartTime ? correctStartTime.trim() : undefined,
        endTime: correctEndTime ? correctEndTime.trim() : undefined,
        notes: correctNotes,
      });
      setCorrectModalVisible(false);
      loadData();
      Alert.alert('Correction Saved', 'Session was updated and audit log preserved.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Attendance Ledger</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Personal, independent record of office punch intervals
          </Text>
        </View>

        {/* Current Active Controls */}
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>
            Live Punch Control
          </Text>
          {activeSession?.session ? (
            <View>
              <View style={styles.statusRow}>
                <Badge
                  label={activeSession.activeBreak ? 'ON BREAK' : 'IN PROGRESS'}
                  color={activeSession.activeBreak ? colors.warning : colors.success}
                />
                <Text style={[styles.statusTime, { color: colors.textSecondary }]}>
                  Since {formatTime(activeSession.session.start_time)}
                </Text>
              </View>

              <View style={styles.actionButtonsRow}>
                {!activeSession.activeBreak ? (
                  <Button
                    title="Start Break"
                    variant="warning"
                    size="md"
                    onPress={() => {
                      try {
                        startBreak();
                        loadData();
                      } catch (e: any) {
                        Alert.alert('Error', e.message);
                      }
                    }}
                    style={{ flex: 1, marginRight: 8 }}
                  />
                ) : (
                  <Button
                    title="End Break"
                    variant="primary"
                    size="md"
                    onPress={() => {
                      try {
                        endBreak();
                        loadData();
                      } catch (e: any) {
                        Alert.alert('Error', e.message);
                      }
                    }}
                    style={{ flex: 1, marginRight: 8 }}
                  />
                )}
                <Button
                  title="Check Out"
                  variant="danger"
                  size="md"
                  onPress={() => {
                    Alert.alert('Confirm Checkout', 'End this office session?', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Check Out',
                        style: 'destructive',
                        onPress: () => {
                          try {
                            checkOut();
                            loadData();
                          } catch (e: any) {
                            Alert.alert('Error', e.message);
                          }
                        },
                      },
                    ]);
                  }}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : (
            <View>
              <Text style={[styles.idleText, { color: colors.textSecondary }]}>
                No office session currently open.
              </Text>
              <Button
                title="Punch In Office"
                variant="primary"
                size="md"
                onPress={() => {
                  try {
                    checkIn();
                    loadData();
                  } catch (e: any) {
                    Alert.alert('Error', e.message);
                  }
                }}
                style={{ marginTop: 8 }}
              />
            </View>
          )}
        </Card>

        {/* History List */}
        <Text style={[styles.listHeader, { color: colors.text }]}>Attendance History</Text>
        {history.length === 0 ? (
          <EmptyState
            title="No Attendance History"
            description="Your recorded office days and corrections will be listed here."
            icon={<Ionicons name="folder-open-outline" size={36} color={colors.textSecondary} />}
          />
        ) : (
          history.map((session) => {
            const isSelected = selectedSession?.id === session.id;
            return (
              <TouchableOpacity
                key={session.id}
                activeOpacity={0.8}
                onPress={() => selectSessionDetails(session)}>
                <Card style={isSelected ? { borderColor: colors.primary, borderWidth: 1.5 } : undefined}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={[styles.workDate, { color: colors.text }]}>{session.work_date}</Text>
                      <Text style={[styles.timeRange, { color: colors.textSecondary }]}>
                        {formatTime(session.start_time)} → {formatTime(session.end_time)}
                      </Text>
                    </View>
                    <View style={styles.badgesCol}>
                      <Badge
                        label={session.status}
                        color={session.status === 'COMPLETED' ? colors.primary : colors.warning}
                      />
                      {session.source === 'WIFI_SUGGESTION' ? (
                        <Badge label="WI-FI" color={colors.success} bgColor="#10B98120" />
                      ) : null}
                      {session.is_corrected === 1 ? (
                        <Badge label="CORRECTED" color={colors.accent} bgColor="#6366F120" />
                      ) : null}
                    </View>
                  </View>

                  {session.notes ? (
                    <Text style={[styles.sessionNotes, { color: colors.textMuted }]}>
                      Notes: {session.notes}
                    </Text>
                  ) : null}

                  {/* Expanded Session Details */}
                  {isSelected && (
                    <View style={styles.expandedSection}>
                      <View style={styles.divider} />
                      <Text style={[styles.expandedTitle, { color: colors.text }]}>
                        Session Audit & Events
                      </Text>

                      {sessionEvents.map((ev) => (
                        <View key={ev.id} style={styles.eventRow}>
                          <Text style={[styles.eventTime, { color: colors.textSecondary }]}>
                            {formatTime(ev.timestamp)}
                          </Text>
                          <Text style={[styles.eventType, { color: colors.text }]}>
                            {ev.event_type}
                          </Text>
                          {ev.notes ? (
                            <Text style={[styles.eventNotes, { color: colors.textMuted }]}>
                              {ev.notes}
                            </Text>
                          ) : null}
                        </View>
                      ))}

                      {sessionCorrections.length > 0 && (
                        <View style={{ marginTop: 8 }}>
                          <Text style={[styles.corrHeader, { color: colors.accent }]}>
                            Audit Corrections:
                          </Text>
                          {sessionCorrections.map((c) => (
                            <Text key={c.id} style={[styles.corrText, { color: colors.textMuted }]}>
                              • {c.field_name}: {c.reason} ({c.old_value} → {c.new_value})
                            </Text>
                          ))}
                        </View>
                      )}

                      <Button
                        title="Manual Correction"
                        variant="outline"
                        size="sm"
                        onPress={() => openCorrectionDialog(session)}
                        style={{ marginTop: 12 }}
                      />
                    </View>
                  )}
                </Card>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Manual Correction Modal */}
      <Modal visible={correctModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Manual Correction</Text>
            <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
              Modifications are audited and require an explicit justification reason.
            </Text>

            <Input
              label="Reason (Required)"
              placeholder="e.g. Forgot checkout punch due to power cut"
              value={correctReason}
              onChangeText={setCorrectReason}
            />

            <Input
              label="Start Time (UTC ISO)"
              value={correctStartTime}
              onChangeText={setCorrectStartTime}
            />

            <Input
              label="End Time (UTC ISO)"
              value={correctEndTime}
              onChangeText={setCorrectEndTime}
            />

            <Input
              label="Notes"
              value={correctNotes}
              onChangeText={setCorrectNotes}
            />

            <View style={styles.modalButtonsRow}>
              <Button
                title="Cancel"
                variant="secondary"
                size="md"
                onPress={() => setCorrectModalVisible(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title="Save Correction"
                variant="primary"
                size="md"
                onPress={handleSaveCorrection}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  header: {
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statusTime: {
    fontSize: 13,
  },
  actionButtonsRow: {
    flexDirection: 'row',
  },
  idleText: {
    fontSize: 14,
    marginBottom: 8,
  },
  listHeader: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  workDate: {
    fontSize: 16,
    fontWeight: '700',
  },
  timeRange: {
    fontSize: 13,
    marginTop: 2,
  },
  badgesCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  sessionNotes: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
  expandedSection: {
    marginTop: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#1E293B50',
    marginBottom: 12,
  },
  expandedTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  eventTime: {
    fontSize: 12,
    width: 60,
  },
  eventType: {
    fontSize: 13,
    fontWeight: '600',
    marginRight: 8,
  },
  eventNotes: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  corrHeader: {
    fontSize: 12,
    fontWeight: '700',
  },
  corrText: {
    fontSize: 11,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000088',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalSub: {
    fontSize: 12,
    marginVertical: 6,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    marginTop: Spacing.md,
  },
});
