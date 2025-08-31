import styles from './Sidebar.module.css';
import { Home, MessageCircle, CalendarDays, FileText, User } from "lucide-react";

export default function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <div className={styles.logoIcon}>S</div>
        <span className={styles.logoText}>Sentisphere</span>
      </div>
      <nav className={styles.nav}>
        <a href="/"><Home className={styles.icon}/> Dashboard</a>
        <a href="/chat"><MessageCircle className={styles.icon}/> Chat</a>
        <a href="/appointments"><CalendarDays className={styles.icon}/> Appointments</a>
        <a href="/reports"><FileText className={styles.icon}/> Reports</a>
        <a href="/profile"><User className={styles.icon}/> Profile</a>
      </nav>
    </aside>
  );
}