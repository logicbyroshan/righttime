import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColorScheme } from 'react-native';
import { Colors, Radius, Spacing } from '@/constants/theme';

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  accentColor?: string;
  icon?: React.ReactNode;
}

export function StatCard({ label, value, subValue, accentColor, icon }: StatCardProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
        },
      ]}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
        {icon}
      </View>
      <Text
        style={[
          styles.value,
          { color: accentColor || colors.text },
        ]}>
        {value}
      </Text>
      {subValue ? (
        <Text style={[styles.subValue, { color: colors.textMuted }]}>{subValue}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginHorizontal: Spacing.xs,
    marginVertical: Spacing.xs,
    minWidth: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 20,
    fontWeight: '700',
    marginVertical: 2,
  },
  subValue: {
    fontSize: 11,
    marginTop: 2,
  },
});
