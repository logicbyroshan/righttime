import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColorScheme } from 'react-native';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { AttendanceEventType } from '@/db/types';

interface TimelineItemProps {
  type: AttendanceEventType;
  timestamp: string;
  notes?: string;
  isLast?: boolean;
}

export function TimelineItem({ type, timestamp, notes, isLast = false }: TimelineItemProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];

  const timeStr = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  let label: string = 'Event';
  let dotColor: string = colors.primary;

  switch (type) {
    case 'CHECK_IN':
      label = 'Checked In';
      dotColor = colors.success;
      break;
    case 'START_BREAK':
      label = 'Started Break';
      dotColor = colors.warning;
      break;
    case 'END_BREAK':
      label = 'Ended Break';
      dotColor = colors.primary;
      break;
    case 'CHECK_OUT':
      label = 'Checked Out';
      dotColor = colors.accent;
      break;
    case 'CORRECTION':
      label = 'Correction';
      dotColor = colors.danger;
      break;
  }

  return (
    <View style={styles.row}>
      <View style={styles.indicatorContainer}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        {!isLast ? (
          <View style={[styles.line, { backgroundColor: colors.backgroundSelected }]} />
        ) : null}
      </View>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
          <Text style={[styles.time, { color: colors.textSecondary }]}>{timeStr}</Text>
        </View>
        {notes ? (
          <Text style={[styles.notes, { color: colors.textMuted }]}>{notes}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  indicatorContainer: {
    alignItems: 'center',
    width: 24,
    marginRight: Spacing.sm,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: Radius.full,
    marginTop: 4,
  },
  line: {
    width: 2,
    flex: 1,
    marginTop: 4,
  },
  content: {
    flex: 1,
    paddingBottom: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  time: {
    fontSize: 12,
    fontWeight: '500',
  },
  notes: {
    fontSize: 12,
    marginTop: 2,
    fontStyle: 'italic',
  },
});
