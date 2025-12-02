import { StyleSheet, TextInput, Pressable } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { GlobalScreenWrapper } from '@/components/GlobalScreenWrapper';

export default function LoginScreen() {
  return (
    <GlobalScreenWrapper backgroundColor="#FFFFFF" style={{ justifyContent: 'center', padding: 16, gap: 12 }}>
      <ThemedText type="title">Login</ThemedText>
      <TextInput placeholder="Email" style={styles.input} />
      <TextInput placeholder="Password" secureTextEntry style={styles.input} />
      <Pressable style={styles.button}>
        <ThemedText style={{ color: 'white', textAlign: 'center' }}>Sign In</ThemedText>
      </Pressable>
    </GlobalScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, justifyContent: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  button: { backgroundColor: '#0a7ea4', borderRadius: 8, padding: 12, marginTop: 8 },
});
