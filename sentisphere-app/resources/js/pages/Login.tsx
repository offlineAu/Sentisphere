import React, { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import { loginFastApi, signupFastApi } from '../lib/auth';

export default function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    const res = await loginFastApi(email, password);
    setLoading(false);
    if (res.ok) {
      router.visit('/');
    } else {
      setError(res.error || 'Login failed');
    }
  };

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    if (password !== confirmPassword) {
      setLoading(false);
      setError('Passwords do not match');
      return;
    }
    const res = await signupFastApi(email, password, confirmPassword, name || undefined);
    if (!res.ok) {
      setLoading(false);
      setError(res.error || 'Signup failed');
      return;
    }
    // Auto-sign in after signup
    const loginRes = await loginFastApi(email, password);
    setLoading(false);
    if (loginRes.ok) {
      router.visit('/');
    } else {
      setSuccess('Account created. Please sign in.');
      setMode('signin');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f3f5f7] p-4">
      <Head title="Login" />
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl overflow-hidden grid grid-cols-1 md:grid-cols-2">
        {/* Left panel (Welcome Back) */}
        <div className="hidden md:flex flex-col justify-center gap-6 p-10 bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 text-white">
          <div>
            <div className="text-2xl font-bold">Welcome Back!</div>
            <div className="opacity-90 mt-2 text-sm">To keep connected with us please login with your personal info</div>
          </div>
          <button
            className="border border-white/80 px-5 py-2 rounded-full self-start hover:bg-white/10"
            onClick={() => setMode('signin')}
          >
            SIGN IN
          </button>
        </div>

        {/* Right panel (Auth forms) */}
        <div className="p-8 md:p-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-emerald-700">
              {mode === 'signup' ? 'Create Account' : 'Sign In'}
            </h2>
            <div className="flex gap-2">
              <button
                className={`text-xs px-3 py-1.5 rounded-full ${mode==='signin' ? 'bg-emerald-600 text-white' : 'border border-gray-300 text-gray-700'}`}
                onClick={() => setMode('signin')}
              >Sign In</button>
              <button
                className={`text-xs px-3 py-1.5 rounded-full ${mode==='signup' ? 'bg-emerald-600 text-white' : 'border border-gray-300 text-gray-700'}`}
                onClick={() => setMode('signup')}
              >Sign Up</button>
            </div>
          </div>

          {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
          {success && <div className="mb-3 text-sm text-emerald-600">{success}</div>}

          <div className="relative overflow-hidden">
            <div
              className="flex w-[200%] transition-transform duration-500"
              style={{ transform: mode === 'signup' ? 'translateX(-50%)' : 'translateX(0%)' }}
            >
              <div className="w-1/2 pr-4">
                <form onSubmit={onSignin} className="space-y-3">
                  <label className="block text-sm text-gray-700">Email</label>
                  <input
                    className="w-full border rounded-xl px-3 py-2"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    type="email"
                    required
                  />
                  <label className="block text-sm text-gray-700">Password</label>
                  <input
                    className="w-full border rounded-xl px-3 py-2"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl px-4 py-2 disabled:opacity-50 mt-2"
                    disabled={loading}
                  >
                    {loading ? 'Signing in...' : 'Sign In'}
                  </button>
                </form>
              </div>
              <div className="w-1/2 pl-4">
                <form onSubmit={onSignup} className="space-y-3">
                  <label className="block text-sm text-gray-700">Email</label>
                  <input
                    className="w-full border rounded-xl px-3 py-2"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    type="email"
                    required
                  />
                  <label className="block text-sm text-gray-700">Password</label>
                  <input
                    className="w-full border rounded-xl px-3 py-2"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <label className="block text-sm text-gray-700">Confirm Password</label>
                  <input
                    className="w-full border rounded-xl px-3 py-2"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl px-4 py-2 disabled:opacity-50 mt-2"
                    disabled={loading}
                  >
                    {loading ? 'Creating account...' : 'Sign Up'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
