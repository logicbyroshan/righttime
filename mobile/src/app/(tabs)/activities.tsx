import React, { useState, useEffect, useCallback } from 'react';
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
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';

import {
  getActivities,
  createActivity,
  updateActivity,
  getActiveTimer,
  startTimer,
  stopTimer,
  addManualEntry,
  getTodayActivitiesSummary,
  getEntriesForDate,
  deleteEntry,
  ActiveTimerInfo,
  ActivitySummaryItem,
} from '@/db/activitiesRepo';
import { Activity, ActivityEntry } from '@/db/types';

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

const PRESET_COLORS = ['#38BDF8', '#818CF8', '#34D399', '#FBBF24', '#F87171', '#A78BFA', '#F472B6'];

export default function ActivitiesScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];

  const [refreshing, setRefreshing] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [summary, setSummary] = useState<ActivitySummaryItem[]>([]);
  const [todayEntries, setTodayEntries] = useState<(ActivityEntry & { activity_name: string; activity_color: string })[]>([]);
  const [activeTimer, setActiveTimer] = useState<ActiveTimerInfo | null>(null);

  // Create Activity Modal
  const [activityModalVisible, setActivityModalVisible] = useState(false);
  const [activityName, setActivityName] = useState('');
  const [activityCategory, setActivityCategory] = useState('Work');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);

  // Manual Entry Modal
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualActivityId, setManualActivityId] = useState('');
  const [manualStartTime, setManualStartTime] = useState('');
  const [manualEndTime, setManualEndTime] = useState('');
  const [manualNotes, setManualNotes] = useState('');

  const loadData = useCallback(() => {
    try {
      const acts = getActivities(false);
      setActivities(acts);

      const sum = getTodayActivitiesSummary();
      setSummary(sum);

      const todayStr = new Date().toISOString().split('T')[0];
      const entries = getEntriesForDate(todayStr);
      setTodayEntries(entries);

      const timer = getActiveTimer();
      setActiveTimer(timer);
    } catch (e: any) {
      console.error('Error loading activities:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Live timer interval
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeTimer?.entry) {
        const timer = getActiveTimer();
        setActiveTimer(timer);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTimer?.entry]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleStartTimer = (activityId: string) => {
    try {
      startTimer(activityId);
      loadData();
    } catch (e: any) {
      Alert.alert('Cannot Start Timer', e.message);
    }
  };

  const handleStopTimer = () => {
    if (!activeTimer?.entry) return;
    try {
      stopTimer(activeTimer.entry.id);
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleSaveActivity = () => {
    if (!activityName.trim()) {
      Alert.alert('Name Required', 'Please enter an activity name.');
      return;
    }
    try {
      createActivity(activityName, activityCategory, selectedColor);
      setActivityName('');
      setActivityModalVisible(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleOpenManualEntry = (actId: string) => {
    setManualActivityId(actId);
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    setManualStartTime(oneHourAgo.toISOString());
    setManualEndTime(now.toISOString());
    setManualNotes('');
    setManualModalVisible(true);
  };

  const handleSaveManualEntry = () => {
    if (!manualActivityId) return;
    try {
      addManualEntry(manualActivityId, manualStartTime.trim(), manualEndTime.trim(), manualNotes.trim());
      setManualModalVisible(false);
      loadData();
      Alert.alert('Success', 'Manual time entry saved.');
    } catch (e: any) {
      Alert.alert('Validation Error', e.message);
    }
  };

  const handleDeleteEntry = (entryId: string) => {
    Alert.alert('Confirm Deletion', 'Are you sure you want to delete this time entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteEntry(entryId);
          loadData();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>Activities & Timers</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Task intervals, projects, and live stopwatch tracking
            </Text>
          </View>
          <Button
            title="+ New Activity"
            variant="primary"
            size="sm"
            onPress={() => setActivityModalVisible(true)}
          />
        </View>

        {/* Live Timer Hero Banner if running */}
        {activeTimer?.entry ? (
          <Card style={[styles.activeTimerCard, { borderColor: colors.primary }]}>
            <View style={styles.activeTimerHeader}>
              <View style={styles.timerTag}>
                <View
                  style={[
                    styles.colorDot,
                    { backgroundColor: activeTimer.activity?.color || colors.primary },
                  ]}
                />
                <Text style={[styles.timerName, { color: colors.text }]}>
                  {activeTimer.activity?.name}
                </Text>
              </View>
              <Text style={[styles.timerValue, { color: colors.primary }]}>
                {formatDuration(activeTimer.elapsedSeconds)}
              </Text>
            </View>
            <Button
              title="Stop Timer"
              variant="danger"
              size="md"
              onPress={handleStopTimer}
              icon={<Ionicons name="stop-circle-outline" size={20} color="#FFFFFF" />}
              style={{ marginTop: 12 }}
            />
          </Card>
        ) : null}

        {/* Available Activities Section */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Trackable Activities</Text>
        {activities.length === 0 ? (
          <EmptyState
            title="No Activities Created Yet"
            description="Create categories like Deep Work, Reading, or Client Projects."
            action={
              <Button
                title="Create First Activity"
                variant="primary"
                size="md"
                onPress={() => setActivityModalVisible(true)}
              />
            }
          />
        ) : (
          activities.map((act) => {
            const isRunning = activeTimer?.entry?.activity_id === act.id;
            return (
              <Card key={act.id} style={styles.activityCard}>
                <View style={styles.activityCardHeader}>
                  <View style={styles.activityCardLeft}>
                    <View style={[styles.colorSquare, { backgroundColor: act.color }]} />
                    <View>
                      <Text style={[styles.actName, { color: colors.text }]}>{act.name}</Text>
                      <Text style={[styles.actCat, { color: colors.textSecondary }]}>
                        {act.category}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.actActionsRow}>
                    <TouchableOpacity
                      onPress={() => handleOpenManualEntry(act.id)}
                      style={[styles.iconButton, { backgroundColor: colors.backgroundSelected }]}>
                      <Ionicons name="create-outline" size={18} color={colors.text} />
                    </TouchableOpacity>

                    {isRunning ? (
                      <Button
                        title="Stop"
                        variant="danger"
                        size="sm"
                        onPress={handleStopTimer}
                      />
                    ) : (
                      <Button
                        title="Start"
                        variant="primary"
                        size="sm"
                        onPress={() => handleStartTimer(act.id)}
                        disabled={!!activeTimer?.entry}
                        icon={<Ionicons name="play" size={14} color={colors.primaryContrast} />}
                      />
                    )}
                  </View>
                </View>
              </Card>
            );
          })
        )}

        {/* Today's Logged Entries */}
        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: Spacing.lg }]}>
          Today's Logged Intervals
        </Text>
        {todayEntries.length === 0 ? (
          <EmptyState
            title="No Completed Intervals Today"
            description="Completed timers and manual entries will appear here."
            icon={<Ionicons name="time-outline" size={32} color={colors.textSecondary} />}
          />
        ) : (
          todayEntries.map((ent) => (
            <Card key={ent.id} style={styles.entryCard}>
              <View style={styles.entryRow}>
                <View style={styles.entryLeft}>
                  <View style={[styles.colorDot, { backgroundColor: ent.activity_color }]} />
                  <View>
                    <Text style={[styles.entryName, { color: colors.text }]}>
                      {ent.activity_name}
                    </Text>
                    <Text style={[styles.entryTime, { color: colors.textSecondary }]}>
                      {new Date(ent.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {' → '}
                      {ent.end_time
                        ? new Date(ent.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : 'Running'}
                    </Text>
                  </View>
                </View>

                <View style={styles.entryRight}>
                  <Text style={[styles.entryDuration, { color: colors.primary }]}>
                    {formatDuration(ent.duration_seconds)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleDeleteEntry(ent.id)}
                    style={{ marginLeft: 12 }}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      {/* Create Activity Modal */}
      <Modal visible={activityModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Create Activity</Text>
            <Input
              label="Activity Name"
              placeholder="e.g. System Design, Code Review, Reading"
              value={activityName}
              onChangeText={setActivityName}
            />
            <Input
              label="Category"
              placeholder="e.g. Work, Study, Health"
              value={activityCategory}
              onChangeText={setActivityCategory}
            />
            <Text style={[styles.colorPickerLabel, { color: colors.textSecondary }]}>Color Accent</Text>
            <View style={styles.colorRow}>
              {PRESET_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setSelectedColor(c)}
                  style={[
                    styles.colorOption,
                    { backgroundColor: c },
                    selectedColor === c && { borderColor: '#FFFFFF', borderWidth: 2.5 },
                  ]}
                />
              ))}
            </View>

            <View style={styles.modalButtonsRow}>
              <Button
                title="Cancel"
                variant="secondary"
                size="md"
                onPress={() => setActivityModalVisible(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title="Create"
                variant="primary"
                size="md"
                onPress={handleSaveActivity}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Manual Entry Modal */}
      <Modal visible={manualModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Add Manual Entry</Text>
            <Input
              label="Start Time (UTC ISO)"
              value={manualStartTime}
              onChangeText={setManualStartTime}
            />
            <Input
              label="End Time (UTC ISO)"
              value={manualEndTime}
              onChangeText={setManualEndTime}
            />
            <Input
              label="Notes"
              placeholder="Description of work done"
              value={manualNotes}
              onChangeText={setManualNotes}
            />

            <View style={styles.modalButtonsRow}>
              <Button
                title="Cancel"
                variant="secondary"
                size="md"
                onPress={() => setManualModalVisible(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title="Save Entry"
                variant="primary"
                size="md"
                onPress={handleSaveManualEntry}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  activeTimerCard: {
    borderWidth: 1.5,
    marginBottom: Spacing.md,
  },
  activeTimerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timerTag: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: Radius.full,
    marginRight: 8,
  },
  timerName: {
    fontSize: 16,
    fontWeight: '700',
  },
  timerValue: {
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  activityCard: {
    paddingVertical: 12,
  },
  activityCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorSquare: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    marginRight: 12,
  },
  actName: {
    fontSize: 15,
    fontWeight: '700',
  },
  actCat: {
    fontSize: 12,
    marginTop: 2,
  },
  actActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: 8,
    borderRadius: Radius.md,
    marginRight: 8,
  },
  entryCard: {
    paddingVertical: 10,
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  entryName: {
    fontSize: 14,
    fontWeight: '600',
  },
  entryTime: {
    fontSize: 12,
    marginTop: 2,
  },
  entryRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  entryDuration: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
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
    marginBottom: 8,
  },
  colorPickerLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  colorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  colorOption: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    marginTop: Spacing.md,
  },
});
