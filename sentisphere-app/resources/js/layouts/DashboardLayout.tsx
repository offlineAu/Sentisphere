import Sidebar from '../components/Sidebar';
import { useSidebar } from '../components/SidebarContext';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { open } = useSidebar();
  return (
    <div className="flex bg-[#f5f5f5] min-h-screen">
      <Sidebar />
      <main
        className={`transition-all duration-200 w-full ${open ? 'pl-[17rem]' : 'pl-[5rem]'} pt-2 pr-6 pb-6`}
      >
        {children}
      </main>
    </div>
  );
}