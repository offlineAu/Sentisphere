import { StyleSheet } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { GlobalScreenWrapper } from '@/components/GlobalScreenWrapper';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, View, Modal, ActivityIndicator, LayoutAnimation, UIManager, TextInput, Image } from 'react-native';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Icon } from '@/components/ui/icon';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { KeyboardAwareScrollView, KeyboardAwareScrollViewRef } from '@/components/KeyboardAwareScrollView';
import { BottomToast, ToastType } from '@/components/BottomToast';

// Availability slot type from backend
type AvailabilitySlot = {
  day: string;
  start: string;
  end: string;
};

// Counselor type matching backend response
type Counselor = {
  user_id: number;
  name?: string | null;
  nickname?: string | null;
  email?: string | null;
  title?: string;
  availability?: AvailabilitySlot[];
};

// Default time slots when counselor has no availability set
const DEFAULT_TIME_SLOTS = ['9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM'];

// Helper to convert 24h time to 12h format
const formatTime12h = (hour: number): string => {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:00 ${period}`;
};

// Generate time slots from counselor availability
const generateTimeSlots = (availability: AvailabilitySlot[] | undefined): string[] => {
  if (!availability || availability.length === 0) {
    return DEFAULT_TIME_SLOTS;
  }
  const slots: string[] = [];
  for (const slot of availability) {
    const [startHour] = slot.start.split(':').map(Number);
    const [endHour] = slot.end.split(':').map(Number);
    for (let h = startHour; h < endHour; h++) {
      slots.push(formatTime12h(h));
    }
  }
  // Deduplicate and sort by time
  const unique = [...new Set(slots)];
  return unique.length > 0 ? unique : DEFAULT_TIME_SLOTS;
};

export default function AppointmentsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme] as any;
  const focusBlue = '#3B82F6';
  const insets = useSafeAreaInsets();

  const goBack = () => {
    if (Platform.OS !== 'web') {
      try { Haptics.selectionAsync() } catch { }
    }
    router.back();
  };
  const API = process.env.EXPO_PUBLIC_API_URL || 'https://sentisphere-production.up.railway.app';

  // Form state (survey-style)
  const [fullName, setFullName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [preferredCounselor, setPreferredCounselor] = useState('');
  // Dynamic time slots based on selected counselor's availability
  const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>(DEFAULT_TIME_SLOTS);
  const [urgency, setUrgency] = useState<'low' | 'medium' | 'high' | 'urgent'>('low');
  const [reason, setReason] = useState('');
  const [previous, setPrevious] = useState<'none' | 'institution' | 'other'>('none');
  const [additional, setAdditional] = useState('');
  const [displayNickname, setDisplayNickname] = useState('');
  // Focus states for inputs (active border)
  const [focusFullName, setFocusFullName] = useState(false);
  const [focusStudentId, setFocusStudentId] = useState(false);
  const [focusEmail, setFocusEmail] = useState(false);
  const [focusPhone, setFocusPhone] = useState(false);

  // Dynamic counselors from backend
  const [counselors, setCounselors] = useState<Counselor[]>([]);
  const [counselorsLoading, setCounselorsLoading] = useState(false);

  // Helper to get auth token
  const getAuthToken = async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try { return (window as any)?.localStorage?.getItem('auth_token') || null } catch { return null }
    }
    try { return await SecureStore.getItemAsync('auth_token') } catch { return null }
  };

  // Fetch counselors from backend
  const loadCounselors = useCallback(async () => {
    setCounselorsLoading(true);
    try {
      const tok = await getAuthToken();
      if (!tok) return;
      const res = await fetch(`${API}/api/mobile/counselors`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data: Counselor[] = await res.json();
        // Add default title if not present
        const counselorsWithTitle = data.map(c => ({
          ...c,
          title: c.title || 'Guidance Counselor'
        }));
        setCounselors(counselorsWithTitle);
      } else {
        console.error('Failed to load counselors:', res.status);
      }
    } catch (e) {
      console.error('Error loading counselors:', e);
    } finally {
      setCounselorsLoading(false);
    }
  }, [API]);

  // Load counselors when screen focuses
  useFocusEffect(
    useCallback(() => {
      loadCounselors();
      return () => { };
    }, [loadCounselors])
  );

  // Scheduler state
  type Step = 0 | 1 | 2; // 0 choose counselor, 1 choose date, 2 choose time
  const [step, setStep] = useState<Step>(0);
  const [counselor, setCounselor] = useState<Counselor | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [openCounselorList, setOpenCounselorList] = useState(false);
  const [openTimeList, setOpenTimeList] = useState(false);
  const [openDatePicker, setOpenDatePicker] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [lastBooked, setLastBooked] = useState<{ counselor: string; date: string; time: string } | null>(null);
  // Start below header/segment by default; updated precisely after onLayout
  const [overlayTop, setOverlayTop] = useState(200);

  // Enable layout animation on Android
  useEffect(() => {
    // @ts-ignore: RN Android experimental flag
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      // @ts-ignore
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    const decodeJwtName = (t: string): string | null => {
      try {
        const p = t.split('.')[1];
        if (!p) return null;
        const s = p.replace(/-/g, '+').replace(/_/g, '/');
        const pad = s.length % 4 ? s + '='.repeat(4 - (s.length % 4)) : s;
        const json = typeof atob === 'function' ? atob(pad) : '';
        if (!json) return null;
        const obj = JSON.parse(json);
        return obj?.nickname || obj?.name || null;
      } catch { return null }
    };
    const getAuthToken = async (): Promise<string | null> => {
      if (Platform.OS === 'web') {
        try { return (window as any)?.localStorage?.getItem('auth_token') || null } catch { return null }
      }
      try { return await SecureStore.getItemAsync('auth_token') } catch { return null }
    };
    (async () => {
      try {
        const tok = await getAuthToken();
        if (!tok) return;
        let localName: string | null = null;
        if (Platform.OS === 'web') localName = decodeJwtName(tok);
        if (localName) setDisplayNickname((prev) => prev || localName);
        const res = await fetch(`${API}/api/auth/mobile/me`, { headers: { Authorization: `Bearer ${tok}` } });
        if (!res.ok) return;
        const d = await res.json();
        setDisplayNickname(d?.nickname || d?.name || localName || 'student');
      } catch { }
    })();
  }, [API]);

  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastText, setToastText] = useState('');
  const [toastType, setToastType] = useState<ToastType>('success');
  const showToast = (text: string, type: ToastType = 'success') => {
    setToastText(text);
    setToastType(type);
    setToastVisible(true);
  };

  // Scroll ref for auto-scroll to focused input with smooth animation
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const scrollToInput = (inputY: number = 200) => {
    // Trigger subtle animation for visual feedback
    scrollAnim.setValue(0);
    Animated.timing(scrollAnim, {
      toValue: 1,
      duration: Platform.OS === 'android' ? 220 : 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    // Calculate scroll position: input position minus offset to keep input visible but not at top
    const visibleOffset = Platform.OS === 'android' ? 180 : 200;
    const targetY = Math.max(0, inputY - visibleOffset);
    // Platform-specific delay: Android needs longer since keyboardDidShow fires after keyboard is visible
    const delay = Platform.OS === 'android' ? 150 : 80;
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
    }, delay);
  };

  // Dropdown open animations
  const calOpenAnim = useRef(new Animated.Value(0)).current;
  const timeOpenAnim = useRef(new Animated.Value(0)).current;
  const counselorOpenAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (openDatePicker) {
      calOpenAnim.setValue(0);
      Animated.timing(calOpenAnim, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [openDatePicker]);
  useEffect(() => {
    if (openTimeList) {
      timeOpenAnim.setValue(0);
      Animated.timing(timeOpenAnim, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [openTimeList]);
  useEffect(() => {
    if (openCounselorList) {
      counselorOpenAnim.setValue(0);
      Animated.timing(counselorOpenAnim, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [openCounselorList]);

  const doHaptic = async (kind: 'light' | 'selection' | 'success' = 'light') => {
    if (Platform.OS === 'web') return;
    try {
      if (kind === 'success') return await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (kind === 'selection') return await Haptics.selectionAsync();
      return await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
  };

  const canDownload = !!(fullName && studentId && email && reason);

  // Simple local upcoming item for demo
  const [upcoming, setUpcoming] = useState(
    [
      { id: 'u1', counselor: 'Dr. Sarah Johnson', date: 'March 27, 2025', time: '2:00 PM', mode: 'Virtual Meeting' },
    ] as Array<{ id: string; counselor: string; date: string; time: string; mode: string }>
  );

  const resetSchedule = () => {
    setStep(0);
    setCounselor(null);
    setDate(null);
    setTime(null);
    setOpenCounselorList(false);
    setOpenTimeList(false);
  };

  const onDownloadPdf = async () => {
    await doHaptic('selection');
    if (!canDownload) {
      showToast('Please complete required fields');
      return;
    }
    try {
      const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const generatedAt = new Date().toLocaleString();
      const brand = '#10B981';
      const safeName = (s: any) => String(s ?? '')
        .replace(/[^a-z0-9_-]+/gi, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
      const nick = safeName(displayNickname) || 'student';
      const dateForName = safeName(preferredDate || new Date().toISOString().slice(0, 10));
      let fileBaseName = `${nick}-appointment-${dateForName}`;
      if (fileBaseName.length > 80) fileBaseName = fileBaseName.slice(0, 80).replace(/-+$/, '');
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @page { margin: 40px 28px; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, Arial, sans-serif; color: #111827; }
    .wm { position: fixed; top: 42%; left: 50%; transform: translate(-50%,-50%) rotate(-30deg); font-size: 120px; font-weight: 800; color: #111827; opacity: 0.06; z-index: 0; white-space: nowrap; }
    .content { position: relative; z-index: 1; }
    .header { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 3px solid ${brand}; }
    .title { font-size: 18px; font-weight: 800; }
    .brand { color: ${brand}; }
    .meta { color: #6B7280; font-size: 11px; }
    .section { margin: 16px 0 8px; }
    .section h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #374151; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 4px 0; vertical-align: top; font-size: 12px; }
    .label { color: #6B7280; width: 42%; }
    .value { color: #111827; font-weight: 600; }
    .box { padding: 8px 10px; border: 1px solid #E5E7EB; border-radius: 8px; background: #FAFAFA; }
    .footer { margin-top: 18px; text-align: right; color: #6B7280; font-size: 10px; }
  </style>
  <title>${fileBaseName}</title>
  </head>
  <body>
    <div class="wm">Sentisphere</div>
    <div class="content">
      <div class="header">
        <div class="title"><span class="brand">Sentisphere</span> Appointment Request</div>
        <div class="meta">Generated: ${esc(generatedAt)}</div>
      </div>

      <div class="section">
        <h3>Student Information</h3>
        <table>
          <tr><td class="label">Full Name</td><td class="value">${esc(fullName)}</td></tr>
          <tr><td class="label">Student ID</td><td class="value">${esc(studentId)}</td></tr>
          <tr><td class="label">Email</td><td class="value">${esc(email)}</td></tr>
          <tr><td class="label">Phone</td><td class="value">${esc(phone || '-')}</td></tr>
        </table>
      </div>

      <div class="section">
        <h3>Meeting Preferences</h3>
        <table>
          <tr><td class="label">Preferred Date</td><td class="value">${esc(preferredDate || '-')}</td></tr>
          <tr><td class="label">Preferred Time</td><td class="value">${esc(preferredTime || '-')}</td></tr>
          <tr><td class="label">Preferred Counselor</td><td class="value">${esc(preferredCounselor || '-')}</td></tr>
          <tr><td class="label">Urgency</td><td class="value">${esc(urgency)}</td></tr>
        </table>
      </div>

      <div class="section">
        <h3>Meeting Details</h3>
        <div class="box">
          <div><span class="label">Reason:</span> <span class="value">${esc(reason)}</span></div>
          <div><span class="label">Previous Sessions:</span> <span class="value">${esc(previous)}</span></div>
          <div><span class="label">Additional Info:</span> <span class="value">${esc(additional || '-')}</span></div>
        </div>
      </div>

      <div class="footer">© ${new Date().getFullYear()} Sentisphere • student counseling services</div>
    </div>
  </body>
</html>`;

      if (Platform.OS === 'web') {
        // Use browser print dialog to save as PDF
        await Print.printAsync({ html });
        showToast('Use the browser dialog to save as PDF');
        return;
      }

      const file = await Print.printToFileAsync({ html, base64: true });
      let target = file.uri;
      try {
        const FS = FileSystem as any;
        const dir = (FS?.documentDirectory ?? FS?.cacheDirectory) as string | null;
        if (dir) {
          const baseDir = (dir as string).endsWith('/') ? dir : `${dir}/`;
          const desired = `${baseDir}${fileBaseName}.pdf`;
          try { await FileSystem.deleteAsync(desired, { idempotent: true }); } catch { }
          if ((file as any)?.base64) {
            try {
              let PDFDocumentLocal: typeof import('pdf-lib')['PDFDocument'] | null = null;
              try {
                const pdfLib = require('pdf-lib') as typeof import('pdf-lib');
                PDFDocumentLocal = pdfLib.PDFDocument;
              } catch { }
              if (PDFDocumentLocal) {
                const src = `data:application/pdf;base64,${(file as any).base64}`;
                const doc = await PDFDocumentLocal.load(src);
                doc.setTitle(fileBaseName);
                const updatedBase64 = await doc.saveAsBase64({ dataUri: false });
                await FileSystem.writeAsStringAsync(desired, updatedBase64, { encoding: (FS?.EncodingType?.Base64 ?? 'base64') } as any);
              } else {
                await FileSystem.writeAsStringAsync(desired, (file as any).base64, { encoding: (FS?.EncodingType?.Base64 ?? 'base64') } as any);
              }
            } catch {
              await FileSystem.writeAsStringAsync(desired, (file as any).base64, { encoding: (FS?.EncodingType?.Base64 ?? 'base64') } as any);
            }
          } else {
            await FileSystem.copyAsync({ from: file.uri, to: desired });
          }
          try { await FileSystem.deleteAsync(file.uri, { idempotent: true }); } catch { }
          target = desired;
        }
      } catch { }

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(target, { mimeType: 'application/pdf', dialogTitle: `${fileBaseName}.pdf`, UTI: 'com.adobe.pdf' });
      } else if (Platform.OS === 'android') {
        try {
          const FS = FileSystem as any;
          const perm = await FS.StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (perm?.granted && perm?.directoryUri) {
            const destUri = await FS.StorageAccessFramework.createFileAsync(perm.directoryUri, `${fileBaseName}.pdf`, 'application/pdf');
            const data = (file as any)?.base64 || await FileSystem.readAsStringAsync(target, { encoding: (FS?.EncodingType?.Base64 ?? 'base64') } as any);
            await FS.StorageAccessFramework.writeAsStringAsync(destUri, data);
            showToast('Saved to selected folder');
          } else {
            showToast('Share not available');
          }
        } catch { }
      }
      await doHaptic('success');
      showToast('PDF ready');

      // Log download to backend (fire and forget)
      try {
        const tok = await getAuthToken();
        if (tok) {
          fetch(`${API}/api/mobile/appointment-log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
            body: JSON.stringify({
              form_type: 'appointment_request',
              remarks: `Counselor: ${preferredCounselor || 'Any'}, Date: ${preferredDate || 'N/A'}`
            }),
          }).catch(() => { });
        }
      } catch { }
    } catch (e) {
      showToast('Failed to generate PDF');
    }
  };

  const next = async () => {
    if (step === 0 && !counselor) return;
    if (step === 1 && !date) return;
    await doHaptic('selection');
    setStep((s) => (Math.min(2, s + 1) as Step));
  };
  const back = async () => {
    await doHaptic('selection');
    setStep((s) => (Math.max(0, s - 1) as Step));
  };

  // Derived calendar month state
  const today = useMemo(() => new Date(), []);
  const [monthCursor, setMonthCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const monthLabel = monthCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const days = useMemo(() => {
    const start = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const end = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
    const pad = start.getDay(); // 0=Sun
    const list: Array<{ key: string; day?: number; date?: Date; disabled?: boolean }> = [];
    for (let i = 0; i < pad; i++) list.push({ key: `pad-${i}` });
    for (let d = 1; d <= end.getDate(); d++) {
      const dt = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), d);
      const isPast = dt < new Date(today.getFullYear(), today.getMonth(), today.getDate());
      list.push({ key: `d-${d}`, day: d, date: dt, disabled: isPast });
    }
    return list;
  }, [monthCursor, today]);

  // Frosted glass variables
  const frostedBg = scheme === 'light' ? 'rgba(255,255,255,0.55)' : 'rgba(17,24,39,0.40)';
  const frostedBorder = scheme === 'light' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.10)';
  const frostedWeb = Platform.OS === 'web' ? ({ backdropFilter: 'blur(16px) saturate(140%)' } as any) : {};

  return (
    <GlobalScreenWrapper backgroundColor="#FFFFFF">
      <KeyboardAwareScrollView
        ref={scrollViewRef as any}
        backgroundColor="#FFFFFF"
        contentContainerStyle={{ padding: 24, paddingBottom: 60 }}
      >
        <View style={styles.page}>
          {/* Back Button */}
          <Pressable onPress={goBack} style={styles.backButton}>
            <Icon name="chevron-left" size={24} color="#111827" />
          </Pressable>

          {/* Header */}
          <View style={styles.headerSection}>
            <View style={styles.iconContainer}>
              <Image
                source={require('../../../assets/images/calendar-green.png')}
                style={styles.headerIcon}
                resizeMode="contain"
                accessible
                accessibilityLabel="Calendar icon"
              />
            </View>
            <ThemedText type="title" style={styles.headerTitle}>Request an{'\n'}Appointment</ThemedText>
            <ThemedText style={styles.headerSubtitle}>
              Submit a request for a face-to-face session with a guidance counselor
            </ThemedText>
          </View>

          {/* Info Card */}
          <View style={styles.infoCard}>
            <View style={styles.infoHeader}>
              <View style={styles.infoIconWrap}>
                <Icon name="bookmark" size={16} color="#3B82F6" />
              </View>
              <ThemedText style={styles.infoTitle}>How it works</ThemedText>
            </View>
            <View style={styles.infoSteps}>
              <View style={styles.infoStep}>
                <View style={styles.stepNumber}><ThemedText style={styles.stepNumberText}>1</ThemedText></View>
                <ThemedText style={styles.infoItem}>Fill out all required fields below</ThemedText>
              </View>
              <View style={styles.infoStep}>
                <View style={styles.stepNumber}><ThemedText style={styles.stepNumberText}>2</ThemedText></View>
                <ThemedText style={styles.infoItem}>Download the PDF form</ThemedText>
              </View>
              <View style={styles.infoStep}>
                <View style={styles.stepNumber}><ThemedText style={styles.stepNumberText}>3</ThemedText></View>
                <ThemedText style={styles.infoItem}>Submit to Guidance Office (CSM Bldg, 1st Floor)</ThemedText>
              </View>
              <View style={styles.infoStep}>
                <View style={styles.stepNumber}><ThemedText style={styles.stepNumberText}>4</ThemedText></View>
                <ThemedText style={styles.infoItem}>Expect a response within 24-48 hours</ThemedText>
              </View>
            </View>
          </View>

          <Card>
            <CardContent style={{ paddingVertical: 8, gap: 8 }}>
              <View style={{ height: 8 }} />
              <ThemedText style={styles.cardTitle}>Student Counseling Services</ThemedText>
              <ThemedText style={styles.cardSubtitle}>Complete all required fields. Download the PDF to bring to the guidance office.</ThemedText>

              {/* Student Information */}
              <View style={styles.sectionHeader}><ThemedText style={styles.sectionHeaderText}>STUDENT INFORMATION</ThemedText></View>

              <ThemedText style={styles.label}>Full Name *</ThemedText>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your full name"
                placeholderTextColor="#9CA3AF"
                selectionColor={focusBlue}
                onFocus={() => { setFocusFullName(true); doHaptic('selection'); scrollToInput(280); }}
                onBlur={() => setFocusFullName(false)}
                blurOnSubmit={false}
                returnKeyType="next"
                style={[styles.input, { borderColor: focusFullName ? focusBlue : palette.border }]}
              />

              <ThemedText style={styles.label}>Student ID *</ThemedText>
              <TextInput
                value={studentId}
                onChangeText={setStudentId}
                placeholder="Enter your student ID"
                placeholderTextColor="#9CA3AF"
                selectionColor={focusBlue}
                onFocus={() => { setFocusStudentId(true); doHaptic('selection'); scrollToInput(340); }}
                onBlur={() => setFocusStudentId(false)}
                blurOnSubmit={false}
                returnKeyType="next"
                style={[styles.input, { borderColor: focusStudentId ? focusBlue : palette.border }]}
              />

              <ThemedText style={styles.label}>Email Address *</ThemedText>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email"
                keyboardType="email-address"
                placeholderTextColor="#9CA3AF"
                selectionColor={focusBlue}
                onFocus={() => { setFocusEmail(true); doHaptic('selection'); scrollToInput(400); }}
                onBlur={() => setFocusEmail(false)}
                blurOnSubmit={false}
                returnKeyType="next"
                style={[styles.input, { borderColor: focusEmail ? focusBlue : palette.border }]}
                autoCapitalize="none"
              />

              <ThemedText style={styles.label}>Phone Number</ThemedText>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="Enter your phone number"
                keyboardType="phone-pad"
                placeholderTextColor="#9CA3AF"
                selectionColor={focusBlue}
                onFocus={() => { setFocusPhone(true); doHaptic('selection'); scrollToInput(460); }}
                onBlur={() => setFocusPhone(false)}
                blurOnSubmit={false}
                returnKeyType="done"
                style={[styles.input, { borderColor: focusPhone ? focusBlue : palette.border }]}
              />

              {/* Meeting Preferences */}
              <View style={styles.sectionHeader}><ThemedText style={styles.sectionHeaderText}>MEETING PREFERENCES</ThemedText></View>

              <ThemedText style={styles.label}>Preferred Date</ThemedText>
              <Pressable
                onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpenDatePicker((o) => !o); doHaptic('selection'); }}
                style={StyleSheet.flatten([styles.field, { borderColor: openDatePicker ? focusBlue : palette.border }])}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Icon name="calendar" size={18} color={palette.icon} />
                  <ThemedText style={[styles.fieldText, { color: preferredDate ? palette.text : '#9CA3AF' }]}>{preferredDate || 'Pick a date'}</ThemedText>
                </View>
                <Icon name="arrow-right" size={18} color={palette.icon} />
              </Pressable>
              {openDatePicker && (
                <Animated.View
                  style={StyleSheet.flatten([
                    styles.calendar,
                    {
                      borderColor: '#E5E7EB',
                      backgroundColor: '#FFFFFF',
                      opacity: calOpenAnim,
                      transform: [{ translateY: calOpenAnim.interpolate({ inputRange: [0, 1], outputRange: [-4, 0] }) }],
                    },
                  ])}
                >
                  {/* Calendar header */}
                  <View style={styles.calHeader}>
                    <Pressable
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      onPress={() => { setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1)); doHaptic('selection'); }}
                      style={StyleSheet.flatten([styles.calHeaderBtn, { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' }])}
                    >
                      <ThemedText style={{ fontSize: 20 }}>{'‹'}</ThemedText>
                    </Pressable>
                    <ThemedText style={{ fontFamily: 'Inter_600SemiBold', fontSize: 20 }}>{monthLabel}</ThemedText>
                    <Pressable
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      onPress={() => { setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1)); doHaptic('selection'); }}
                      style={StyleSheet.flatten([styles.calHeaderBtn, { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' }])}
                    >
                      <ThemedText style={{ fontSize: 20 }}>{'›'}</ThemedText>
                    </Pressable>
                  </View>
                  {/* Weekdays */}
                  <View style={styles.weekRow}>
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((w) => (
                      <ThemedText key={w} style={[styles.weekdayText, { color: palette.muted }]}>{w}</ThemedText>
                    ))}
                  </View>
                  {/* Grid */}
                  <View style={styles.calendarGrid}>
                    {days.map((d) => {
                      if (!d.day) return <View key={d.key} style={styles.dayCell} />;
                      const isSelected = !!(date && d.date && date.toDateString() === d.date.toDateString());
                      const isToday = !!(d.date && d.date.toDateString() === new Date().toDateString());
                      return (
                        <Pressable
                          key={d.key}
                          disabled={d.disabled}
                          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                          onPress={() => {
                            const picked = d.date!;
                            setDate(picked);
                            const pretty = picked.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
                            setPreferredDate(pretty);
                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                            setOpenDatePicker(false);
                            doHaptic('selection');
                            showToast('Date selected');
                          }}
                          style={({ pressed }) => [
                            styles.day,
                            d.disabled && { opacity: 0.35 },
                            { transform: [{ scale: pressed ? 0.96 : 1 }] },
                          ]}
                        >
                          <View
                            style={StyleSheet.flatten([
                              styles.dayInner,
                              isSelected
                                ? { backgroundColor: 'rgba(17,24,39,0.92)' }
                                : isToday
                                  ? { borderWidth: 2, borderColor: '#10B981' }
                                  : null,
                            ])}
                          >
                            <ThemedText style={[styles.dayText, { color: isSelected ? '#FFFFFF' : palette.text }]}>{d.day}</ThemedText>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </Animated.View>
              )}

              <ThemedText style={styles.label}>Preferred Counselor</ThemedText>
              <Pressable
                onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpenCounselorList((o) => !o); doHaptic('selection'); }}
                style={StyleSheet.flatten([styles.field, { borderColor: openCounselorList ? focusBlue : palette.border }])}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Icon name="user" size={18} color={palette.icon} />
                  <ThemedText style={[styles.fieldText, { color: preferredCounselor ? palette.text : '#9CA3AF' }]}>{preferredCounselor || 'Select a counselor'}</ThemedText>
                </View>
                <Icon name="arrow-right" size={18} color={palette.icon} />
              </Pressable>
              {openCounselorList && (
                <Animated.View
                  style={StyleSheet.flatten([
                    styles.dropdown,
                    {
                      borderColor: palette.border,
                      backgroundColor: '#FFFFFF',
                      opacity: counselorOpenAnim,
                      transform: [{ translateY: counselorOpenAnim.interpolate({ inputRange: [0, 1], outputRange: [-4, 0] }) }],
                    },
                  ])}
                >
                  {counselorsLoading ? (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                      <ActivityIndicator size="small" color="#0D8C4F" />
                      <ThemedText style={{ color: '#6B7280', fontSize: 12, marginTop: 8 }}>Loading counselors...</ThemedText>
                    </View>
                  ) : counselors.length === 0 ? (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                      <Icon name="user" size={24} color="#9CA3AF" />
                      <ThemedText style={{ color: '#6B7280', fontSize: 13, marginTop: 8, textAlign: 'center' }}>No counselors available</ThemedText>
                      <Pressable
                        onPress={() => { loadCounselors(); doHaptic('selection'); }}
                        style={{ marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#F3F4F6', borderRadius: 8 }}
                      >
                        <ThemedText style={{ color: '#0D8C4F', fontSize: 13, fontFamily: 'Inter_500Medium' }}>Retry</ThemedText>
                      </Pressable>
                    </View>
                  ) : (
                    counselors.map((c) => (
                      <Pressable
                        key={c.user_id}
                        onPress={() => {
                          setCounselor(c);
                          setPreferredCounselor(c.name || c.nickname || c.email || 'Counselor');
                          // Generate time slots from counselor's availability
                          const slots = generateTimeSlots(c.availability);
                          setAvailableTimeSlots(slots);
                          // Clear previously selected time since availability changed
                          setPreferredTime('');
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setOpenCounselorList(false);
                          doHaptic('selection');
                          showToast('Counselor selected');
                        }}
                        style={({ pressed }) => [styles.option, { backgroundColor: pressed ? '#F3F4F6' : 'transparent' }]}
                      >
                        <ThemedText style={styles.optionText}>{c.name || c.nickname || c.email}</ThemedText>
                        <ThemedText style={styles.optionSubtext}>{c.title || 'Guidance Counselor'}</ThemedText>
                      </Pressable>
                    ))
                  )}
                </Animated.View>
              )}

              <ThemedText style={styles.label}>Preferred Time</ThemedText>
              <Pressable
                onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpenTimeList((o) => !o); doHaptic('selection'); }}
                style={StyleSheet.flatten([styles.field, { borderColor: openTimeList ? focusBlue : palette.border }])}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Icon name="clock" size={18} color={palette.icon} />
                  <ThemedText style={[styles.fieldText, { color: preferredTime ? palette.text : '#9CA3AF' }]}>{preferredTime || 'Select preferred time'}</ThemedText>
                </View>
                <Icon name="arrow-right" size={18} color={palette.icon} />
              </Pressable>
              {openTimeList && (
                <Animated.View
                  style={StyleSheet.flatten([
                    styles.dropdown,
                    {
                      borderColor: palette.border,
                      backgroundColor: '#FFFFFF',
                      opacity: timeOpenAnim,
                      transform: [{ translateY: timeOpenAnim.interpolate({ inputRange: [0, 1], outputRange: [-4, 0] }) }],
                    },
                  ])}
                >
                  {availableTimeSlots.length === 0 ? (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                      <Icon name="clock" size={24} color="#9CA3AF" />
                      <ThemedText style={{ color: '#6B7280', fontSize: 13, marginTop: 8, textAlign: 'center' }}>No time slots available</ThemedText>
                    </View>
                  ) : (
                    availableTimeSlots.map((t: string) => (
                      <Pressable
                        key={t}
                        onPress={() => { setPreferredTime(t); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpenTimeList(false); doHaptic('selection'); showToast('Time selected'); }}
                        style={({ pressed }) => [styles.option, { backgroundColor: pressed ? '#F3F4F6' : 'transparent' }]}
                      >
                        <ThemedText style={styles.optionText}>{t}</ThemedText>
                      </Pressable>
                    ))
                  )}
                </Animated.View>
              )}

              <ThemedText style={styles.label}>Urgency Level</ThemedText>
              {([
                { key: 'low', label: 'Low - Can wait 1-2 weeks' },
                { key: 'medium', label: 'Medium - Within this week' },
                { key: 'high', label: 'High - Within 1-2 days' },
                { key: 'urgent', label: 'Urgent - Same day if possible' },
              ] as const).map((u) => (
                <Pressable key={u.key} onPress={() => { setUrgency(u.key as any); doHaptic('selection'); }} style={styles.radioRow}>
                  <View style={[styles.radioOuter, { borderColor: urgency === u.key ? '#111827' : palette.border }]}>
                    {urgency === u.key && <View style={styles.radioInner} />}
                  </View>
                  <ThemedText style={styles.radioLabel}>{u.label}</ThemedText>
                </Pressable>
              ))}

              {/* Meeting Details */}
              <View style={styles.sectionHeader}><ThemedText style={styles.sectionHeaderText}>MEETING DETAILS</ThemedText></View>

              <ThemedText style={styles.label}>Reason for Meeting *</ThemedText>
              <Textarea value={reason} onChangeText={setReason} placeholder="Please describe the reason for your meeting request..." style={{ height: 110 }} onFocus={() => { doHaptic('selection'); }} />

              <ThemedText style={styles.label}>Have you had previous counseling sessions?</ThemedText>
              {([
                { key: 'none', label: 'No, this is my first time' },
                { key: 'institution', label: 'Yes, at this institution' },
                { key: 'other', label: 'Yes, at another institution' },
              ] as const).map((o) => (
                <Pressable key={o.key} onPress={() => { setPrevious(o.key as any); doHaptic('selection'); }} style={styles.radioRow}>
                  <View style={[styles.radioOuter, { borderColor: previous === o.key ? '#111827' : palette.border }]}>
                    {previous === o.key && <View style={styles.radioInner} />}
                  </View>
                  <ThemedText style={styles.radioLabel}>{o.label}</ThemedText>
                </Pressable>
              ))}

              <ThemedText style={styles.label}>Additional Information</ThemedText>
              <Textarea value={additional} onChangeText={setAdditional} placeholder="Any additional information you'd like to share..." style={{ height: 100 }} onFocus={() => { doHaptic('selection'); }} />
              <View style={styles.noticeBox}>
                <ThemedText style={styles.noticeTitle}>MEETING TYPE: FACE-TO-FACE ONLY</ThemedText>
                <ThemedText style={styles.noticeText}>
                  All meetings will be conducted in person at the Guidance Office is located at the CSM building First floor room number 104. Please arrive 10 minutes early for your appointment.
                </ThemedText>
              </View>

              <Button title="Download PDF" onPress={onDownloadPdf} disabled={!canDownload} />
            </CardContent>
          </Card>
        </View>
      </KeyboardAwareScrollView>

      {/* Booking overlay */}
      <Modal visible={isBooking} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <ActivityIndicator size="small" color="#111827" />
            <ThemedText style={{ marginTop: 8 }}>Booking...</ThemedText>
          </View>
        </View>
      </Modal>

      {/* Confirmation dialog */}
      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check-circle" size={20} color="#FFFFFF" />
            </View>
            <ThemedText type="subtitle" style={{ marginTop: 10 }}>Booking Confirmed</ThemedText>
            {lastBooked ? (
              <ThemedText style={{ color: '#6B7280', textAlign: 'center' }}>
                Your appointment with {lastBooked.counselor} on {lastBooked.date} at {lastBooked.time} has been confirmed.
              </ThemedText>
            ) : null}
            <View style={{ marginTop: 10, alignSelf: 'stretch' }}>
              <Button title="Done" onPress={() => setConfirmVisible(false)} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Bottom Toast */}
      <BottomToast
        visible={toastVisible}
        message={toastText}
        type={toastType}
        onHide={() => setToastVisible(false)}
      />
    </GlobalScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  page: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  // Header Section
  headerSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  headerIcon: {
    width: 44,
    height: 44,
  },
  headerTitle: {
    textAlign: 'center',
    fontSize: 28,
    lineHeight: 34,
    marginBottom: 8,
  },
  headerSubtitle: {
    color: '#6B7280',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 300,
  },
  // Info Card
  infoCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    marginBottom: 20,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  infoIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitle: { fontFamily: 'Inter_600SemiBold', color: '#1E40AF', fontSize: 15 },
  infoSteps: { gap: 10 },
  infoStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  infoItem: { fontSize: 14, color: '#1E40AF', flex: 1, lineHeight: 20 },

  // Card Styles
  cardTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#111827', marginBottom: 4 },
  cardSubtitle: { fontSize: 14, color: '#6B7280', marginBottom: 12, lineHeight: 20 },

  // Section Headers & Labels
  sectionHeader: { marginTop: 20, marginBottom: 10, paddingTop: 8, borderBottomWidth: 2, borderBottomColor: '#E5E7EB' },
  sectionHeaderText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#6B7280', letterSpacing: 0.5, marginBottom: 8 },
  label: { fontSize: 14, marginTop: 10, marginBottom: 6, color: '#111827', fontFamily: 'Inter_600SemiBold' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 6,
    fontSize: 14,
  },
  fieldText: { fontSize: 14 },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#111827' },
  radioLabel: { fontSize: 14, color: '#374151', flex: 1 },
  noticeBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 8,
    marginTop: 16,
    marginBottom: 12,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  noticeTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#111827', letterSpacing: 0.3 },
  noticeText: { fontSize: 14, color: '#6B7280', lineHeight: 20 },
  segment: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
    overflow: 'hidden',
  },
  segmentIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 999,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 10,
  },
  segmentText: { fontFamily: 'Inter_500Medium' },
  field: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdown: {
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 8,
    overflow: 'hidden',
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  optionText: { fontSize: 14, color: '#111827' },
  optionSubtext: { fontSize: 13, color: '#6B7280' },
  calendar: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    marginTop: 8,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  calHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  weekRow: { flexDirection: 'row', marginBottom: 8 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: '14.2857%',
    aspectRatio: 1,
  },
  day: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  dayInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  dayText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  emptyWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 1000,
    // elevation for Android to ensure overlay is above ScrollView content
    elevation: 6,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
});
