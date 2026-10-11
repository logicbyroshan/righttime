import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useColorScheme } from 'react-native';
import { Colors, Radius } from '@/constants/theme';

interface ProgressBarProps {
  progress: number; // 0 to 1
  color?: string;
  height?: number;
}

export function ProgressBar({ progress, color, height = 8 }: ProgressBarProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];
  const clamped = Math.min(1, Math.max(0, progress));
  const fill = color || colors.primary;

  return (
    <View
      style={[
        styles.track,
        {
          backgroundColor: colors.backgroundSelected,
          height,
        },
      ]}>
      <View
        style={[
          styles.fill,
          {
            backgroundColor: fill,
            width: `${clamped * 100}%`,
            height,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginVertical: 4,
  },
  fill: {
    borderRadius: Radius.full,
  },
});
