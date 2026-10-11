import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { useColorScheme } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { TimelineItem } from '@/components/ui/TimelineItem';
import { EmptyState } from '@/components/ui/EmptyState';

import {
  getActiveSession,
  checkIn,
  startBreak,
  endBreak,
  checkOut,
  getTodayTimeline,
  ActiveSessionDetails,
} from '@/db/attendanceRepo';
import {
  getTodayActivitiesSummary,
  getActiveTimer,
  stopTimer,
  ActivitySummaryItem,
  ActiveTimerInfo,
} from '@/db/activitiesRepo';
import { getHabitsWithStatus, HabitWithStatus } from '@/db/habitsRepo';
import { getSettings } from '@/db/settingsRepo';
import {
  getPendingSuggestions,
  confirmSuggestion,
  dismissSuggestion,
  snoozeSuggestion,
} from '@/db/suggestionsRepo';
import { AttendanceEvent, PendingSuggestion } from '@/db/types';

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export default function HomeScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];

  const [refreshing, setRefreshing] = useState(false);
  const [activeSession, setActiveSession] = useState<ActiveSessionDetails | null>(null);
  const [activeTimer, setActiveTimer] = useState<ActiveTimerInfo | null>(null);
  const [timeline, setTimeline] = useState<AttendanceEvent[]>([]);
  const [activities, setActivities] = useState<ActivitySummaryItem[]>([]);
  const [habits, setHabits] = useState<HabitWithStatus[]>([]);
  const [officeName, setOfficeName] = useState('Office HQ');
  const [pendingSuggestions, setPendingSuggestions] = useState<PendingSuggestion[]>([]);

  // Load all dashboard data
  const loadData = useCallback(() => {
    try {
      const sess = getActiveSession();
      setActiveSession(sess);

      const timer = getActiveTimer();
      setActiveTimer(timer);

      const events = getTodayTimeline();
      setTimeline(events);

      const acts = getTodayActivitiesSummary();
      setActivities(acts);

      const habs = getHabitsWithStatus();
      setHabits(habs);

      const settings = getSettings();
      setOfficeName(settings.office_name);

      const suggs = getPendingSuggestions();
      setPendingSuggestions(suggs);
    } catch (e: any) {
      console.error('Error loading dashboard data:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Live 1-second interval refresh for active attendance session and activity timer
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeSession?.session || activeTimer?.entry) {
        const sess = getActiveSession();
        setActiveSession(sess);
        const timer = getActiveTimer();
        setActiveTimer(timer);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSession?.session, activeTimer?.entry]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
    setRefreshing(false);
  }, [loadData]);

  // Suggestion action handlers
  const handleConfirmSuggestion = (sugg: PendingSuggestion) => {
    try {
      confirmSuggestion(sugg.id, '', 'NOW');
      loadData();
    } catch (e: any) {
      Alert.alert('Confirmation Error', e.message);
    }
  };

  const handleDismissSuggestion = (sugg: PendingSuggestion) => {
    try {
      dismissSuggestion(sugg.id, 'Dismissed by user');
      loadData();
    } catch (e: any) {
      Alert.alert('Dismiss Error', e.message);
    }
  };

  const handleSnoozeSuggestion = (sugg: PendingSuggestion) => {
    try {
      snoozeSuggestion(sugg.id, 15);
      loadData();
    } catch (e: any) {
      Alert.alert('Snooze Error', e.message);
    }
  };

  // Attendance action handlers
  const handleCheckIn = () => {
    try {
      checkIn();
      loadData();
    } catch (e: any) {
      Alert.alert('Attendance Error', e.message);
    }
  };

  const handleStartBreak = () => {
    try {
      startBreak();
      loadData();
    } catch (e: any) {
      Alert.alert('Break Error', e.message);
    }
  };

  const handleEndBreak = () => {
    try {
      endBreak();
      loadData();
    } catch (e: any) {
      Alert.alert('Break Error', e.message);
    }
  };

  const handleCheckOut = () => {
    Alert.alert(
      'Confirm Check Out',
      'Are you sure you want to end your office attendance session for today?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Check Out',
          style: 'destructive',
          onPress: () => {
            try {
              checkOut();
              loadData();
            } catch (e: any) {
              Alert.alert('Check Out Error', e.message);
            }
          },
        },
      ]
    );
  };

  // Determine current attendance state
  let attendanceState: 'NOT_CHECKED_IN' | 'WORKING' | 'ON_BREAK' | 'CHECKED_OUT' = 'NOT_CHECKED_IN';
  let stateBadgeLabel = 'Not Checked In';
  let stateBadgeColor: string = colors.textSecondary;

  if (activeSession?.session) {
    if (activeSession.activeBreak) {
      attendanceState = 'ON_BREAK';
      stateBadgeLabel = 'On Break';
      stateBadgeColor = colors.warning;
    } else {
      attendanceState = 'WORKING';
      stateBadgeLabel = 'Working';
      stateBadgeColor = colors.success;
    }
  } else if (timeline.some((e) => e.event_type === 'CHECK_OUT')) {
    attendanceState = 'CHECKED_OUT';
    stateBadgeLabel = 'Checked Out Today';
    stateBadgeColor = colors.accent;
  }

  // Habits completed count
  const completedHabitsCount = habits.filter((h) => h.completedToday).length;
  const habitCompletionRate = habits.length > 0 ? completedHabitsCount / habits.length : 0;

  // Date formatting
  const today = new Date();
  const dateFormatted = today.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.dateText, { color: colors.textSecondary }]}>{dateFormatted}</Text>
            <Text style={[styles.title, { color: colors.text }]}>{officeName}</Text>
          </View>
          <Badge label={stateBadgeLabel} color={stateBadgeColor} />
        </View>

        {/* Pending Wi-Fi Attendance Confirmation Banner */}
        {pendingSuggestions.length > 0 && (
          <Card style={[styles.suggestionCard, { borderColor: colors.primary }]}>
            <View style={styles.suggestionHeader}>
              <View style={styles.suggestionTitleRow}>
                <Ionicons
                  name={pendingSuggestions[0].event_type === 'ARRIVAL' ? 'business' : 'exit'}
                  size={20}
                  color={colors.primary}
                />
                <Text style={[styles.suggestionTitle, { color: colors.text }]}>
                  {pendingSuggestions[0].event_type === 'ARRIVAL'
                    ? 'Office Arrival Detected'
                    : 'Office Departure Detected'}
                </Text>
              </View>
              <Badge label="Action Required" color={colors.primary} />
            </View>

            <Text style={[styles.suggestionBody, { color: colors.textSecondary }]}>
              {pendingSuggestions[0].event_type === 'ARRIVAL'
                ? `Office Wi-Fi detected at ${new Date(pendingSuggestions[0].detected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Are you arriving at the office?`
                : `Office Wi-Fi disconnected at ${new Date(pendingSuggestions[0].detected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Have you left the office?`}
            </Text>

            <View style={styles.suggestionActionsRow}>
              <Button
                title={pendingSuggestions[0].event_type === 'ARRIVAL' ? 'Confirm Arrival' : 'Confirm Departure'}
                variant="primary"
                size="sm"
                onPress={() => handleConfirmSuggestion(pendingSuggestions[0])}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title="Not Now"
                variant="outline"
                size="sm"
                onPress={() => handleSnoozeSuggestion(pendingSuggestions[0])}
                style={{ marginRight: 8 }}
              />
              <Button
                title="Dismiss"
                variant="danger"
                size="sm"
                onPress={() => handleDismissSuggestion(pendingSuggestions[0])}
              />
            </View>
          </Card>
        )}

        {/* Live Active Activity Timer Banner if running */}
        {activeTimer?.entry && (
          <Card style={[styles.activeTimerCard, { borderColor: colors.primary }]}>
            <View style={styles.timerHeader}>
              <View style={styles.timerTitleRow}>
                <View
                  style={[
                    styles.colorDot,
                    { backgroundColor: activeTimer.activity?.color || colors.primary },
                  ]}
                />
                <Text style={[styles.timerActivityName, { color: colors.text }]}>
                  {activeTimer.activity?.name || 'Active Task'}
                </Text>
              </View>
              <Text style={[styles.timerCounter, { color: colors.primary }]}>
                {formatDuration(activeTimer.elapsedSeconds)}
              </Text>
            </View>
            <Button
              title="Stop Timer"
              variant="outline"
              size="sm"
              onPress={() => {
                stopTimer(activeTimer.entry!.id);
                loadData();
              }}
              style={{ marginTop: 8 }}
            />
          </Card>
        )}

        {/* Attendance Action Hero Card */}
        <Card style={styles.heroCard}>
          <View style={styles.heroStatsRow}>
            <StatCard
              label="Elapsed"
              value={formatDuration(activeSession?.grossDurationSeconds || 0)}
              accentColor={colors.text}
              icon={<Ionicons name="time-outline" size={16} color={colors.textSecondary} />}
            />
            <StatCard
              label="Breaks"
              value={formatDuration(activeSession?.breakDurationSeconds || 0)}
              accentColor={colors.warning}
              icon={<Ionicons name="cafe-outline" size={16} color={colors.warning} />}
            />
            <StatCard
              label="Net Office"
              value={formatDuration(activeSession?.netDurationSeconds || 0)}
              accentColor={colors.primary}
              icon={<Ionicons name="briefcase-outline" size={16} color={colors.primary} />}
            />
          </View>

          {/* Action Button */}
          <View style={styles.heroActionContainer}>
            {attendanceState === 'NOT_CHECKED_IN' && (
              <Button
                title="Check In Office"
                variant="primary"
                size="lg"
                onPress={handleCheckIn}
                icon={<Ionicons name="log-in-outline" size={22} color={colors.primaryContrast} />}
              />
            )}
            {attendanceState === 'WORKING' && (
              <View style={styles.multiActionRow}>
                <Button
                  title="Take Break"
                  variant="warning"
                  size="md"
                  onPress={handleStartBreak}
                  icon={<Ionicons name="cafe-outline" size={18} color="#0B0F17" />}
                  style={{ flex: 1, marginRight: 8 }}
                />
                <Button
                  title="Check Out"
                  variant="danger"
                  size="md"
                  onPress={handleCheckOut}
                  icon={<Ionicons name="log-out-outline" size={18} color="#FFFFFF" />}
                  style={{ flex: 1 }}
                />
              </View>
            )}
            {attendanceState === 'ON_BREAK' && (
              <Button
                title="End Break & Resume Work"
                variant="primary"
                size="lg"
                onPress={handleEndBreak}
                icon={<Ionicons name="play-outline" size={22} color={colors.primaryContrast} />}
              />
            )}
            {attendanceState === 'CHECKED_OUT' && (
              <Button
                title="Start Additional Session"
                variant="outline"
                size="md"
                onPress={handleCheckIn}
                icon={<Ionicons name="add-circle-outline" size={18} color={colors.primary} />}
              />
            )}
          </View>
        </Card>

        {/* Habits Daily Progress Card */}
        <Card>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Daily Habits</Text>
              <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
                {completedHabitsCount} of {habits.length} completed today
              </Text>
            </View>
            <Button
              title="View All"
              variant="outline"
              size="sm"
              onPress={() => router.push('/(tabs)/habits')}
            />
          </View>
          <ProgressBar progress={habitCompletionRate} color={colors.success} height={10} />
          {habits.length === 0 && (
            <EmptyState
              title="No Habits Set"
              description="Track daily routines and build streaks."
              action={
                <Button
                  title="Create Habit"
                  variant="outline"
                  size="sm"
                  onPress={() => router.push('/(tabs)/habits')}
                />
              }
            />
          )}
        </Card>

        {/* Today's Activities Summary */}
        <Card>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Today's Activities</Text>
            <Button
              title="Track Time"
              variant="outline"
              size="sm"
              onPress={() => router.push('/(tabs)/activities')}
            />
          </View>

          {activities.length === 0 ? (
            <EmptyState
              title="No Activities Tracked Today"
              description="Start a timer or record manual work intervals."
              icon={<Ionicons name="timer-outline" size={32} color={colors.textSecondary} />}
            />
          ) : (
            activities.map((item) => (
              <View key={item.activityId} style={styles.activityRow}>
                <View style={styles.activityInfo}>
                  <View style={[styles.colorDot, { backgroundColor: item.color }]} />
                  <View>
                    <Text style={[styles.activityName, { color: colors.text }]}>{item.name}</Text>
                    <Text style={[styles.activityCategory, { color: colors.textSecondary }]}>
                      {item.category} • {item.entryCount} entries
                    </Text>
                  </View>
                </View>
                <Text style={[styles.activityDuration, { color: colors.primary }]}>
                  {formatDuration(item.totalSeconds)}
                </Text>
              </View>
            ))
          )}
        </Card>

        {/* Today's Chronological Timeline */}
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>
            Today's Timeline
          </Text>
          {timeline.length === 0 ? (
            <EmptyState
              title="No Events Recorded Yet"
              description="Events like check-in, breaks, and check-out will appear here."
              icon={<Ionicons name="calendar-outline" size={32} color={colors.textSecondary} />}
            />
          ) : (
            timeline.map((event, idx) => (
              <TimelineItem
                key={event.id}
                type={event.event_type}
                timestamp={event.timestamp}
                notes={event.notes}
                isLast={idx === timeline.length - 1}
              />
            ))
          )}
        </Card>
      </ScrollView>
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
  dateText: {
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  activeTimerCard: {
    padding: Spacing.md,
    borderWidth: 1.5,
  },
  timerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: Radius.full,
    marginRight: 8,
  },
  timerActivityName: {
    fontSize: 15,
    fontWeight: '700',
  },
  timerCounter: {
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  heroCard: {
    padding: Spacing.lg,
  },
  heroStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  heroActionContainer: {
    marginTop: Spacing.xs,
  },
  multiActionRow: {
    flexDirection: 'row',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  sectionSub: {
    fontSize: 12,
    marginTop: 2,
  },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B30',
  },
  activityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activityName: {
    fontSize: 14,
    fontWeight: '600',
  },
  activityCategory: {
    fontSize: 12,
    marginTop: 1,
  },
  activityDuration: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  suggestionCard: {
    marginBottom: Spacing.md,
    borderWidth: 1.5,
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  suggestionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  suggestionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  suggestionBody: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing.md,
  },
  suggestionActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
