import { useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import { useSidebar } from '../components/SidebarContext';
import { useSessionManager } from '@/hooks';
import { SessionWarningModal } from '@/components/SessionWarningModal';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { open } = useSidebar();
  
  // Session management - auto logout on JWT expiry or 60min inactivity
  const {
    showWarning,
    formatRemainingTime,
    resetActivity,
    logout,
  } = useSessionManager({
    enabled: true,
    onSessionExpired: () => {
      console.log('[DashboardLayout] Session expired');
    },
  });

  const handleStayLoggedIn = useCallback(() => {
    resetActivity();
  }, [resetActivity]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className={`transition-all duration-200 w-full ${open ? 'pl-[17rem]' : 'pl-[5rem]'} pt-0 pr-0 pb-6`}>
        {children}
      </main>
      
      {/* Session expiry warning modal */}
      <SessionWarningModal
        show={showWarning}
        remainingTime={formatRemainingTime()}
        onStayLoggedIn={handleStayLoggedIn}
        onLogout={logout}
      />
    </div>
  );
}