import React, { useState, useEffect } from 'react';
import { Head, router } from '@inertiajs/react';
import { Eye, EyeOff } from 'lucide-react';
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
  const [showPwd, setShowPwd] = useState(false);
  const [showPwd2, setShowPwd2] = useState(false);
  const [remember, setRemember] = useState(false);

  // Load remembered email on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem('remembered_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRemember(true);
    }
  }, []);

  const onSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    const res = await loginFastApi(email, password);
    setLoading(false);
    if (res.ok) {
      // Save or clear remembered email
      if (remember) {
        localStorage.setItem('remembered_email', email);
      } else {
        localStorage.removeItem('remembered_email');
      }
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
    <div className="min-h-screen relative flex items-center justify-center bg-transparent p-4">
      <Head title="Login" />
      <div className="w-full max-w-5xl bg-white dark:bg-gray-900 rounded-2xl shadow-xl overflow-hidden grid grid-cols-1 md:grid-cols-2">
        {/* Left panel (Welcome Back) */}
        <div className="hidden md:flex relative flex-col items-center justify-center gap-5 p-10 bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 text-white">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Sentisphere logo" className="h-20 w-20 rounded-full bg-white" />
          </div>
          <div className="relative text-center">
            <div className="pointer-events-none absolute -inset-10 rounded-full" style={{
              background: "radial-gradient(closest-side, rgba(255,255,255,0.35), transparent 70%)"
            }} />
            <div className="text-3xl font-bold relative">Welcome to Sentisphere</div>
            <div className="opacity-90 mt-2 text-sm">Support student wellness with timely insights and thoughtful interventions.</div>
          </div>
        </div>

        {/* Right panel (Auth forms) */}
        <div className="p-8 md:p-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-primary dark:text-emerald-400">
              {mode === 'signup' ? 'Create Account' : 'Sign In'}
            </h2>
            <div className="flex gap-2">
              <button
                className={`text-xs px-3 py-1.5 rounded-full ${mode==='signin' ? 'bg-primary text-primary-foreground' : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700'}`}
                onClick={() => setMode('signin')}
              >Sign In</button>
              <button
                className={`text-xs px-3 py-1.5 rounded-full ${mode==='signup' ? 'bg-primary text-primary-foreground' : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700'}`}
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
                  <label className="block text-sm text-gray-700 dark:text-gray-300">Email</label>
                  <input
                    className="w-full border rounded-xl px-3 py-2 border-border dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--ring)] outline-none"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    type="email"
                    required
                  />
                  <label className="block text-sm text-gray-700 dark:text-gray-300">Password</label>
                  <div className="relative">
                    <input
                      className="w-full border rounded-xl px-3 py-2 border-border dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--ring)] outline-none"
                      type={showPwd ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      onClick={() => setShowPwd((v) => !v)}
                      aria-label={showPwd ? 'Hide password' : 'Show password'}
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input id="remember" type="checkbox" className="h-4 w-4 rounded border-border" checked={remember} onChange={(e)=>setRemember(e.target.checked)} />
                    <label htmlFor="remember" className="text-sm text-gray-700 dark:text-gray-300">Remember me</label>
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-primary hover:bg-primary/90 active:bg-primary/80 text-primary-foreground font-semibold rounded-xl px-4 py-2 disabled:opacity-50 mt-2"
                    disabled={loading}
                  >
                    {loading ? 'Signing in...' : 'Sign In'}
                  </button>
                </form>
              </div>
              <div className="w-1/2 pl-4">
                <form onSubmit={onSignup} className="space-y-3">
                  <label className="block text-sm text-gray-700 dark:text-gray-300">Email</label>
                  <input
                    className="w-full border rounded-xl px-3 py-2 border-border dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--ring)] outline-none"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    type="email"
                    required
                  />
                  <label className="block text-sm text-gray-700 dark:text-gray-300">Password</label>
                  <div className="relative">
                    <input
                      className="w-full border rounded-xl px-3 py-2 border-border dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--ring)] outline-none"
                      type={showPwd2 ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      onClick={() => setShowPwd2((v) => !v)}
                      aria-label={showPwd2 ? 'Hide password' : 'Show password'}
                    >
                      {showPwd2 ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <label className="block text-sm text-gray-700 dark:text-gray-300">Confirm Password</label>
                  <input
                    className="w-full border rounded-xl px-3 py-2 border-border dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--ring)] outline-none"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="submit"
                    className="w-full bg-primary hover:bg-primary/90 active:bg-primary/80 text-primary-foreground font-semibold rounded-xl px-4 py-2 disabled:opacity-50 mt-2"
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
