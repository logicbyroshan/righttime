export const Colors = {
  light: {
    text: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#94A3B8',
    background: '#F8FAFC',
    backgroundElement: '#E2E8F0',
    backgroundSelected: '#CBD5E1',
    card: '#FFFFFF',
    cardBorder: '#E2E8F0',
    primary: '#0284C7',
    primaryContrast: '#FFFFFF',
    accent: '#6366F1',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
  },
  dark: {
    text: '#F8FAFC',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    background: '#0B0F17',
    backgroundElement: '#161F30',
    backgroundSelected: '#1E293B',
    card: '#131C2E',
    cardBorder: '#233249',
    primary: '#38BDF8',
    primaryContrast: '#0B0F17',
    accent: '#818CF8',
    success: '#34D399',
    warning: '#FBBF24',
    danger: '#F87171',
  },
} as const;

export type ThemeColors = typeof Colors.dark;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;
