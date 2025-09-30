import type { ColorSchemeName } from 'react-native';

// Force light mode globally across the app
export function useColorScheme(): ColorSchemeName {
  return 'light';
}
