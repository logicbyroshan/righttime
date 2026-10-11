import { Colors } from '@/constants/theme';
import { useColorScheme } from 'react-native';

export function useTheme() {
  const scheme = useColorScheme();
  return Colors[scheme === 'light' ? 'light' : 'dark'];
}
