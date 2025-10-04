import DashboardLayout from '../layouts/DashboardLayout';
import { useSidebar } from '../components/SidebarContext';
import styles from './Profile.module.css';

function Profile() {
  const { open } = useSidebar();

  return (
    <main
      className={`transition-all duration-200 bg-[#f9fafb] min-h-screen space-y-6 ${open ? 'pl-[17rem]' : 'pl-[4.5rem]'} pt-6 pr-6 pb-6`}
    >
      <h1 className={styles.headerTitle}>Profile</h1>
      <p className={styles.headerSubtitle}>
        Manage your professional profile and settings
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: Profile Card & Overview */}
        <div>
          <div className={styles.profileCard}>
            {/* Profile image placeholder */}
            <div className="w-28 h-28 rounded-full bg-[#e5e5e5] flex items-center justify-center text-4xl">
              {/* Add image here */}
              <span role="img" aria-label="profile">👤</span>
            </div>
            <div className={styles.profileName}>Dr. Sarah Johnson</div>
            <div className={styles.profileRole}>Licensed Clinical Psychologist</div>
            <div className={styles.profileOrg}>University Counseling Center</div>
            <div className={styles.profileInfo}>
              <span>📧</span> dr.johnson@university.edu
            </div>
            <div className={styles.profileInfo}>
              <span>📞</span> (555) 123-4567
            </div>
            <div className={styles.profileInfo}>
              <span>🏢</span> Student Services Building, Room 204
            </div>
            <div className={styles.profileInfo}>
              <span>📅</span> 5 years at University
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
        {/* Right: Tabs & Details */}
        <div className="md:col-span-2">
          {/* Tabs */}
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${styles.tabActive}`}>Professional</button>
            <button className={styles.tab}>Contact</button>
            <button className={styles.tab}>Settings</button>
            <button className={styles.tab}>Security</button>
          </div>
          {/* Professional Information */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionTitle}>Professional Information</div>
            <div className="text-[#6b7280] mb-4">
              Update your professional credentials and specializations
            </div>
            <div className={styles.inputRow}>
              <input className={styles.input} defaultValue="Licensed Clinical Psychologist" placeholder="Professional Title" />
              <input className={styles.input} defaultValue="PSY-12345-CA" placeholder="License Number" />
            </div>
            <input className={styles.input} defaultValue="Anxiety, Depression, Academic Stress, Trauma-Informed Care" placeholder="Specializations" />
            <textarea className={styles.textarea} defaultValue="Ph.D. in Clinical Psychology, Stanford University (2018)
M.A. in Psychology, UC Berkeley (2014)
B.A. in Psychology, UCLA (2012)" placeholder="Education" />
            <textarea className={styles.textarea} defaultValue="Dr. Johnson specializes in helping college students navigate academic stress, anxiety, and life transitions. With over 8 years of experience in university counseling, she uses evidence-based approaches including CBT and mindfulness-based interventions." placeholder="Professional Bio" />
            <div className={styles.inputRow}>
              <input className={styles.input} defaultValue="8 years" placeholder="Years of Experience" />
              <input className={styles.input} defaultValue="English, Spanish" placeholder="Languages" />
            </div>
            <button className={styles.saveBtn}>Save Changes</button>
          </div>
        </div>
      </div>
    </main>
  );
}

Profile.layout = (page: React.ReactNode) => <DashboardLayout>{page}</DashboardLayout>;
export default Profile;