import { useSidebar } from "./SidebarContext";
import { Home, MessageCircle, CalendarDays, FileText, User, LogOut, ChevronLeft, ChevronRight } from "lucide-react";
import styles from './Sidebar.module.css';

const navLinks = [
  { href: "/", label: "Dashboard", icon: <Home className={styles.icon} /> },
  { href: "/chat", label: "Chat", icon: <MessageCircle className={styles.icon} /> },
  { href: "/appointments", label: "Appointments", icon: <CalendarDays className={styles.icon} /> },
  { href: "/reports", label: "Reports", icon: <FileText className={styles.icon} /> },
  { href: "/profile", label: "Profile", icon: <User className={styles.icon} /> },
];

export default function Sidebar() {
  const { open, setOpen } = useSidebar();
  const currentPath = window.location.pathname;

  return (
    <aside className={`${styles.sidebar} ${open ? styles.open : styles.closed}`}>
      <div
        className={styles.logoRow}
        onClick={() => setOpen(!open)}
        style={{ cursor: "pointer" }}
        title={open ? "Collapse sidebar" : "Expand sidebar"}
      >
        <div className={styles.logo}>
          <img src="/logo.png" alt="Logo" className={styles.logoIcon} />
          {open && <span className={styles.logoText}>Sentisphere</span>}
        </div>
        <span className={styles.chevron}>
          {open ? <ChevronLeft /> : <ChevronRight />}
        </span>
      </div>
      <div className={styles.divider} />
      <nav className={styles.nav}>
        {navLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className={`${styles.navLink} ${currentPath === link.href ? styles.active : ""}`}
            tabIndex={open ? 0 : -1}
            title={link.label}
          >
            {link.icon}
            {open && <span>{link.label}</span>}
          </a>
        ))}
      </nav>
      <div className={styles.spacer} />
      <button className={styles.signoutBtn} tabIndex={open ? 0 : -1}>
        <LogOut className={styles.icon} />
        {open && <span>Sign Out</span>}
      </button>
    </aside>
  );
}