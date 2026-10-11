import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useColorScheme } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';

import {
  getDailyReport,
  getWeeklyReport,
  getMonthlyReport,
  PeriodReport,
} from '@/db/reportsRepo';

function formatHoursMinutes(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatDelta(diffSeconds: number): string {
  if (diffSeconds === 0) return '±0m vs prev';
  const sign = diffSeconds > 0 ? '+' : '-';
  const abs = Math.abs(diffSeconds);
  const hours = Math.floor(abs / 3600);
  const mins = Math.floor((abs % 3600) / 60);
  return `${sign}${hours > 0 ? `${hours}h ` : ''}${mins}m vs prev`;
}

export default function ReportsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];

  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [report, setReport] = useState<PeriodReport | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const yearMonth = today.substring(0, 7);

      let rep: PeriodReport;
      if (period === 'daily') {
        rep = getDailyReport(today);
      } else if (period === 'weekly') {
        rep = getWeeklyReport(today);
      } else {
        rep = getMonthlyReport(yearMonth);
      }
      setReport(rep);
    } catch (e: any) {
      console.error('Error loading report:', e);
    }
  }, [period]);

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Time & Habit Reports</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Aggregated analytics, office punches, and habit consistency
          </Text>
        </View>

        {/* Period Selector Tabs */}
        <View style={[styles.selectorContainer, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {(['daily', 'weekly', 'monthly'] as const).map((p) => {
            const isSelected = period === p;
            return (
              <TouchableOpacity
                key={p}
                onPress={() => setPeriod(p)}
                style={[
                  styles.selectorTab,
                  isSelected && { backgroundColor: colors.primary },
                ]}>
                <Text
                  style={[
                    styles.selectorText,
                    {
                      color: isSelected ? colors.primaryContrast : colors.textSecondary,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Date Interval Label */}
        {report && (
          <Text style={[styles.intervalLabel, { color: colors.textSecondary }]}>
            Period: {report.startDate} {report.startDate !== report.endDate ? `→ ${report.endDate}` : ''}
          </Text>
        )}

        {/* Office Attendance Section */}
        <Card>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Office Attendance</Text>
            <Text style={[styles.trendLabel, { color: colors.accent }]}>
              {report ? formatDelta(report.trends.netOfficeDiffSeconds) : ''}
            </Text>
          </View>

          <View style={styles.statGrid}>
            <StatCard
              label="Net Office"
              value={formatHoursMinutes(report?.attendance.netDurationSeconds || 0)}
              accentColor={colors.primary}
            />
            <StatCard
              label="Breaks"
              value={formatHoursMinutes(report?.attendance.breakDurationSeconds || 0)}
              accentColor={colors.warning}
            />
          </View>
          <View style={styles.statGrid}>
            <StatCard
              label="Gross Elapsed"
              value={formatHoursMinutes(report?.attendance.grossDurationSeconds || 0)}
            />
            <StatCard
              label="Sessions"
              value={`${report?.attendance.sessionCount || 0}`}
              subValue={`${report?.attendance.completedCount || 0} completed`}
            />
          </View>
        </Card>

        {/* Tracked Activities Section */}
        <Card>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Tracked Activities</Text>
            <Text style={[styles.trendLabel, { color: colors.primary }]}>
              {formatHoursMinutes(report?.activities.totalDurationSeconds || 0)} total
            </Text>
          </View>

          {(!report?.activities.byCategory || report.activities.byCategory.length === 0) ? (
            <EmptyState
              title="No Tracked Activities In Period"
              description="Record time intervals in Activities to view category breakdowns."
            />
          ) : (
            report.activities.byCategory.map((cat) => (
              <View key={cat.category} style={styles.catRow}>
                <View style={styles.catHeader}>
                  <Text style={[styles.catName, { color: colors.text }]}>{cat.category}</Text>
                  <Text style={[styles.catTime, { color: colors.textSecondary }]}>
                    {formatHoursMinutes(cat.durationSeconds)} ({cat.percentage}%)
                  </Text>
                </View>
                <ProgressBar progress={cat.percentage / 100} color={colors.primary} height={6} />
              </View>
            ))
          )}
        </Card>

        {/* Habits Consistency Section */}
        <Card>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Habit Consistency</Text>
            <Text style={[styles.trendLabel, { color: colors.success }]}>
              {report?.habits.completionRate || 0}% rate
            </Text>
          </View>

          <View style={styles.statGrid}>
            <StatCard
              label="Completed"
              value={`${report?.habits.completedCount || 0}`}
              subValue="total checks in period"
              accentColor={colors.success}
            />
            <StatCard
              label="Active Habits"
              value={`${report?.habits.totalHabits || 0}`}
              subValue="routines tracked"
            />
          </View>
          <ProgressBar
            progress={(report?.habits.completionRate || 0) / 100}
            color={colors.success}
            height={8}
          />
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
  selectorContainer: {
    flexDirection: 'row',
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 4,
    marginBottom: Spacing.md,
  },
  selectorTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorText: {
    fontSize: 13,
  },
  intervalLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  trendLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  statGrid: {
    flexDirection: 'row',
    marginHorizontal: -Spacing.xs,
  },
  catRow: {
    marginVertical: 6,
  },
  catHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  catName: {
    fontSize: 13,
    fontWeight: '600',
  },
  catTime: {
    fontSize: 12,
  },
});
