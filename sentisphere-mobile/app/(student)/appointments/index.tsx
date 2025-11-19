import { StyleSheet } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, View, Modal, ActivityIndicator, LayoutAnimation, UIManager, TextInput, KeyboardAvoidingView, Image } from 'react-native';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Icon } from '@/components/ui/icon';

type Counselor = { id: string; name: string; title: string };

const COUNSELORS: Counselor[] = [
  { id: 'sarah', name: 'Dr. Sarah Johnson', title: 'Licensed Counselor' },
  { id: 'marco', name: 'Marco Lee', title: 'Mental Health Coach' },
  { id: 'emma', name: 'Emma Clark', title: 'Therapist, CBT' },
  { id: 'alex', name: 'Alex Kim', title: 'Wellness Counselor' },
];

const TIME_SLOTS = ['9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM'];

export default function AppointmentsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme] as any;
  const focusBlue = '#3B82F6';

  // Form state (survey-style)
  const [fullName, setFullName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [preferredCounselor, setPreferredCounselor] = useState('');
  const [urgency, setUrgency] = useState<'low' | 'medium' | 'high' | 'urgent'>('low');
  const [reason, setReason] = useState('');
  const [previous, setPrevious] = useState<'none' | 'institution' | 'other'>('none');
  const [additional, setAdditional] = useState('');
  // Focus states for inputs (active border)
  const [focusFullName, setFocusFullName] = useState(false);
  const [focusStudentId, setFocusStudentId] = useState(false);
  const [focusEmail, setFocusEmail] = useState(false);
  const [focusPhone, setFocusPhone] = useState(false);
  

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

  // Toast
  const toast = useRef(new Animated.Value(0)).current;
  const [toastText, setToastText] = useState('');
  const showToast = (text: string) => {
    setToastText(text);
    Animated.timing(toast, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      setTimeout(() => {
        Animated.timing(toast, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      }, 1200);
    });
  };

  // Removed magnet auto-scroll for now

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
    } catch {}
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
  <title>Sentisphere Appointment Request</title>
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

      const file = await Print.printToFileAsync({ html });
      const safe = (studentId || fullName || 'student').replace(/[^a-z0-9_-]+/gi, '_');
      const FS = FileSystem as any;
      const dir: string | null = (FS?.documentDirectory as string | null) ?? (FS?.cacheDirectory as string | null) ?? null;
      if (!dir) { showToast('Storage unavailable'); return; }
      const baseDir = (dir as string).endsWith('/') ? dir : `${dir}/`;
      const target = `${baseDir}Sentisphere_Appointment_${safe}.pdf`;
      try { await FileSystem.deleteAsync(target, { idempotent: true }); } catch {}
      await FileSystem.moveAsync({ from: file.uri, to: target });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(target, { mimeType: 'application/pdf', dialogTitle: 'Share Appointment PDF', UTI: 'com.adobe.pdf' });
      }
      await doHaptic('success');
      showToast('PDF ready');
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
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 72 : 0} style={{ flex: 1 }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        contentContainerStyle={{ padding: 24, paddingBottom: 60 }}
      >
        <View style={styles.page}>
          <View style={{ height: 8 }} />
          <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: 4, marginBottom: 10 }}>
            <Image
              source={require('../../../assets/images/calendar green.png')}
              style={{ width: 56, height: 56, marginBottom: 6 }}
              resizeMode="contain"
              accessible
              accessibilityLabel="Calendar icon"
            />
            <ThemedText type="title" style={{ textAlign: 'center' }}>Appointment Request Form</ThemedText>
          </View>
          <ThemedText style={{ color: palette.muted, textAlign: 'center', marginBottom: 14 }}>
            Fill out this form to request a face-to-face meeting with a counselor. You can download a PDF copy to bring to the guidance office.
          </ThemedText>

          <View style={styles.infoCard}>
            <ThemedText style={styles.infoTitle}>How to use this form:</ThemedText>
            <ThemedText style={styles.infoItem}>1. Fill out all required fields marked with an asterisk (*)</ThemedText>
            <ThemedText style={styles.infoItem}>2. Click "Download PDF" to generate a printable copy</ThemedText>
            <ThemedText style={styles.infoItem}>3. Bring the printed form to the Guidance Office (Building A, 2nd Floor)</ThemedText>
            <ThemedText style={styles.infoItem}>4. A counselor will review your request and contact you within 24-48 hours</ThemedText>
          </View>
          <View style={{ height: 12 }} />

          <Card>
            <CardContent style={{ paddingVertical: 8, gap: 8 }}>
              <View style={{ height: 8 }} />
              <ThemedText type="subtitle">Student Counseling Services</ThemedText>
              <ThemedText style={{ color: palette.muted, marginBottom: 8 }}>Complete all required fields. Download the PDF to bring to the guidance office.</ThemedText>

              {/* Student Information */}
              <View style={styles.sectionHeader}><ThemedText style={styles.sectionHeaderText}>STUDENT INFORMATION</ThemedText></View>

              <ThemedText style={styles.label}>Full Name *</ThemedText>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your full name"
                placeholderTextColor="#9CA3AF"
                selectionColor={focusBlue}
                onFocus={() => { setFocusFullName(true); doHaptic('selection'); }}
                onBlur={() => setFocusFullName(false)}
                style={[styles.input, { borderColor: focusFullName ? focusBlue : palette.border }]}
              />

              <ThemedText style={styles.label}>Student ID *</ThemedText>
              <TextInput
                value={studentId}
                onChangeText={setStudentId}
                placeholder="Enter your student ID"
                placeholderTextColor="#9CA3AF"
                selectionColor={focusBlue}
                onFocus={() => { setFocusStudentId(true); doHaptic('selection'); }}
                onBlur={() => setFocusStudentId(false)}
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
                onFocus={() => { setFocusEmail(true); doHaptic('selection'); }}
                onBlur={() => setFocusEmail(false)}
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
                onFocus={() => { setFocusPhone(true); doHaptic('selection'); }}
                onBlur={() => setFocusPhone(false)}
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
                  <ThemedText style={{ color: preferredDate ? palette.text : '#9CA3AF' }}>{preferredDate || 'Pick a date'}</ThemedText>
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
                    {['Su','Mo','Tu','We','Th','Fr','Sa'].map((w) => (
                      <ThemedText key={w} style={[styles.weekdayText, { color: palette.muted }]}>{w}</ThemedText>
                    ))}
                  </View>
                  {/* Grid */}
                  <View style={styles.grid}>
                    {days.map((d) => {
                      if (!d.day) return <View key={d.key} style={{ width: '14.2857%', aspectRatio: 1 }} />;
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

              <ThemedText style={styles.label}>Preferred Time</ThemedText>
              <Pressable
                onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpenTimeList((o) => !o); doHaptic('selection'); }}
                style={StyleSheet.flatten([styles.field, { borderColor: openTimeList ? focusBlue : palette.border }])}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Icon name="clock" size={18} color={palette.icon} />
                  <ThemedText style={{ color: preferredTime ? palette.text : '#9CA3AF' }}>{preferredTime || 'Select preferred time'}</ThemedText>
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
                  {TIME_SLOTS.map((t) => (
                    <Pressable
                      key={t}
                      onPress={() => { setPreferredTime(t); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpenTimeList(false); doHaptic('selection'); showToast('Time selected'); }}
                      style={({ pressed }) => [styles.option, { backgroundColor: pressed ? '#F3F4F6' : 'transparent' }]}
                    >
                      <ThemedText>{t}</ThemedText>
                    </Pressable>
                  ))}
                </Animated.View>
              )}

              <ThemedText style={styles.label}>Preferred Counselor</ThemedText>
              <Pressable
                onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpenCounselorList((o) => !o); doHaptic('selection'); }}
                style={StyleSheet.flatten([styles.field, { borderColor: openCounselorList ? focusBlue : palette.border }])}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Icon name="user" size={18} color={palette.icon} />
                  <ThemedText style={{ color: preferredCounselor ? palette.text : '#9CA3AF' }}>{preferredCounselor || 'Select a counselor'}</ThemedText>
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
                  {COUNSELORS.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => { setCounselor(c); setPreferredCounselor(c.name); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpenCounselorList(false); doHaptic('selection'); showToast('Counselor selected'); }}
                      style={({ pressed }) => [styles.option, { backgroundColor: pressed ? '#F3F4F6' : 'transparent' }]}
                    >
                      <ThemedText>{c.name}</ThemedText>
                      <ThemedText style={{ color: palette.muted }}>{c.title}</ThemedText>
                    </Pressable>
                  ))}
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
                  <View style={[styles.radioOuter, { borderColor: palette.border }]}>
                    {urgency === u.key && <View style={styles.radioInner} />}
                  </View>
                  <ThemedText>{u.label}</ThemedText>
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
                  <View style={[styles.radioOuter, { borderColor: palette.border }]}>
                    {previous === o.key && <View style={styles.radioInner} />}
                  </View>
                  <ThemedText>{o.label}</ThemedText>
                </Pressable>
              ))}

              <ThemedText style={styles.label}>Additional Information</ThemedText>
              <Textarea value={additional} onChangeText={setAdditional} placeholder="Any additional information you'd like to share..." style={{ height: 100 }} onFocus={() => { doHaptic('selection'); }} />
              <View style={[styles.noticeBox, { borderColor: palette.text, marginTop: 8 }]}>
                <ThemedText style={{ fontFamily: 'Inter_700Bold' }}>MEETING TYPE: FACE-TO-FACE ONLY</ThemedText>
                <ThemedText style={{ color: palette.muted }}>
                  All meetings will be conducted in person at the Student Counseling Center, Building A, 2nd Floor. Please arrive 10 minutes early for your appointment.
                </ThemedText>
              </View>

              <Button title="Download PDF" onPress={onDownloadPdf} disabled={!canDownload} />
              <ThemedText style={styles.footnote}>
                * Fill in all required fields (Name, Student ID, Email, and Reason), then download the PDF to bring to the Student Counseling Center.
              </ThemedText>
            </CardContent>
          </Card>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      

      {/* Toast */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 24,
          transform: [{ translateY: toast.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
          opacity: toast,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#111827' }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#10B981' }}>
            {/* check icon */}
            <Icon name="check-circle" size={14} color="#FFFFFF" />
          </View>
          <ThemedText style={{ color: '#FFFFFF' }}>{toastText || 'Done'}</ThemedText>
        </View>
      </Animated.View>

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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  page: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  infoCard: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 12,
    gap: 4,
  },
  infoTitle: { fontFamily: 'Inter_600SemiBold' },
  infoItem: { fontSize: 13 },
  sectionHeader: { marginTop: 16, marginBottom: 8, paddingTop: 6, borderBottomWidth: 2, borderBottomColor: '#E5E7EB' },
  sectionHeaderText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#111827', marginBottom: 6 },
  label: { fontSize: 13, marginTop: 8, marginBottom: 6, color: '#111827', fontFamily: 'Inter_600SemiBold' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  radioOuter: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#111827' },
  noticeBox: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6, marginBottom: 10 },
  footnote: { color: '#6B7280', fontSize: 12, marginTop: 8 },
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
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  day: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  dayInner: {
    width: '84%',
    aspectRatio: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayText: {
    width: '14.2857%',
    textAlign: 'center',
    fontSize: 14,
  },
  dayText: {
    fontSize: 16,
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
});
