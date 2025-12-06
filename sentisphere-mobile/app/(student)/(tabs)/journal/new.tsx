import { useState, useRef, useEffect } from 'react';
import { 
  StyleSheet, 
  TextInput, 
  View, 
  ScrollView, 
  Pressable, 
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import * as Haptics from 'expo-haptics';
import { BottomToast, ToastType } from '@/components/BottomToast';

export default function JournalNewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const API = process.env.EXPO_PUBLIC_API_URL || 'https://sentisphere-production.up.railway.app';
  
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // Toast state (unified BottomToast design)
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<ToastType>('success');
  
  const showToast = (message: string, type: ToastType = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
  };
  
  // Animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  const getAuthToken = async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try { return (window as any)?.localStorage?.getItem('auth_token') || null } catch { return null }
    }
    try { return await SecureStore.getItemAsync('auth_token') } catch { return null }
  };

  const handleCancel = () => {
    if (Platform.OS !== 'web') {
      try { Haptics.selectionAsync(); } catch {}
    }
    router.back();
  };

  const handleSave = async () => {
    if (isSaving) return;
    
    // Dismiss keyboard first
    Keyboard.dismiss();
    
    if (!content.trim()) {
      showToast('Please write something', 'error');
      return;
    }
    
    setIsSaving(true);
    
    try {
      const tok = await getAuthToken();
      if (!tok) throw new Error('Not signed in');
      
      const res = await fetch(`${API}/api/journals`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tok}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: content.trim() }),
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to save');
      }
      
      if (Platform.OS !== 'web') {
        try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      }
      
      showToast('Entry saved', 'success');
      
      // Small delay to show toast before navigating
      setTimeout(() => {
        router.replace('/(student)/(tabs)/journal');
      }, 1200);
    } catch (e: any) {
      showToast(e?.message || 'Unable to save', 'error');
      if (Platform.OS !== 'web') {
        try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header with actions */}
      <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
        <Pressable 
          onPress={handleCancel}
          style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Icon name="x" size={20} color="#6B7280" />
          <ThemedText style={styles.cancelText}>Cancel</ThemedText>
        </Pressable>
        
        <ThemedText style={styles.headerTitle}>New Entry</ThemedText>
        
        <Pressable 
          onPress={handleSave}
          disabled={isSaving || !content.trim()}
          style={({ pressed }) => [
            styles.headerBtn,
            styles.saveBtn,
            pressed && { opacity: 0.85 },
            (!content.trim() || isSaving) && { opacity: 0.5 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Save entry"
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Icon name="check" size={18} color="#FFFFFF" />
              <ThemedText style={styles.saveText}>Save</ThemedText>
            </>
          )}
        </Pressable>
      </Animated.View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.contentArea, { opacity: fadeAnim }]}>
            {/* Date indicator */}
            <View style={styles.dateLine}>
              <Icon name="calendar" size={14} color="#9CA3AF" />
              <ThemedText style={styles.dateText}>
                {new Date().toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  month: 'long', 
                  day: 'numeric', 
                  year: 'numeric' 
                })}
              </ThemedText>
            </View>

            {/* Main content input - Apple Notes style */}
            <TextInput
              style={styles.contentInput}
              value={content}
              onChangeText={setContent}
              placeholder="What's on your mind today?"
              placeholderTextColor="#9CA3AF"
              multiline
              autoFocus
              textAlignVertical="top"
              scrollEnabled={false}
              // Web compatibility fixes
              pointerEvents="auto"
              accessible
              accessibilityLabel="Journal content"
            />

            </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
      
      {/* Toast - unified BottomToast design */}
      <BottomToast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onHide={() => setToastVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAF8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    // No background, no border - seamless with page
  },
  headerTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    color: '#1F2937',
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  cancelText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: '#6B7280',
  },
  saveBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
  },
  saveText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  contentArea: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  dateLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  dateText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#9CA3AF',
  },
  contentInput: {
    fontFamily: 'Inter_400Regular',
    fontSize: 17,
    lineHeight: 28,
    color: '#374151',
    letterSpacing: 0.1,
    minHeight: 300,
    textAlignVertical: 'top',
    padding: 0,
  },
});
