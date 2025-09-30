import { StyleSheet, View, FlatList, TextInput, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useState, useRef } from 'react';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

type Msg = { id: string; role: 'user' | 'ai'; text: string };

export default function ChatScreen() {
  const [messages, setMessages] = useState<Msg[]>([
    { id: '1', role: 'ai', text: 'Hi! How are you feeling today?' },
  ]);
  const [input, setInput] = useState('');
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme] as any;
  const listRef = useRef<FlatList<Msg>>(null);

  const send = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const userMsg: Msg = { id: `${Date.now()}`, role: 'user', text: trimmed };
    const aiMsg: Msg = { id: `${Date.now()}-ai`, role: 'ai', text: 'Thanks for sharing. Tell me more about that.' };
    const next: Msg[] = [...messages, userMsg, aiMsg];
    setMessages(next);
    setInput('');
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ThemedView style={styles.container}>
        <ThemedText type="title">Chat</ThemedText>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => (
            <View style={[styles.row, { justifyContent: item.role === 'user' ? 'flex-end' : 'flex-start' }]}>
              <View
                style={[
                  styles.bubble,
                  item.role === 'user'
                    ? { backgroundColor: palette.primary, borderTopRightRadius: 4 }
                    : { backgroundColor: '#F3F4F6', borderTopLeftRadius: 4 },
                ]}
              >
                <ThemedText style={{ color: item.role === 'user' ? '#fff' : palette.text }}>{item.text}</ThemedText>
              </View>
            </View>
          )}
          contentContainerStyle={{ paddingVertical: 8 }}
        />

        <View style={[styles.inputBar, { borderColor: palette.border }]}> 
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Type a message"
            style={styles.input}
            onSubmitEditing={send}
          />
          <Pressable onPress={send} style={styles.sendBtn}>
            <Icon name="arrow-right" />
          </Pressable>
        </View>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  row: { flexDirection: 'row', marginVertical: 4 },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, maxWidth: '80%' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 8,
  },
  input: { flex: 1, padding: 8 },
  sendBtn: { padding: 6 },
});
