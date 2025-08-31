import DashboardLayout from '../layouts/DashboardLayout';

Chat.layout = (page: React.ReactNode) => <DashboardLayout>{page}</DashboardLayout>;

function Chat() {
  return (
    <div>
      <h1>Chat</h1>
      <p>Chat between counselor and student.</p>
    </div>
  );
}
export default Chat;