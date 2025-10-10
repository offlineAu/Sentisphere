import { useSidebar } from '../components/SidebarContext';
import DashboardLayout from '../layouts/DashboardLayout';

export default function Appointments() {
  const { open } = useSidebar();

  return (
    <main
      className={`transition-all duration-200 bg-[#f9fafb] min-h-screen space-y-6 ${
        open ? 'pl-[17rem]' : 'pl-[4.5rem]'
      } pt-6 pr-6 pb-6`}
    >
      <h1>Appointments</h1>
      <p>Shows appointment downloads and probability graph.</p>
    </main>
  );
}

Appointments.layout = (page: React.ReactNode) => <DashboardLayout>{page}</DashboardLayout>;