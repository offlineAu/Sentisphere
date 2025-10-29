import axios from 'axios';

// Use relative base so it works with Vite proxy in dev and Laravel proxy in prod
const api = axios.create({
  baseURL: '/api',
});

// Initialize Authorization header from localStorage token if present
const existing = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
if (existing) {
  api.defaults.headers.common['Authorization'] = `Bearer ${existing}`;
}

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem('auth_token', token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    localStorage.removeItem('auth_token');
    delete api.defaults.headers.common['Authorization'];
  }
}

export default api;
