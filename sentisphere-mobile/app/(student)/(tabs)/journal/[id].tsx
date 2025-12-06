import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { 
  StyleSheet, 
  View, 
  Animated, 
  Easing, 
  Pressable, 
  Platform, 
  Modal, 
  ScrollView, 
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { addDeletedJournalId } from '@/utils/soft-delete';
import { BottomToast } from '@/components/BottomToast';

export default function JournalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const API = process.env.EXPO_PUBLIC_API_URL || 'https://sentisphere-production.up.railway.app';

  // Data state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiTitle, setApiTitle] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  
  // Delete state
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Animation refs
  const confirmScale = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const entranceHeader = useRef(new Animated.Value(0)).current;
  const entranceContent = useRef(new Animated.Value(0)).current;
  const entranceActions = useRef(new Animated.Value(0)).current;

  const runEntrance = useCallback(() => {
    entranceHeader.setValue(0);
    entranceContent.setValue(0);
    entranceActions.setValue(0);
    Animated.stagger(80, [
      Animated.timing(entranceHeader, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(entranceContent, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(entranceActions, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const makeFadeUp = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
  });

  useEffect(() => { runEntrance(); }, []);
  useFocusEffect(useCallback(() => { runEntrance(); return () => {}; }, []));

  const getAuthToken = async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try { return (window as any)?.localStorage?.getItem('auth_token') || null } catch { return null }
    }
    try { return await SecureStore.getItemAsync('auth_token') } catch { return null }
  };
  
  const clearAuthToken = async () => {
    if (Platform.OS === 'web') { try { (window as any)?.localStorage?.removeItem('auth_token') } catch {} ; return; }
    try { await SecureStore.deleteItemAsync('auth_token') } catch {}
  };

  // Fetch journal entry function (reusable for initial load and after save)
  const fetchJournalEntry = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const tok = await getAuthToken();
      if (!tok) { setError('Not signed in'); setLoading(false); return; }
      
      // No trailing slash - correct endpoint
      const res = await fetch(`${API}/api/journals/${id}`, { 
        headers: { Authorization: `Bearer ${tok}` } 
      });
      
      if (res.status === 401) {
        await clearAuthToken();
        router.replace('/auth');
        return;
      }
      if (res.status === 404) {
        setError('Not found');
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError('Failed to load');
        setLoading(false);
        return;
      }
      const d = await res.json();
      setApiTitle(d?.title ? String(d.title) : null);
      setContent(String(d?.content || ''));
      setCreatedAt(String(d?.created_at || ''));
    } catch (e) {
      console.error('[Journal] Fetch error:', e);
      setError('Failed to load');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [id, API]);

  // Load journal entry on mount
  useEffect(() => {
    fetchJournalEntry();
  }, [fetchJournalEntry]);

  const title = useMemo(() => {
    if (apiTitle && apiTitle.trim()) return apiTitle.trim();
    const first = content.trim().split(/\n+/)[0]?.trim() || 'Journal Entry';
    return first.slice(0, 80) || 'Journal Entry';
  }, [apiTitle, content]);

  // Format date
  const when = useMemo(() => {
    if (!createdAt) return '';
    try {
      const d = new Date(createdAt);
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    } catch {
      return createdAt || '';
    }
  }, [createdAt]);

  // Format time
  const timeStr = useMemo(() => {
    if (!createdAt) return '';
    try {
      const d = new Date(createdAt);
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch {
      return '';
    }
  }, [createdAt]);

  // Entrance animation
  useEffect(() => {
    if (!loading) {
      Animated.timing(cardOpacity, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [loading]);

  // === EDIT MODE HANDLERS ===
  const handleStartEdit = () => {
    if (Platform.OS !== 'web') {
      try { Haptics.selectionAsync(); } catch {}
    }
    setEditContent(content);
    setSaveError(null);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    if (Platform.OS !== 'web') {
      try { Haptics.selectionAsync(); } catch {}
    }
    setIsEditing(false);
    setEditContent('');
    setSaveError(null);
  };

  const handleSaveEdit = async () => {
    if (isSaving) return;
    
    // Dismiss keyboard first
    Keyboard.dismiss();
    
    const trimmedContent = editContent.trim();
    if (!trimmedContent) {
      setSaveError('Content cannot be empty');
      return;
    }
    
    setIsSaving(true);
    setSaveError(null);
    
    // Store previous content for rollback
    const previousContent = content;
    
    try {
      const tok = await getAuthToken();
      if (!tok) throw new Error('Not signed in');
      
      // Correct PATCH request - no trailing slash, correct body shape
      const url = `${API}/api/journals/${id}`;
      console.log('[Journal] PATCH request to:', url);
      
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${tok}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: trimmedContent }),
      });
      
      console.log('[Journal] PATCH response status:', res.status);
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error('[Journal] PATCH error:', res.status, errData);
        throw new Error(errData.detail || `Failed to save (${res.status})`);
      }
      
      // Parse response to get updated data
      const updatedData = await res.json().catch(() => null);
      console.log('[Journal] PATCH success, updated data:', updatedData);
      
      // Update local state with server response or our edited content
      if (updatedData?.content) {
        setContent(updatedData.content);
      } else {
        setContent(trimmedContent);
      }
      
      // Re-fetch to ensure we have the latest data from server
      await fetchJournalEntry(false);
      
      // Success feedback
      if (Platform.OS !== 'web') {
        try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      }
      
      // Exit edit mode and show toast
      setIsEditing(false);
      setEditContent('');
      setShowSaveSuccess(true);
      
    } catch (e: any) {
      console.error('[Journal] Save failed:', e);
      // Revert to previous content
      setContent(previousContent);
      setSaveError(e?.message || 'Unable to save changes');
      if (Platform.OS !== 'web') {
        try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      }
    } finally {
      setIsSaving(false);
    }
  };

  // === DELETE HANDLERS ===
  const animateConfirm = useCallback((to: 0 | 1, done?: () => void) => {
    Animated.timing(confirmScale, {
      toValue: to,
      duration: to === 1 ? 220 : 180,
      easing: to === 1 ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(done);
  }, [confirmScale]);

  const closeConfirm = useCallback((after?: () => void) => {
    animateConfirm(0, () => {
      setShowDeleteConfirm(false);
      setIsDeleting(false);
      setDeleteError(null);
      after?.();
    });
  }, [animateConfirm]);

  const handleDeletePress = () => {
    if (Platform.OS !== 'web') {
      try { Haptics.selectionAsync(); } catch {}
    }
    setDeleteError(null);
    confirmScale.setValue(0);
    setShowDeleteConfirm(true);
    requestAnimationFrame(() => animateConfirm(1));
  };

  const handleConfirmDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await addDeletedJournalId(id);
      if (Platform.OS !== 'web') {
        try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      }
      closeConfirm(() => router.replace('/(student)/(tabs)/journal'));
    } catch (e: any) {
      setDeleteError(e?.message || 'Unable to delete this journal entry.');
      setIsDeleting(false);
    }
  };

  const handleCancelDelete = () => closeConfirm();

  // Render editing mode - full page Apple Notes style
  if (isEditing) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Edit mode header */}
        <View style={styles.editHeader}>
          <Pressable 
            onPress={handleCancelEdit}
            disabled={isSaving}
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }, isSaving && { opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityLabel="Cancel editing"
          >
            <Icon name="x" size={20} color="#6B7280" />
            <ThemedText style={styles.cancelText}>Cancel</ThemedText>
          </Pressable>
          
          <ThemedText style={styles.editHeaderTitle}>Editing</ThemedText>
          
          <Pressable 
            onPress={handleSaveEdit}
            disabled={isSaving}
            style={({ pressed }) => [
              styles.headerBtn,
              styles.saveHeaderBtn,
              pressed && { opacity: 0.85 },
              isSaving && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Save changes"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Icon name="check" size={18} color="#FFFFFF" />
                <ThemedText style={styles.saveHeaderText}>Save</ThemedText>
              </>
            )}
          </Pressable>
        </View>

        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.editScrollView}
            contentContainerStyle={styles.editScrollContent}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            {/* Date indicator */}
            <View style={styles.dateLine}>
              <Icon name="calendar" size={14} color="#9CA3AF" />
              <ThemedText style={styles.dateText}>{when}</ThemedText>
              {timeStr ? (
                <>
                  <View style={styles.dateDot} />
                  <ThemedText style={styles.dateText}>{timeStr}</ThemedText>
                </>
              ) : null}
            </View>

            {/* Full-page TextInput - Apple Notes style */}
            <TextInput
              style={styles.fullPageInput}
              value={editContent}
              onChangeText={setEditContent}
              multiline
              autoFocus
              placeholder="Write your thoughts..."
              placeholderTextColor="#9CA3AF"
              textAlignVertical="top"
              scrollEnabled={false}
              pointerEvents="auto"
              accessible
              accessibilityLabel="Journal content"
            />

            {saveError ? (
              <View style={styles.errorBox}>
                <Icon name="alert-circle" size={14} color="#DC2626" />
                <ThemedText style={styles.errorBoxText}>{saveError}</ThemedText>
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // Render view mode
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Bottom success toast */}
      <BottomToast
        visible={showSaveSuccess}
        message="Changes saved"
        type="success"
        onHide={() => setShowSaveSuccess(false)}
      />

      {/* View mode header */}
      <Animated.View style={[styles.viewHeader, makeFadeUp(entranceHeader)]}>
        <Pressable 
          onPress={() => router.replace('/(student)/(tabs)/journal')} 
          accessibilityRole="button" 
          style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
          accessibilityLabel="Go back to journal list"
        >
          <Icon name="arrow-left" size={20} color="#047857" />
        </Pressable>
        
        <View style={styles.headerActions}>
          <Pressable 
            onPress={handleStartEdit}
            style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Edit entry"
          >
            <Icon name="edit-2" size={20} color="#047857" />
          </Pressable>
          <Pressable 
            onPress={handleDeletePress}
            style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Delete entry"
          >
            <Icon name="trash-2" size={20} color="#DC2626" />
          </Pressable>
        </View>
      </Animated.View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <View style={[styles.skeletonLine, { width: '60%', height: 24 }]} />
          <View style={[styles.skeletonLine, { width: '40%', height: 14, marginTop: 8 }]} />
          <View style={[styles.skeletonLine, { width: '100%', marginTop: 32 }]} />
          <View style={[styles.skeletonLine, { width: '92%' }]} />
          <View style={[styles.skeletonLine, { width: '88%' }]} />
          <View style={[styles.skeletonLine, { width: '96%' }]} />
        </View>
      ) : error ? (
        <View style={styles.errorWrap}>
          <Icon name="book-open" size={48} color="#DC2626" />
          <ThemedText style={{ color: '#DC2626', marginTop: 12, textAlign: 'center' }}>{error}</ThemedText>
          <Button title="Go back" variant="outline" onPress={() => router.replace('/(student)/(tabs)/journal')} style={{ marginTop: 16 }} />
        </View>
      ) : (
        <Animated.View style={[styles.contentWrap, { opacity: cardOpacity }, makeFadeUp(entranceContent)]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.viewScrollContent}
          >
            {/* Title */}
            <ThemedText style={styles.viewTitle}>{title}</ThemedText>
            
            {/* Date line */}
            <View style={styles.dateLine}>
              <Icon name="calendar" size={14} color="#9CA3AF" />
              <ThemedText style={styles.dateText}>{when}</ThemedText>
              {timeStr ? (
                <>
                  <View style={styles.dateDot} />
                  <ThemedText style={styles.dateText}>{timeStr}</ThemedText>
                </>
              ) : null}
            </View>

            {/* Subtle divider */}
            <View style={styles.divider} />

            {/* Content - clean paper-like display */}
            <ThemedText style={styles.viewContent}>{content}</ThemedText>
          </ScrollView>
        </Animated.View>
      )}

      {/* Delete confirmation modal */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={handleCancelDelete}>
        <View style={styles.overlay}>
          <Animated.View
            style={StyleSheet.flatten([
              styles.confirmCard,
              {
                transform: [
                  { scale: confirmScale.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
                  { translateY: confirmScale.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
                ],
                opacity: confirmScale,
              },
            ])}
          >
            <View style={styles.confirmIconWrap}>
              <Icon name="trash-2" size={28} color="#DC2626" />
            </View>
            <ThemedText style={styles.confirmTitle}>Let this story go?</ThemedText>
            <ThemedText style={styles.confirmMessage}>
              This entry will be hidden from your journal. You can always write new entries to express yourself.
            </ThemedText>
            {deleteError ? (
              <View style={[styles.noticeBox, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
                <ThemedText style={{ color: '#B91C1C', fontSize: 13 }}>{deleteError}</ThemedText>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <Button
                title="Keep it"
                variant="ghost"
                onPress={handleCancelDelete}
                disabled={isDeleting}
                style={{ flex: 1, paddingVertical: 12, backgroundColor: 'rgba(13,140,79,0.08)', borderWidth: 0 }}
                textStyle={{ fontSize: 14 }}
              />
              <Button
                title={isDeleting ? 'Deleting…' : 'Delete entry'}
                variant="ghost"
                onPress={handleConfirmDelete}
                loading={isDeleting}
                style={{ flex: 1, paddingVertical: 12, backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 0 }}
                textStyle={{ fontSize: 14, color: '#DC2626' }}
              />
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAF8', // Warm off-white/cream background
  },
  // === HEADERS === (transparent, no white box)
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    // No background, no border - seamless with page
  },
  viewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    // No background, no border - seamless with page
  },
  editHeaderTitle: {
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerIconBtn: {
    padding: 10,
    borderRadius: 8,
  },
  cancelText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: '#6B7280',
  },
  saveHeaderBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
  },
  saveHeaderText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  // === LOADING STATE ===
  loadingWrap: {
    flex: 1,
    paddingTop: 40,
    paddingHorizontal: 24,
    gap: 10,
  },
  skeletonLine: {
    height: 16,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  // === ERROR STATE ===
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  // === EDIT MODE ===
  editScrollView: {
    flex: 1,
  },
  editScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  fullPageInput: {
    fontFamily: 'Inter_400Regular',
    fontSize: 17,
    lineHeight: 28,
    color: '#374151',
    letterSpacing: 0.1,
    minHeight: 300,
    textAlignVertical: 'top',
    padding: 0,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorBoxText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#DC2626',
    flex: 1,
  },
  // === VIEW MODE ===
  contentWrap: {
    flex: 1,
  },
  viewScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  viewTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 26,
    color: '#1F2937',
    letterSpacing: -0.5,
    lineHeight: 34,
    marginBottom: 12,
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
  dateDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#D1D5DB',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginBottom: 24,
  },
  viewContent: {
    fontFamily: 'Inter_400Regular',
    fontSize: 17,
    lineHeight: 30,
    color: '#374151',
    letterSpacing: 0.1,
  },
  // === DELETE MODAL ===
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  confirmCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    gap: 16,
    width: '100%',
    maxWidth: 360,
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
  confirmIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
  },
  confirmTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    color: '#111827',
  },
  confirmMessage: {
    fontSize: 14,
    textAlign: 'center',
    color: '#6B7280',
    lineHeight: 22,
  },
  noticeBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
});
