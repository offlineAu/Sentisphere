import type { ColorSchemeName } from 'react-native';

// Force light mode on web to avoid inheriting Chrome/OS theme
export function useColorScheme(): ColorSchemeName {
  return 'light';
}
