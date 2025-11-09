import DashboardLayout from '../layouts/DashboardLayout';
import styles from './Profile.module.css';
import { useEffect, useState } from 'react';
import api from '../lib/api';
import { LoadingSpinner } from '../components/loading-spinner';

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


  useEffect(() => {
    let mounted = true;
    
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

  const onChange = (k: keyof ProfileData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setData((d) => ({ ...d, [k]: e.target.value }));
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
        availability: data.availability,
        year_experience: data.year_experience ?? (data.experience_years && /^\d+$/.test(data.experience_years) ? Number(data.experience_years) : undefined),
        phone: data.phone,
        license_number: data.license_number,
        specializations: data.specializations,
        education: data.education,
        bio: data.bio,
        experience_years: data.experience_years,
        languages: data.languages,
      };
      await api.put('/counselor-profile', payload, { params: { user_id: uid } });
    } catch (e) {
      setError('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

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
      className={`transition-all duration-200 bg-[#f9fafb] min-h-screen space-y-6 pt-6 pr-6 pb-6`}
    >
      <div className="pl-4 md:pl-6">
        <h1 className="text-2xl font-bold text-[#0d8c4f]">Profile</h1>
        <p className="text-sm text-[#6b7280]">Manage your professional profile and settings</p>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className={styles.profileCard}>
              <div className="w-28 h-28 rounded-full bg-[#e5e5e5] flex items-center justify-center text-4xl">
                <span role="img" aria-label="profile">👤</span>
              </div>
              <div className={styles.profileName}>{data.name || '—'}</div>
              <div className={styles.profileRole}>{data.education || '—'}</div>
              <div className={styles.profileOrg}>{data.organization || '—'}</div>
              <div className={styles.profileInfo}>
                <span>📧</span> {data.email || '—'}
              </div>
              <div className={styles.profileInfo}>
                <span>📞</span> {data.phone || '—'}
              </div>
              <div className={styles.profileInfo}>
                <span>🏢</span> {data.license_number || '—'}
              </div>
              <div className={styles.profileInfo}>
                <span>📅</span> {data.experience_years ? `${data.experience_years} years` : '—'}
              </div>
              <div className={styles.profileInfo}>
                <span>🕒</span> {data.availability || '—'}
              </div>
              <div className={styles.profileInfo}>
                <span>☎️</span> {data.contact_number || '—'}
              </div>
              <div className={styles.profileInfo}>
                <span>🌐</span> {data.languages || '—'}
              </div>
              <div className={styles.profileInfo}>
                <span>🧾</span> {data.created_at || '—'}
              </div>
            </div>
            <div className={styles.profileOverview}>
              <div className={styles.overviewTitle}>Professional Overview</div>
              <div className={styles.overviewItem}>
                <span>Active Students</span>
                <span className={styles.overviewBadge}>127</span>
              </div>
              <div className={styles.overviewItem}>
                <span>Sessions This Month</span>
                <span className={styles.overviewBadge}>89</span>
              </div>
              <div className={styles.overviewItem}>
                <span>Articles Published</span>
                <span className={styles.overviewBadge}>23</span>
              </div>
              <div className={styles.overviewItem}>
                <span>Certifications</span>
                <span className={styles.overviewBadge}>8</span>
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
                    <input className={styles.input} value={data.availability || ''} onChange={onChange('availability' as any)} placeholder="Availability" />
                  </div>
                  <input className={styles.input} value={data.specializations} onChange={onChange('specializations')} placeholder="Specializations" />
                  <textarea className={styles.textarea} value={data.education} onChange={onChange('education')} placeholder="Education" />
                  <textarea className={styles.textarea} value={data.bio} onChange={onChange('bio')} placeholder="Professional Bio" />
                  <div className={styles.inputRow}>
                    <input className={styles.input} value={data.experience_years} onChange={onChange('experience_years')} placeholder="Years of Experience" />
                    <input className={styles.input} value={data.languages} onChange={onChange('languages')} placeholder="Languages" />
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
                  className="px-4 py-2 rounded-xl bg-[#0d8c4f] text-white font-semibold disabled:opacity-60"
                  onClick={save}
                  disabled={saving || loading}
                  title={"Save counselor profile"}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
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