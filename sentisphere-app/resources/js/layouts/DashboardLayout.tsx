import Sidebar from '../components/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex bg-[#f5f5f5] min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-64">
        {children}
      </main>
    </div>
  );
}