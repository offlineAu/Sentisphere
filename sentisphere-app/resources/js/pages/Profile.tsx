import DashboardLayout from '../layouts/DashboardLayout';
import styles from './Profile.module.css';
import { useEffect, useState, ReactNode } from 'react';
import api from '../lib/api';
import { LoadingSpinner } from '../components/loading-spinner';
import { Mail, Phone, PhoneCall, IdCard, Briefcase, Clock, Globe, User as UserIcon, FileText, Sparkles } from 'lucide-react';

type ProfileData = {
  name: string;
  email: string;
  phone: string;
  organization: string;
  license_number: string;
  specializations: string;
  education: string;
  bio: string;
  experience_years: string;
  languages: string;
  contact_number?: string;
  availability?: string;
  year_experience?: number;
  created_at?: string;
};

type AvailabilitySlot = {
  day: string;
  start: string;
  end: string;
};

// Prioritized Philippine languages
const PH_LANGS = [
  'Filipino', 'Tagalog', 'Cebuano', 'Ilocano', 'Hiligaynon', 'Kapampangan',
  'Bikol', 'Waray', 'Pangasinan', 'Tausug', 'Maranao', 'Maguindanao',
  'Chavacano', 'Kinaray-a', 'Surigaonon'
];

type InfoRowProps = {
  icon: ReactNode;
  label?: string;
  value: string | undefined | null;
};

type InfoSectionProps = {
  title: string;
  children: ReactNode;
};

const InfoRow = ({ icon, label, value }: InfoRowProps) => {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 text-sm text-[#111827]">
      <div className="mt-[2px] flex h-7 w-7 items-center justify-center rounded-full bg-[#f3f4f6] text-base">
        {icon}
      </div>
      <div className="flex flex-col">
        {label && <span className="text-xs font-medium text-[#6b7280]">{label}</span>}
        <span className="leading-snug break-words">{value}</span>
      </div>
    </div>
  );
};

const InfoSection = ({ title, children }: InfoSectionProps) => (
  <div className="space-y-3">
    <div className="text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">{title}</div>
    <div className="space-y-3">
      {children}
    </div>
  </div>
);

function Profile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'professional'|'contact'|'settings'|'security'>('professional');
  const [userId, setUserId] = useState<number | null>(null);
  const [data, setData] = useState<ProfileData>({
    name: '',
    email: '',
    phone: '',
    organization: '',
    license_number: '',
    specializations: '',
    education: '',
    bio: '',
    experience_years: '',
    languages: '',
    availability: '',
    contact_number: '',
  });
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [overview, setOverview] = useState({
    activeStudents: 0,
    thisWeekCheckins: 0,
    openAppointments: 0,
    highRiskFlags: 0,
  });
  const [isDirty, setIsDirty] = useState(false);
  const [otherLanguages, setOtherLanguages] = useState<string[]>([]);


  useEffect(() => {
    let mounted = true;
    const dayOrder: Record<string, number> = {
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
      Sunday: 7,
    };

    const sortSlots = (slots: AvailabilitySlot[]) =>
      [...slots].sort((a, b) => {
        const da = dayOrder[a.day] || 99;
        const db = dayOrder[b.day] || 99;
        if (da !== db) return da - db;
        return a.start.localeCompare(b.start);
      });
    
    const fetchProfile = async (uid: number) => {
      try {
        const resp = await api.get<any>(`/counselor-profile`, { params: { user_id: uid } });
        if (!mounted) return;
        
        setData(prev => ({
          ...prev,
          name: resp.data?.name || '',
          email: resp.data?.email || '',
          organization: resp.data?.department || '',
          phone: resp.data?.phone || resp.data?.contact_number || '',
          experience_years: resp.data?.experience_years || (resp.data?.year_experience ? String(resp.data?.year_experience) : ''),
          availability: resp.data?.availability || prev.availability,
          contact_number: resp.data?.contact_number || prev.contact_number,
          license_number: resp.data?.license_number || prev.license_number,
          specializations: resp.data?.specializations || prev.specializations,
          education: resp.data?.education || prev.education,
          bio: resp.data?.bio || prev.bio,
          languages: resp.data?.languages || prev.languages,
          created_at: resp.data?.created_at || prev.created_at,
        }));
        try {
          const raw = resp.data?.availability;
          if (Array.isArray(raw)) {
            const slots = raw.filter((s: any) => s && typeof s.day === 'string' && typeof s.start === 'string' && typeof s.end === 'string');
            setAvailabilitySlots(sortSlots(slots));
          } else if (typeof raw === 'string') {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              const slots = parsed.filter((s: any) => s && typeof s.day === 'string' && typeof s.start === 'string' && typeof s.end === 'string');
              setAvailabilitySlots(sortSlots(slots));
            }
          }
        } catch {}
        return true; // Success
      } catch (error) {
        console.error('Error fetching profile:', error);
        return false; // Failure
      }
    };

    const loadProfile = async () => {
      try {
        // First try with auth/me
        try {
          const me = await api.get<{ user_id: number }>(`/auth/me`);
          const uid = Number(me.data?.user_id) || 0;
          if (mounted) setUserId(uid || null);
          
          const loadUid = uid || (Number(new URLSearchParams(window.location.search).get('uid')) || 
                                Number(window.localStorage.getItem('current_user_id')) || 1);
          
          const success = await fetchProfile(loadUid);
          if (success) return;
        } catch (meError) {
          console.log('Auth/me failed, trying fallback...');
        }

        // Fallback to direct profile fetch
        const params = new URLSearchParams(window.location.search);
        const uidStr = params.get('uid') || window.localStorage.getItem('current_user_id') || '1';
        const uid = Number(uidStr) || 1;
        if (mounted) setUserId(uid);
        await fetchProfile(uid);
      } catch (error) {
        console.error('Error in profile loading sequence:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      mounted = false;
    };
  }, []);

  // Load world languages and merge with prioritized PH list
  useEffect(() => {
    const loadLangs = async () => {
      try {
        const res = await fetch('https://restcountries.com/v3.1/all');
        const arr = await res.json();
        const names = new Set<string>();
        arr.forEach((c: any) => {
          if (c && c.languages) {
            Object.values(c.languages).forEach((n: any) => {
              if (typeof n === 'string') names.add(n);
            });
          }
        });
        const phSet = new Set(PH_LANGS);
        const others = Array.from(names).filter((n) => !phSet.has(n)).sort((a, b) => a.localeCompare(b));
        setOtherLanguages(others);
      } catch {
        setOtherLanguages(['English','Spanish','Chinese','Japanese','Korean','French','German','Arabic','Hindi','Indonesian','Malay','Vietnamese','Thai','Portuguese','Italian','Russian']);
      }
    };
    loadLangs();
  }, []);

  const onChange = (k: keyof ProfileData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setData((d) => ({ ...d, [k]: e.target.value }));
    setIsDirty(true);
  };

  const addSlot = () => {
    setAvailabilitySlots((arr) => {
      const next: AvailabilitySlot[] = [...arr, { day: 'Monday', start: '09:00', end: '17:00' }];
      const dayOrder: Record<string, number> = {
        Monday: 1,
        Tuesday: 2,
        Wednesday: 3,
        Thursday: 4,
        Friday: 5,
        Saturday: 6,
        Sunday: 7,
      };
      return next.sort((a, b) => {
        const da = dayOrder[a.day] || 99;
        const db = dayOrder[b.day] || 99;
        if (da !== db) return da - db;
        return a.start.localeCompare(b.start);
      });
    });
    setIsDirty(true);
  };
  const removeSlot = (idx: number) => {
    setAvailabilitySlots((arr) => arr.filter((_, i) => i !== idx));
    setIsDirty(true);
  };
  const updateSlot = (idx: number, key: keyof AvailabilitySlot, value: string) => {
    setAvailabilitySlots((arr) => {
      const next = arr.map((s, i) => (i === idx ? { ...s, [key]: value } : s));
      const dayOrder: Record<string, number> = {
        Monday: 1,
        Tuesday: 2,
        Wednesday: 3,
        Thursday: 4,
        Friday: 5,
        Saturday: 6,
        Sunday: 7,
      };
      return next.sort((a, b) => {
        const da = dayOrder[a.day] || 99;
        const db = dayOrder[b.day] || 99;
        if (da !== db) return da - db;
        return a.start.localeCompare(b.start);
      });
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const uid = userId || Number(new URLSearchParams(window.location.search).get('uid')) || Number(window.localStorage.getItem('current_user_id')) || 1;
      const payload = {
        name: data.name,
        email: data.email,
        department: data.organization,
        contact_number: data.phone || data.contact_number,
        availability: availabilitySlots.length ? JSON.stringify(availabilitySlots) : data.availability,
        year_experience: data.year_experience ?? (data.experience_years && /^\d+$/.test(data.experience_years) ? Number(data.experience_years) : undefined),
        phone: data.phone,
        license_number: data.license_number,
        specializations: data.specializations,
        education: data.education,
        bio: data.bio,
        languages: data.languages,
      };
      await api.put('/counselor-profile', payload, { params: { user_id: uid } });
      try {
        window.localStorage.setItem('profileUpdatedAt', String(Date.now()));
        window.dispatchEvent(new Event('profileUpdated'));
      } catch {}
      setIsDirty(false);
    } catch (e) {
      setError('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const [studentsRes, checkinsRes, openApptRes, highRiskRes] = await Promise.all([
          api.get<any>('/students-monitored'),
          api.get<any>('/this-week-checkins'),
          api.get<any>('/open-appointments'),
          api.get<any>('/high-risk-flags'),
        ]);
        setOverview({
          activeStudents: Number(studentsRes.data?.count || 0),
          thisWeekCheckins: Number(checkinsRes.data?.count || 0),
          openAppointments: Number(openApptRes.data?.count || 0),
          highRiskFlags: Number(highRiskRes.data?.count || 0),
        });
      } catch (err) {
        console.error('Error fetching overview metrics:', err);
      }
    };

    fetchOverview();
  }, []);

  // Show loading spinner while data is being fetched
  if (loading) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <LoadingSpinner size="lg" className="text-primary" />
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <main
      className={`transition-all duration-200 min-h-screen space-y-6 pt-6 pr-6 pb-6`}
      style={{ backgroundColor: "transparent" }}
    >
      <div className="pl-4 md:pl-6">
        <h1 className="text-2xl font-bold text-[#0d8c4f]">Profile</h1>
        <p className="text-sm text-[#6b7280]">Manage your professional profile and settings</p>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
          <div>
            <div
              className={`${styles.profileCard} bg-white rounded-2xl shadow-sm px-6 py-6 flex flex-col gap-6`}
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#e5e7eb]">
                  <UserIcon className="h-10 w-10 text-[#6b7280]" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-[#111827]">
                    {data.name || 'Unnamed Counselor'}
                  </div>
                  <div className="text-sm text-[#6b7280]">
                    {data.education || 'Add your education details'}
                  </div>
                </div>
                {data.organization && (
                  <div className="mt-1 inline-flex items-center rounded-full bg-[#f3f4f6] px-3 py-1 text-xs font-medium text-[#374151]">
                    {data.organization}
                  </div>
                )}
              </div>

              <div className="h-px bg-[#e5e7eb]" />

              <div className="space-y-6">
                <InfoSection title="Contact">
                  <InfoRow icon={<Mail className="h-4 w-4 text-[#374151]" />} label="Email" value={data.email || '—'} />
                  <InfoRow icon={<Phone className="h-4 w-4 text-[#374151]" />} label="Primary Phone" value={data.phone || '—'} />
                  <InfoRow icon={<PhoneCall className="h-4 w-4 text-[#374151]" />} label="Alternate Contact" value={data.contact_number || undefined} />
                </InfoSection>

                <InfoSection title="Personal Info">
                  <InfoRow icon={<Sparkles className="h-4 w-4 text-[#374151]" />} label="Specialization" value={data.specializations || '—'} />
                  <InfoRow icon={<FileText className="h-4 w-4 text-[#374151]" />} label="Bio" value={data.bio || '—'} />
                </InfoSection>

                <InfoSection title="Work Details">
                  <InfoRow icon={<IdCard className="h-4 w-4 text-[#374151]" />} label="License Number" value={data.license_number || '—'} />
                  <InfoRow
                    icon={<Briefcase className="h-4 w-4 text-[#374151]" />}
                    label="Years of Experience"
                    value={data.experience_years ? `${data.experience_years} years` : '—'}
                  />
                  <InfoRow
                    icon={<Clock className="h-4 w-4 text-[#374151]" />}
                    label="Availability"
                    value={
                      availabilitySlots.length
                        ? availabilitySlots
                            .map((s) => {
                              const shortDay = s.day.slice(0, 3);
                              return `${shortDay} ${s.start}-${s.end}`;
                            })
                            .join(', ')
                        : (data.availability || '—')
                    }
                  />
                </InfoSection>

                <InfoSection title="Additional">
                  <InfoRow icon={<Globe className="h-4 w-4 text-[#374151]" />} label="Languages" value={data.languages || '—'} />
                </InfoSection>
              </div>

              {data.created_at && (
                <div className="mt-2 border-t border-[#e5e7eb] pt-3 text-xs text-[#9ca3af] flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span>Profile created {data.created_at}</span>
                </div>
              )}
            </div>

            <div className={`${styles.profileOverview} mt-4`}>
              <div className={styles.overviewTitle}>Professional Overview</div>
              <div className={styles.overviewItem}>
                <span>Active Students Monitored</span>
                <span className={styles.overviewBadge}>{overview.activeStudents}</span>
              </div>
              <div className={styles.overviewItem}>
                <span>Check-ins (This Period)</span>
                <span className={styles.overviewBadge}>{overview.thisWeekCheckins}</span>
              </div>
              <div className={styles.overviewItem}>
                <span>Open Appointments</span>
                <span className={styles.overviewBadge}>{overview.openAppointments}</span>
              </div>
              <div className={styles.overviewItem}>
                <span>High-Risk Flags</span>
                <span className={styles.overviewBadge}>{overview.highRiskFlags}</span>
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            <div className={styles.tabs}>
              <button className={`${styles.tab} ${activeTab==='professional' ? styles.tabActive : ''}`} onClick={()=>setActiveTab('professional')}>Professional</button>
              <button className={`${styles.tab} ${activeTab==='contact' ? styles.tabActive : ''}`} onClick={()=>setActiveTab('contact')}>Contact</button>
              <button className={`${styles.tab} ${activeTab==='settings' ? styles.tabActive : ''}`} onClick={()=>setActiveTab('settings')}>Settings</button>
              <button className={`${styles.tab} ${activeTab==='security' ? styles.tabActive : ''}`} onClick={()=>setActiveTab('security')}>Security</button>
            </div>
            <div className={styles.sectionCard}>
              {activeTab==='professional' && (
                <>
                  <div className={styles.sectionTitle}>Professional Information</div>
                  <div className="text-[#6b7280] mb-4">Update your professional credentials and specializations</div>
                  <div className={styles.inputRow}>
                    <input className={styles.input} value={data.license_number} onChange={onChange('license_number')} placeholder="License Number" />
                  </div>
                  <div className={styles.inputRow}>
                    <select
                      className={styles.input}
                      value={data.specializations}
                      onChange={(e) => { setData((d) => ({ ...d, specializations: e.target.value })); setIsDirty(true); }}
                    >
                      <option value="">Select Specialization</option>
                      <option value="Academic Counseling">Academic Counseling</option>
                      <option value="Career Counseling">Career Counseling</option>
                      <option value="Mental Health">Mental Health</option>
                      <option value="Crisis Intervention">Crisis Intervention</option>
                      <option value="Substance Abuse">Substance Abuse</option>
                      <option value="Family & Relationships">Family & Relationships</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <div className="text-xs text-[#6b7280] mb-1">Availability</div>
                    <div className="flex flex-col gap-2">
                      {availabilitySlots.map((s, i) => (
                        <div key={i} className={styles.inputRow}>
                          <select className={styles.input} value={s.day} onChange={(e)=>updateSlot(i,'day',e.target.value)}>
                            {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((d)=> (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                          <input className={styles.input} type="time" value={s.start} onChange={(e)=>updateSlot(i,'start',e.target.value)} />
                          <input className={styles.input} type="time" value={s.end} onChange={(e)=>updateSlot(i,'end',e.target.value)} />
                          <button className="px-3 py-2 rounded-xl border" onClick={()=>removeSlot(i)}>Remove</button>
                        </div>
                      ))}
                      <div>
                        <button className="px-3 py-2 rounded-xl bg-[#0d8c4f] text-white" onClick={addSlot}>Add time slot</button>
                      </div>
                    </div>
                  </div>
                  <textarea className={styles.textarea} value={data.education} onChange={onChange('education')} placeholder="Education" />
                  <textarea className={styles.textarea} value={data.bio} onChange={onChange('bio')} placeholder="Professional Bio" />
                  <div className={styles.inputRow}>
                    <select
                      className={styles.input}
                      value={data.experience_years}
                      onChange={(e) => { setData((d) => ({ ...d, experience_years: e.target.value })); setIsDirty(true); }}
                    >
                      <option value="">Years of Experience</option>
                      {Array.from({ length: 41 }).map((_, i) => (
                        <option key={i} value={String(i)}>{i}</option>
                      ))}
                    </select>
                    <select
                      className={styles.input}
                      value={data.languages}
                      onChange={(e) => { setData((d) => ({ ...d, languages: e.target.value })); setIsDirty(true); }}
                    >
                      <option value="">Select Language</option>
                      <optgroup label="Philippine Languages">
                        {PH_LANGS.map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </optgroup>
                      {otherLanguages.length > 0 && (
                        <optgroup label="Other Languages">
                          {otherLanguages.map((l) => (
                            <option key={l} value={l}>{l}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                </>
              )}
              {activeTab==='contact' && (
                <>
                  <div className={styles.sectionTitle}>Contact Information</div>
                  <div className="text-[#6b7280] mb-4">Update your contact details</div>
                  <div className={styles.inputRow}>
                    <input className={styles.input} value={data.name} onChange={onChange('name')} placeholder="Full Name" />
                    <input className={styles.input} value={data.email} onChange={onChange('email')} placeholder="Email" />
                  </div>
                  <div className={styles.inputRow}>
                    <input className={styles.input} value={data.phone} onChange={onChange('phone')} placeholder="Phone" />
                    <input className={styles.input} value={data.contact_number || ''} onChange={onChange('contact_number' as any)} placeholder="Contact Number" />
                  </div>
                  <div className={styles.inputRow}>
                    <input className={styles.input} value={data.organization} onChange={onChange('organization')} placeholder="Organization / Department" />
                  </div>
                </>
              )}
              {activeTab==='settings' && (
                <>
                  <div className={styles.sectionTitle}>Settings</div>
                  <div className="text-[#6b7280] mb-4">General preferences (coming soon)</div>
                </>
              )}
              {activeTab==='security' && (
                <>
                  <div className={styles.sectionTitle}>Security</div>
                  <div className="text-[#6b7280] mb-4">Password and 2FA management (coming soon)</div>
                </>
              )}
              <div className="flex items-center gap-3 mt-3">
                <button
                  className={`px-4 py-2 rounded-xl font-semibold disabled:opacity-60 ${isDirty ? 'bg-[#0d8c4f] text-white' : 'bg-[#e5e7eb] text-[#374151]'}`}
                  onClick={save}
                  disabled={saving || loading || !isDirty}
                  title={"Save counselor profile"}
                >
                  {saving ? 'Saving...' : (isDirty ? 'Save Changes' : 'Saved')}
                </button>
                {loading && <span className="text-xs text-[#6b7280]">Loading...</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

Profile.layout = (page: React.ReactNode) => <DashboardLayout>{page}</DashboardLayout>;
export default Profile;