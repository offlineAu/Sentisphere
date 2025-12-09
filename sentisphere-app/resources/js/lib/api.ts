import axios from 'axios';

// Use relative base so it works with Vite proxy in dev and Laravel proxy in prod
const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || ''}/api`,
});

// Initialize Authorization header from localStorage token if present
const existing = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
if (existing) {
  api.defaults.headers.common['Authorization'] = `Bearer ${existing}`;
}

// Response interceptor to handle errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    
    if (status === 401) {
      // Don't trigger on login/auth endpoints
      if (!url.includes('/auth/token') && !url.includes('/auth/login')) {
        // Dispatch custom event for session manager to handle
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth:unauthorized', {
            detail: { url, status: 401 }
          }));
        }
      }
    } else if (status === 404) {
      // Log 404s at debug level - these are often expected (deleted resources)
      console.debug(`[API] Resource not found: ${url}`);
    } else if (status >= 500) {
      // Log server errors
      console.error(`[API] Server error (${status}): ${url}`, error.response?.data);
    }
    
    return Promise.reject(error);
  }
);

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
