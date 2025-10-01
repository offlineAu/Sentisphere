import { StyleSheet } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, View, Modal, ActivityIndicator, LayoutAnimation, UIManager } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

  // Tabs: 0 = Upcoming, 1 = Schedule New
  const [tab, setTab] = useState<0 | 1>(1);
  const [segW, setSegW] = useState(0);
  const animTab = useRef(new Animated.Value(1)).current;
  const onTabChange = (next: 0 | 1) => {
    setTab(next);
    Animated.timing(animTab, { toValue: next, duration: 260, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }).start();
  };
  const indicatorStyle = (() => {
    const usable = Math.max(0, segW - 8);
    const itemW = usable > 0 ? usable / 2 : 0;
    const tx = animTab.interpolate({ inputRange: [0, 1], outputRange: [0, itemW] });
    const opacity = segW > 0 ? 1 : 0;
    return { width: Math.max(0, itemW - 0.5), transform: [{ translateX: tx }], opacity };
  })();

  // Scheduler state
  type Step = 0 | 1 | 2; // 0 choose counselor, 1 choose date, 2 choose time
  const [step, setStep] = useState<Step>(0);
  const [counselor, setCounselor] = useState<Counselor | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [openCounselorList, setOpenCounselorList] = useState(false);
  const [openTimeList, setOpenTimeList] = useState(false);
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

  const doHaptic = async (kind: 'light' | 'selection' | 'success' = 'light') => {
    if (Platform.OS === 'web') return;
    try {
      if (kind === 'success') return await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (kind === 'selection') return await Haptics.selectionAsync();
      return await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  };

  const canBook = !!(counselor && date && time);

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

  const book = async () => {
    if (!canBook || !counselor || !date || !time) return;
    setIsBooking(true);
    await new Promise((r) => setTimeout(r, 1200)); // simulated booking API
    const pretty = date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    setUpcoming((prev) => [
      { id: String(Date.now()), counselor: counselor.name, date: pretty, time, mode: 'Virtual Meeting' },
      ...prev,
    ]);
    setLastBooked({ counselor: counselor.name, date: pretty, time });
    onTabChange(0);
    setIsBooking(false);
    setConfirmVisible(true);
    await doHaptic('success');
    showToast('Appointment booked');
    resetSchedule();
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
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 160 }} scrollEnabled={!(tab === 0 && upcoming.length === 0)}>
        <View style={styles.page}>
          <View style={{ height: 16 }} />
          <ThemedText type="title">Appointments</ThemedText>
          <ThemedText style={{ color: palette.muted }}>Schedule sessions with counselors and manage your appointments</ThemedText>

        {/* Segmented control */}
        <View
          style={[styles.segment, { backgroundColor: '#EEF2F7', borderColor: palette.border, marginTop: 20 }]}
          onLayout={(e) => {
            setSegW(e.nativeEvent.layout.width);
            const y = e.nativeEvent.layout.y;
            const h = e.nativeEvent.layout.height;
            setOverlayTop(y + h + 16); // overlay starts below the segment with spacing
          }}
        >
          <Animated.View style={[styles.segmentIndicator, { backgroundColor: '#ffffff' }, indicatorStyle]} />
          <Pressable style={styles.segmentItem} onPress={() => onTabChange(0)} accessibilityRole="button" accessibilityState={tab === 0 ? { selected: true } : {}}>
            <Icon name="clock" size={16} color={palette.text} />
            <ThemedText style={styles.segmentText}>Upcoming</ThemedText>
          </Pressable>
          <Pressable style={styles.segmentItem} onPress={() => onTabChange(1)} accessibilityRole="button" accessibilityState={tab === 1 ? { selected: true } : {}}>
            <Icon name="calendar" size={16} color={palette.text} />
            <ThemedText style={styles.segmentText}>Schedule New</ThemedText>
          </Pressable>
        </View>

        {tab === 0 ? (
          <View style={{ gap: 14, marginTop: 20, alignSelf: 'stretch' }}>
            {upcoming.map((u) => (
              <Card key={u.id}>
                <CardContent>
                  <ThemedText style={{ fontFamily: 'Inter_700Bold', fontSize: 16 }}>{u.counselor}</ThemedText>
                  <ThemedText style={{ color: palette.muted }}>{u.date} at {u.time}</ThemedText>
                  <ThemedText style={{ color: palette.icon }}>{u.mode}</ThemedText>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                    <Button title="Cancel" variant="outline" onPress={() => setUpcoming((prev) => prev.filter((it) => it.id !== u.id))} />
                    <Button title="Join" onPress={() => showToast('Joining...')} />
                  </View>
                </CardContent>
              </Card>
            ))}
          </View>
        ) : (
          <Card style={{ marginTop: 20, alignSelf: 'stretch' }}>
            <CardContent>
              <ThemedText type="subtitle">Schedule New Appointment</ThemedText>
              <ThemedText style={{ color: palette.muted }}>Book a session with one of our qualified counselors</ThemedText>

              {step === 0 && (
                <View style={{ marginTop: 8 }}>
                  <ThemedText style={{ fontFamily: 'Inter_600SemiBold' }}>Select a Counselor</ThemedText>
                  {/* Field */}
                  <Pressable
                    onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpenCounselorList((o) => !o); doHaptic(); }}
                    style={StyleSheet.flatten([styles.field, { borderColor: palette.border }])}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Icon name="user" size={18} color={palette.icon} />
                      <ThemedText style={{ color: counselor ? palette.text : '#9BA1A6' }}>{counselor ? counselor.name : 'Choose a counselor'}</ThemedText>
                    </View>
                    <Icon name="arrow-right" size={18} color={palette.icon} />
                  </Pressable>

                  {openCounselorList && (
                    <View style={StyleSheet.flatten([styles.dropdown, { borderColor: palette.border, backgroundColor: '#FFFFFF' }])}>
                      {COUNSELORS.map((c) => (
                        <Pressable
                          key={c.id}
                          onPress={() => { setCounselor(c); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpenCounselorList(false); doHaptic(); showToast('Counselor selected'); }}
                          style={({ pressed }) => [styles.option, { backgroundColor: pressed ? '#F3F4F6' : 'transparent' }]}
                        >
                          <ThemedText>{c.name}</ThemedText>
                          <ThemedText style={{ color: palette.muted }}>{c.title}</ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {step === 1 && (
                <View style={{ marginTop: 8 }}>
                  <ThemedText style={{ fontFamily: 'Inter_600SemiBold' }}>Select a Date</ThemedText>
                  <View style={StyleSheet.flatten([styles.calendar, { borderColor: frostedBorder, backgroundColor: frostedBg }, frostedWeb])}>
                    {/* Calendar header */}
                    <View style={styles.calHeader}>
                      <Pressable
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        onPress={() => { setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1)); doHaptic('selection'); }}
                        style={StyleSheet.flatten([styles.calHeaderBtn, { backgroundColor: frostedBg, borderWidth: 1, borderColor: frostedBorder }, frostedWeb])}
                      >
                        <ThemedText style={{ fontSize: 20 }}>{'‹'}</ThemedText>
                      </Pressable>
                      <ThemedText style={{ fontFamily: 'Inter_600SemiBold', fontSize: 20 }}>{monthLabel}</ThemedText>
                      <Pressable
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        onPress={() => { setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1)); doHaptic('selection'); }}
                        style={StyleSheet.flatten([styles.calHeaderBtn, { backgroundColor: frostedBg, borderWidth: 1, borderColor: frostedBorder }, frostedWeb])}
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
                            onPress={() => { setDate(d.date!); doHaptic(); showToast('Date selected'); }}
                            style={({ pressed }) => [
                              styles.day,
                              isSelected && { backgroundColor: 'rgba(17,24,39,0.9)' },
                              isToday && !isSelected && { borderWidth: 1, borderColor: '#10B981' },
                              d.disabled && { opacity: 0.35 },
                              { transform: [{ scale: pressed ? 0.96 : 1 }] },
                            ]}
                          >
                            <ThemedText style={[styles.dayText, { color: isSelected ? '#FFFFFF' : palette.text }]}>{d.day}</ThemedText>
                            {isToday && !isSelected ? <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#10B981', marginTop: 2 }} /> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>
              )}

              {step === 2 && (
                <View style={{ marginTop: 8 }}>
                  <ThemedText style={{ fontFamily: 'Inter_600SemiBold' }}>Select a Time Slot</ThemedText>
                  {/* Field */}
                  <Pressable
                    onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpenTimeList((o) => !o); doHaptic(); }}
                    style={StyleSheet.flatten([styles.field, { borderColor: palette.border }])}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Icon name="clock" size={18} color={palette.icon} />
                      <ThemedText style={{ color: time ? palette.text : '#9BA1A6' }}>{time ?? 'Choose a time'}</ThemedText>
                    </View>
                    <Icon name="arrow-right" size={18} color={palette.icon} />
                  </Pressable>

                  {openTimeList && (
                    <View style={StyleSheet.flatten([styles.dropdown, { borderColor: palette.border, backgroundColor: '#FFFFFF' }])}>
                      {TIME_SLOTS.map((t) => (
                        <Pressable
                          key={t}
                          onPress={() => { setTime(t); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpenTimeList(false); doHaptic(); showToast('Time slot selected'); }}
                          style={({ pressed }) => [styles.option, { backgroundColor: pressed ? '#F3F4F6' : 'transparent' }]}
                        >
                          <ThemedText>{t}</ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Footer actions */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, justifyContent: 'space-between' }}>
                {step > 0 ? <Button title="Back" variant="outline" onPress={back} /> : <View style={{ width: 0 }} />}
                {step < 2 ? (
                  <Button title="Next" onPress={next} disabled={(step === 0 && !counselor) || (step === 1 && !date)} />
                ) : (
                  <Button title="Book Appointment" onPress={book} disabled={!canBook} loading={isBooking} />
                )}
              </View>
            </CardContent>
          </Card>
        )}
        </View>
      </ScrollView>

      {/* Empty state when no upcoming - centered message */}
      {tab === 0 && upcoming.length === 0 && (
        <View style={[styles.emptyWrap, { top: overlayTop }]} pointerEvents="box-none">
          <View style={[styles.page, { alignItems: 'center' }]}> 
            <Icon name="calendar" size={40} color={palette.icon} />
            <ThemedText type="subtitle" style={{ marginTop: 8, textAlign: 'center' }}>No upcoming appointments</ThemedText>
            <ThemedText style={{ color: palette.muted, textAlign: 'center' }}>You don’t have any sessions scheduled. Book your next session to stay on track.</ThemedText>
            <View style={{ marginTop: 12 }}>
              <Button title="Schedule New" onPress={() => onTabChange(1)} />
            </View>
          </View>
        </View>
      )}

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
