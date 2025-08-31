import DashboardLayout from '../layouts/DashboardLayout';

export default function Appointments() {
  return (
    <div>
      <h1>Appointments</h1>
      <p>Shows appointment downloads and probability graph.</p>
    </div>
  );
}

Appointments.layout = (page: React.ReactNode) => <DashboardLayout>{page}</DashboardLayout>;