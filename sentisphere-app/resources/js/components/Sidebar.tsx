import React, { useEffect, useState } from 'react';
import { useSidebar } from "./SidebarContext";
import { router, usePage } from '@inertiajs/react';
import { logoutFastApi, sessionStatus } from '../lib/auth';
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
  const [isAuthed, setIsAuthed] = useState<boolean>(false);
  const [checked, setChecked] = useState<boolean>(false);
  const page: any = usePage();
  const hideSidebar = Boolean(page?.props?.hideSidebar);

  // Hide sidebar on login page entirely
  if (currentPath === '/login' || hideSidebar) return null;

  useEffect(() => {
    let mounted = true;
    sessionStatus().then(s => {
      if (!mounted) return;
      setIsAuthed(!!s.authenticated);
      setChecked(true);
    }).catch(() => {
      if (!mounted) return;
      setIsAuthed(false);
      setChecked(true);
    });
    return () => { mounted = false; };
  }, []);

  // Only render after we checked the session; and only if authenticated
  if (!checked || !isAuthed) return null;

  return (
    <motion.aside
      className={`${styles.sidebar} ${open ? styles.open : styles.closed}`}
      animate={{ width: open ? "17rem" : "5rem" }}
      transition={{ duration: 0.35, ease: "easeInOut" }}
    >
      {/* Logo Row */}
      <div className={styles.logoRow}>
        <div
          className={styles.logoWrap}
          role={open ? undefined : "button"}
          tabIndex={open ? -1 : 0}
          aria-label={open ? undefined : "Open sidebar"}
          onClick={() => { if (!open) setOpen(true); }}
          onKeyDown={(e) => { if (!open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); } }}
        >
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
        {open && (
          <button
            className={styles.chevron}
            onClick={() => setOpen(false)}
            title="Collapse sidebar"
          >
            <ChevronLeft size={18} />
          </button>
        )}
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
      {isAuthed && (
        <div className="px-4 py-1 text-[11px] text-gray-500" aria-live="polite">Signed in</div>
      )}
      <button
        className={styles.signoutBtn}
        tabIndex={open ? 0 : -1}
        onClick={async () => {
          const res = await logoutFastApi();
          if (res?.ok) {
            router.visit('/login');
          } else {
            router.visit('/login');
          }
        }}
      >
        <div className={styles.iconWrap}>
          <LogOut />
        </div>
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
