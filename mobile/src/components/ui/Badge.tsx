import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Radius, Spacing } from '@/constants/theme';

interface BadgeProps {
  label: string;
  color?: string;
  bgColor?: string;
}

export function Badge({ label, color = '#38BDF8', bgColor }: BadgeProps) {
  const bg = bgColor || `${color}20`; // 20% opacity hex

  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: color }]}>
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
