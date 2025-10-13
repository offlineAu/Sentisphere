import { useSidebar } from "./SidebarContext";
import {
  Home,
  MessageCircle,
  CalendarDays,
  FileText,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./Sidebar.module.css";

const mainNavLinks = [
  { href: "/", label: "Dashboard", icon: <Home /> },
  { href: "/chat", label: "Chat", icon: <MessageCircle /> },
  { href: "/appointments", label: "Appointments", icon: <CalendarDays /> },
  { href: "/reports", label: "Reports", icon: <FileText /> },
  { href: "/profile", label: "Profile", icon: <User /> },
];

export default function Sidebar() {
  const { open, setOpen } = useSidebar();
  const currentPath = window.location.pathname;

  return (
    <motion.aside
      className={styles.sidebar}
      animate={{ width: open ? "17rem" : "5rem" }}
      transition={{ duration: 0.35, ease: "easeInOut" }}
    >
      {/* Logo Row */}
      <div className={styles.logoRow}>
        <div className={styles.logoWrap}>
          <div className={styles.logoCircle}>
            <img
              src="/logo.png"
              alt="Sentisphere Logo"
              className={styles.logoImage}
            />
          </div>
          <AnimatePresence>
            {open && (
              <motion.span
                className={styles.logoText}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.25 }}
              >
                Sentisphere
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <button
          className={styles.chevron}
          onClick={() => setOpen(!open)}
          title={open ? "Collapse sidebar" : "Expand sidebar"}
        >
          {open ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      <div className={styles.divider} />

      {/* Menu Section */}
      <div className={styles.menuTitle}>MENU</div>
      <nav className={styles.nav}>
        {mainNavLinks.map((link) => {
          const isActive = currentPath === link.href;

          return (
            <motion.a
              key={link.href}
              href={link.href}
              className={`${styles.navLink} ${isActive ? styles.active : ""}`}
              whileHover={{ scale: 1.03 }}
              transition={{ duration: 0.15 }}
              tabIndex={open ? 0 : -1}
            >
              <div
                className={`${styles.iconWrap} ${
                  isActive ? styles.iconActive : ""
                }`}
              >
                {link.icon}
              </div>
              <AnimatePresence>
                {open && (
                  <motion.span
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    {link.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.a>
          );
        })}
      </nav>

      <div className={styles.spacer} />

      {/* General Section */}
      <div className={styles.menuTitle}>GENERAL</div>
      <button className={styles.signoutBtn} tabIndex={open ? 0 : -1}>
        <LogOut />
        <AnimatePresence>
          {open && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.25 }}
            >
              Logout
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </motion.aside>
  );
}
