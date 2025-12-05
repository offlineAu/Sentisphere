import React, { useEffect, useState, useRef } from 'react';
import { useSidebar } from "./SidebarContext";
import { router, usePage } from '@inertiajs/react';
import { logoutFastApi, sessionStatus } from '../lib/auth';
import { Home as HomeOutline, MessageDots as MessageDotsOutline, FileLines as FileLinesOutline, User as UserOutline, ChevronLeft, OpenDoor as OpenDoorOutline } from "flowbite-react-icons/outline";
import { Home as HomeSolid, MessageDots as MessageDotsSolid, FileLines as FileLinesSolid, User as UserSolid } from "flowbite-react-icons/solid";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./Sidebar.module.css";
import api from '../lib/api';
import Pusher from 'pusher-js';

const mainNavLinks: Array<{
  href: string;
  label: string;
  iconOutline: React.ComponentType<any>;
  iconSolid: React.ComponentType<any>;
}> = [
  { href: "/", label: "Overview", iconOutline: HomeOutline, iconSolid: HomeSolid },
  { href: "/chat", label: "Chat", iconOutline: MessageDotsOutline, iconSolid: MessageDotsSolid },
  { href: "/reports", label: "Reports", iconOutline: FileLinesOutline, iconSolid: FileLinesSolid },
  { href: "/profile", label: "Profile", iconOutline: UserOutline, iconSolid: UserSolid },
];

export default function Sidebar() {
  const { open, setOpen } = useSidebar();
  const currentPath = window.location.pathname;
  const [isAuthed, setIsAuthed] = useState<boolean>(false);
  const [checked, setChecked] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const pusherRef = useRef<Pusher | null>(null);
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
  
  // Fetch unread count for chat badge
  useEffect(() => {
    if (!isAuthed) return;
    
    const fetchUnreadCount = async () => {
      try {
        const res = await api.get<{ total_unread: number }>('/counselor/conversations/unread-count');
        setUnreadCount(res.data.total_unread || 0);
      } catch {
        // Ignore errors
      }
    };
    
    // Initial fetch
    fetchUnreadCount();
    
    // Poll every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    
    // Also set up Pusher for real-time updates
    const pusherKey = (import.meta as any).env?.VITE_PUSHER_APP_KEY;
    const pusherCluster = (import.meta as any).env?.VITE_PUSHER_APP_CLUSTER || 'ap1';
    
    if (pusherKey) {
      try {
        const pusher = new Pusher(pusherKey, { cluster: pusherCluster });
        pusherRef.current = pusher;
        
        const channel = pusher.subscribe('conversations');
        channel.bind('new_message', () => {
          // Refetch unread count when new message arrives
          fetchUnreadCount();
        });
        channel.bind('status_changed', () => {
          fetchUnreadCount();
        });
      } catch {
        // Ignore Pusher errors
      }
    }
    
    return () => {
      clearInterval(interval);
      if (pusherRef.current) {
        pusherRef.current.disconnect();
        pusherRef.current = null;
      }
    };
  }, [isAuthed]);

  // Only render after we checked the session; and only if authenticated
  if (!checked || !isAuthed) return null;

  return (
    <motion.aside
      aria-label="Primary sidebar"
      className={`${styles.sidebar} ${open ? styles.open : styles.closed}`}
      animate={{ width: open ? "16rem" : "4.5rem" }}
      transition={{ duration: 0.35, ease: "easeInOut" }}
    >
      {/* Logo Row */}
      <div className={styles.logoRow}>
        <div
          className={styles.logoWrap}
          role="button"
          tabIndex={0}
          aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
          onClick={() => setOpen(!open)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen(!open);
            }
          }}
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
      </div>

      <div className={styles.divider} />

      {/* Menu Section */}
      <div className={styles.menuTitle}>MENU</div>
      <nav className={styles.nav} aria-label="Main navigation">
        {mainNavLinks.map((link) => {
          const isActive = currentPath === link.href;
          const showBadge = link.href === '/chat' && unreadCount > 0;

          return (
            <motion.a
              key={link.href}
              href={link.href}
              className={`${styles.navLink} ${isActive ? styles.active : ""} relative`}
              whileHover={{ scale: 1.03 }}
              transition={{ duration: 0.15 }}
              tabIndex={open ? 0 : -1}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className={`${styles.iconWrap} ${isActive ? styles.iconActive : ""} relative`}>
                {(() => {
                  const Icon = isActive ? link.iconSolid : link.iconOutline;
                  return (
                    <Icon
                      className={isActive ? "text-[var(--sidebar-primary)]" : "text-slate-400"}
                    />
                  );
                })()}
                {/* Unread badge for collapsed sidebar */}
                {showBadge && !open && (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <AnimatePresence>
                {open && (
                  <motion.span
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-2"
                  >
                    {link.label}
                    {/* Unread badge for expanded sidebar */}
                    {showBadge && (
                      <span className="flex items-center justify-center min-w-[20px] h-[20px] px-1.5 text-[11px] font-bold text-white bg-red-500 rounded-full">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
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
          <OpenDoorOutline />
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
