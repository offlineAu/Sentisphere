import React from "react";

export default function main() {
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-md p-4">
        <h2 className="text-xl font-bold mb-6">Sentisphere</h2>
        <nav className="space-y-2">
          <a href="#" className="block px-4 py-2 rounded hover:bg-gray-200">Dashboard</a>
          <a href="#" className="block px-4 py-2 rounded hover:bg-gray-200">Students</a>
          <a href="#" className="block px-4 py-2 rounded hover:bg-gray-200">Reports</a>
          <a href="#" className="block px-4 py-2 rounded hover:bg-gray-200">Settings</a>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6">
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold">Counselor Dashboard</h1>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Log out
          </button>
        </header>

        {/* Example Widgets */}
        <section className="grid grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">📊 Analytics Widget</div>
          <div className="bg-white p-6 rounded-lg shadow">👥 Students Widget</div>
          <div className="bg-white p-6 rounded-lg shadow">📝 Reports Widget</div>
        </section>
      </main>
    </div>
  );
}
