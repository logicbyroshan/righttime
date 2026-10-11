import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
} from 'react-native';
import { useColorScheme } from 'react-native';
import { Colors, Radius, Spacing } from '@/constants/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
}: ButtonProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];

  let bg: string = colors.primary;
  let textColor: string = colors.primaryContrast;
  let borderColor: string = 'transparent';

  if (variant === 'secondary') {
    bg = colors.backgroundSelected;
    textColor = colors.text;
  } else if (variant === 'danger') {
    bg = colors.danger;
    textColor = '#FFFFFF';
  } else if (variant === 'warning') {
    bg = colors.warning;
    textColor = '#0B0F17';
  } else if (variant === 'outline') {
    bg = 'transparent';
    textColor = colors.primary;
    borderColor = colors.primary;
  }

  const paddingVertical = size === 'sm' ? 8 : size === 'lg' ? 16 : 12;
  const paddingHorizontal = size === 'sm' ? 12 : size === 'lg' ? 24 : 16;
  const fontSize = size === 'sm' ? 13 : size === 'lg' ? 17 : 15;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        {
          backgroundColor: bg,
          borderColor,
          borderWidth: variant === 'outline' ? 1.5 : 0,
          paddingVertical,
          paddingHorizontal,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <>
          {icon}
          <Text style={[styles.text, { color: textColor, fontSize }, icon ? { marginLeft: 8 } : null]}>
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  text: {
    fontWeight: '600',
    textAlign: 'center',
  },
});
