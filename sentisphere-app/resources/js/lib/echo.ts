/**
 * Laravel Echo + Pusher initialization
 * Automatically uses Pusher if packages are installed and configured.
 * Falls back to null (HTTP polling) otherwise.
 */

let echo: any = null;

// Only initialize if we're in browser and have Pusher key
if (typeof window !== 'undefined') {
  const pusherKey = import.meta.env.VITE_PUSHER_APP_KEY;
  const pusherCluster = import.meta.env.VITE_PUSHER_APP_CLUSTER || 'ap1';

  if (pusherKey) {
    try {
      // Dynamic require to avoid build errors when packages aren't installed
      const Pusher = require('pusher-js');
      const Echo = require('laravel-echo').default;

      (window as any).Pusher = Pusher;

      echo = new Echo({
        broadcaster: 'pusher',
        key: pusherKey,
        cluster: pusherCluster,
        forceTLS: true,
      });

      console.log('[Echo] Connected to Pusher');
    } catch (e) {
      console.log('[Echo] Pusher packages not installed, using HTTP polling');
    }
  } else {
    console.log('[Echo] VITE_PUSHER_APP_KEY not set, using HTTP polling');
  }
}

export default echo;
