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
import { Input } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';

import {
  getHabitsWithStatus,
  createHabit,
  toggleHabitCompletion,
  deleteHabit,
  HabitWithStatus,
} from '@/db/habitsRepo';

const PRESET_COLORS = ['#10B981', '#38BDF8', '#818CF8', '#F59E0B', '#EC4899', '#8B5CF6'];

export default function HabitsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];

  const [refreshing, setRefreshing] = useState(false);
  const [habits, setHabits] = useState<HabitWithStatus[]>([]);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetCount, setTargetCount] = useState('1');
  const [unit, setUnit] = useState('times');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);

  const loadData = useCallback(() => {
    try {
      const list = getHabitsWithStatus();
      setHabits(list);
    } catch (e: any) {
      console.error('Error loading habits:', e);
    }
  }, []);

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

  const handleToggleHabit = (habitId: string, currentCompleted: boolean) => {
    try {
      toggleHabitCompletion(habitId, undefined, !currentCompleted);
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleCreateHabit = () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter a habit title.');
      return;
    }
    const target = parseInt(targetCount, 10) || 1;
    try {
      createHabit(name, description, target, unit, selectedColor);
      setName('');
      setDescription('');
      setTargetCount('1');
      setModalVisible(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleDeleteHabit = (habitId: string) => {
    Alert.alert('Archive Habit', 'Archive this habit?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: () => {
          deleteHabit(habitId);
          loadData();
        },
      },
    ]);
  };

  const completedCount = habits.filter((h) => h.completedToday).length;
  const completionRate = habits.length > 0 ? Math.round((completedCount / habits.length) * 100) : 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>Habits & Streaks</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Consistency tracking with daily goals and streak calculations
            </Text>
          </View>
          <Button
            title="+ New Habit"
            variant="primary"
            size="sm"
            onPress={() => setModalVisible(true)}
          />
        </View>

        {/* Today's Habit Progress Card */}
        <Card style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressTitle, { color: colors.text }]}>Today's Completion</Text>
            <Text style={[styles.progressPercent, { color: colors.success }]}>
              {completionRate}%
            </Text>
          </View>
          <ProgressBar progress={completionRate / 100} color={colors.success} height={10} />
          <Text style={[styles.progressSubtitle, { color: colors.textSecondary }]}>
            {completedCount} of {habits.length} habits checked off today
          </Text>
        </Card>

        {/* Habit List */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Daily Checklist</Text>
        {habits.length === 0 ? (
          <EmptyState
            title="No Habits Configured"
            description="Add daily habits like Hydration, Reading, or 10k Steps."
            icon={<Ionicons name="flame-outline" size={36} color={colors.textSecondary} />}
            action={
              <Button
                title="Create Habit"
                variant="primary"
                size="md"
                onPress={() => setModalVisible(true)}
              />
            }
          />
        ) : (
          habits.map((habit) => (
            <Card key={habit.id} style={styles.habitCard}>
              <View style={styles.habitRow}>
                {/* Checkbox button */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => handleToggleHabit(habit.id, habit.completedToday)}
                  style={[
                    styles.checkbox,
                    {
                      borderColor: habit.completedToday ? habit.color : colors.cardBorder,
                      backgroundColor: habit.completedToday ? habit.color : 'transparent',
                    },
                  ]}>
                  {habit.completedToday && (
                    <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                  )}
                </TouchableOpacity>

                {/* Habit details */}
                <View style={styles.habitInfo}>
                  <Text
                    style={[
                      styles.habitName,
                      {
                        color: colors.text,
                        textDecorationLine: habit.completedToday ? 'line-through' : 'none',
                        opacity: habit.completedToday ? 0.8 : 1,
                      },
                    ]}>
                    {habit.name}
                  </Text>
                  {habit.description ? (
                    <Text style={[styles.habitDesc, { color: colors.textSecondary }]}>
                      {habit.description}
                    </Text>
                  ) : null}

                  {/* Streaks row */}
                  <View style={styles.streaksRow}>
                    <View style={styles.streakBadge}>
                      <Ionicons name="flame" size={14} color="#F59E0B" />
                      <Text style={[styles.streakText, { color: '#F59E0B' }]}>
                        {habit.currentStreak} day streak
                      </Text>
                    </View>
                    <Text style={[styles.bestStreakText, { color: colors.textMuted }]}>
                      Best: {habit.bestStreak}d
                    </Text>
                  </View>
                </View>

                {/* Delete/Archive button */}
                <TouchableOpacity
                  onPress={() => handleDeleteHabit(habit.id)}
                  style={styles.archiveButton}>
                  <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      {/* Create Habit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>New Daily Habit</Text>

            <Input
              label="Habit Name"
              placeholder="e.g. 2L Water, 30m Workout, Reading"
              value={name}
              onChangeText={setName}
            />

            <Input
              label="Description (Optional)"
              placeholder="e.g. Morning routine before office"
              value={description}
              onChangeText={setDescription}
            />

            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Input
                  label="Target Daily Count"
                  keyboardType="numeric"
                  value={targetCount}
                  onChangeText={setTargetCount}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label="Unit"
                  placeholder="times, mins, km"
                  value={unit}
                  onChangeText={setUnit}
                />
              </View>
            </View>

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
                onPress={() => setModalVisible(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title="Create Habit"
                variant="primary"
                size="md"
                onPress={handleCreateHabit}
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
  progressCard: {
    marginBottom: Spacing.lg,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  progressPercent: {
    fontSize: 18,
    fontWeight: '800',
  },
  progressSubtitle: {
    fontSize: 12,
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  habitCard: {
    paddingVertical: 14,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: Radius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  habitInfo: {
    flex: 1,
  },
  habitName: {
    fontSize: 15,
    fontWeight: '700',
  },
  habitDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  streaksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 10,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F59E0B15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  streakText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  bestStreakText: {
    fontSize: 11,
  },
  archiveButton: {
    padding: 8,
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
