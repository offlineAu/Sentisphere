import axios from 'axios';
import api, { setAuthToken } from './api';

function csrfToken() {
  const el = document.head.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null;
  return el?.content || '';
}

export interface LoginResponse { ok: boolean; error?: string }
export interface LogoutResponse { ok: boolean }
export interface SessionStatus { authenticated: boolean }
export interface SignupResponse { ok: boolean; user_id?: number; errors?: any; error?: string }

export async function loginFastApi(username: string, password: string): Promise<LoginResponse> {
  try {
    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', password);
    params.append('grant_type', 'password');
    params.append('scope', '');
    // OAuth2PasswordRequestForm requires form-encoded
    const resp = await api.post<{ access_token: string; token_type: string }>('/auth/token', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json' },
      validateStatus: () => true,
    });
    if (resp.status >= 200 && resp.status < 300 && resp.data?.access_token) {
      setAuthToken(resp.data.access_token);
      return { ok: true };
    }
    const detail = (resp as any)?.data?.detail;
    const msg = typeof detail === 'string' ? detail : (detail ? JSON.stringify(detail) : 'Invalid credentials');
    return { ok: false, error: msg };
  } catch (e) {
    return { ok: false, error: 'Network error' };
  }
}

export async function logoutFastApi(): Promise<LogoutResponse> {
  try {
    const resp = await api.post<LogoutResponse>('/auth/logout', {}, { validateStatus: () => true });
    setAuthToken(null);
    return resp.data || { ok: true };
  } catch (e) {
    setAuthToken(null);
    return { ok: true };
  }
}

export async function sessionStatus(): Promise<SessionStatus> {
  try {
    const tok = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const resp = await api.get<{ user_id: number }>(
      '/auth/me',
      {
        headers: tok ? { Authorization: `Bearer ${tok}` } : undefined,
        validateStatus: () => true,
      }
    );
    if (resp.status >= 200 && resp.status < 300 && typeof resp.data?.user_id === 'number') {
      return { authenticated: true };
    }
    return { authenticated: false };
  } catch (e) {
    return { authenticated: false };
  }
}

export async function signupFastApi(email: string, password: string, confirm_password: string, name?: string): Promise<SignupResponse> {
  try {
    const payload: any = { email, password, confirm_password };
    if (name) payload.name = name;
    const resp = await api.post<{ ok: boolean; user_id?: number; detail?: string }>('/auth/signup', payload, {
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });
    if (resp.status >= 200 && resp.status < 300 && resp.data?.ok) {
      return { ok: true, user_id: resp.data.user_id };
    }
    const detail = (resp as any)?.data?.detail;
    const msg = typeof detail === 'string' ? detail : (detail ? JSON.stringify(detail) : 'Signup failed');
    return { ok: false, error: msg };
  } catch (e) {
    return { ok: false, error: 'Network error' };
  }
}
