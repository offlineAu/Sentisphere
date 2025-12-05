# Pusher Migration Guide

## Overview

This document describes how to migrate from the custom WebSocket system to Laravel Echo + Pusher for real-time dashboard updates.

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   Mobile App        │     │   FastAPI Backend   │     │   Laravel Backend   │
│   (React Native)    │     │   (Port 8010)       │     │   (Vercel/Railway)  │
└─────────┬───────────┘     └─────────┬───────────┘     └─────────┬───────────┘
          │                           │                           │
          │ POST /api/checkins        │                           │
          ├──────────────────────────>│                           │
          │                           │                           │
          │                           │ POST /api/dashboard/      │
          │                           │ notify-update (HMAC signed)│
          │                           ├──────────────────────────>│
          │                           │                           │
          │                           │                           │ broadcast()
          │                           │                           ├──────────┐
          │                           │                           │          │
          │                           │                           │    ┌─────▼─────┐
          │                           │                           │    │  Pusher   │
          │                           │                           │    │  (SaaS)   │
          │                           │                           │    └─────┬─────┘
          │                           │                           │          │
┌─────────▼───────────┐               │                           │          │
│   React Frontend    │◄──────────────┼───────────────────────────┼──────────┘
│   (Laravel Echo)    │  WebSocket    │                           │
└─────────────────────┘               │                           │
```

## Setup Steps

### 1. Create Pusher Account

1. Go to https://pusher.com and create an account
2. Create a new Channels app
3. Note your credentials:
   - App ID
   - Key
   - Secret
   - Cluster (e.g., `mt1`, `ap1`, `eu`)

### 2. Install Frontend Packages

```bash
cd sentisphere-app
npm install laravel-echo pusher-js
```

### 3. Environment Variables

#### Railway - Laravel Service

```env
# Broadcasting
BROADCAST_DRIVER=pusher

# Pusher Credentials
PUSHER_APP_ID=your_app_id
PUSHER_APP_KEY=your_app_key
PUSHER_APP_SECRET=your_app_secret
PUSHER_APP_CLUSTER=mt1

# Webhook Security
SERVICES_WEBHOOK_SHARED_SECRET=generate-a-secure-random-string

# App URL (for CORS)
APP_URL=https://sentisphere-production.up.railway.app
```

#### Railway - FastAPI Service

```env
# Laravel Webhook
LARAVEL_WEBHOOK_URL=https://sentisphere-production.up.railway.app/api/dashboard/notify-update
SERVICES_WEBHOOK_SHARED_SECRET=same-secret-as-laravel
```

#### Vercel - Frontend (if separate)

```env
VITE_PUSHER_APP_KEY=your_app_key
VITE_PUSHER_APP_CLUSTER=mt1
```

### 4. Update FastAPI Endpoints

Replace `notify_dashboard_update()` calls with `notify_laravel_dashboard()`:

```python
# In main.py, add import at top:
from app.services.laravel_webhook_service import notify_laravel_dashboard

# Replace existing calls:
# OLD:
asyncio.create_task(notify_dashboard_update("mobile_checkin"))

# NEW:
asyncio.create_task(notify_laravel_dashboard("mobile_checkin"))
```

### 5. Update React Components

Replace `useDashboardSocket` with `useDashboardEcho`:

```tsx
// OLD:
import { useDashboardSocket } from '@/hooks/useDashboardSocket';
const { stats, connected, refresh } = useDashboardSocket({
  onStatsUpdate: (s) => setRefreshKey(k => k + 1),
});

// NEW:
import { useDashboardEcho } from '@/hooks/useDashboardEcho';
const { stats, connected, refresh } = useDashboardEcho({
  onStatsUpdate: (s) => setRefreshKey(k => k + 1),
});
```

## Files Created

### Laravel (sentisphere-app)

| File | Purpose |
|------|---------|
| `app/Events/DashboardUpdated.php` | Broadcast event with stats payload |
| `app/Http/Controllers/DashboardWebhookController.php` | Webhook endpoint + stats computation |
| `routes/channels.php` | Channel authorization |
| `routes/web.php` | Added webhook routes |
| `config/broadcasting.php` | Pusher configuration |
| `config/services.php` | Webhook secret config |

### Frontend (sentisphere-app)

| File | Purpose |
|------|---------|
| `resources/js/lib/echo.ts` | Echo + Pusher initialization |
| `resources/js/hooks/useDashboardEcho.ts` | React hook for real-time updates |

### FastAPI (backend-dashboard)

| File | Purpose |
|------|---------|
| `app/services/laravel_webhook_service.py` | HMAC-signed webhook caller |

## Deployment Order

1. **Deploy Laravel** with Pusher credentials
2. **Deploy FastAPI** with webhook URL and secret
3. **Deploy Frontend** with Pusher key
4. **Test** the full flow
5. **Remove old code** after verification

## Test Plan

### 1. Unit Test - Webhook Signature

```bash
# From FastAPI server
python -c "
import hmac
import hashlib
import json

secret = 'your-test-secret'
payload = json.dumps({'reason': 'test', 'stats': None, 'range': 'this_week'}).encode()
sig = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
print(f'Signature: {sig}')
print(f'Payload: {payload.decode()}')
"
```

### 2. Integration Test - Full Flow

```bash
# Terminal 1: Watch Laravel logs
cd sentisphere-app
php artisan serve

# Terminal 2: Send test webhook
curl -X POST http://localhost:8000/api/dashboard/notify-update \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: YOUR_COMPUTED_SIGNATURE" \
  -d '{"reason":"test","stats":null,"range":"this_week"}'
```

### 3. E2E Test

1. Open dashboard in browser
2. Open browser DevTools → Network → WS tab
3. Verify Pusher WebSocket connection
4. Create check-in from mobile app
5. Verify dashboard updates without refresh

## Rollback Plan

If issues occur:

1. Revert FastAPI to use `notify_dashboard_update()` instead of `notify_laravel_dashboard()`
2. Revert React to use `useDashboardSocket` instead of `useDashboardEcho`
3. Remove Pusher environment variables

## Cost Considerations

Pusher Free Tier:
- 200k messages/day
- 100 concurrent connections
- Unlimited channels

For higher usage, consider:
- Pusher paid plans
- Self-hosted alternatives (Laravel WebSockets, Soketi)

## Troubleshooting

### "Invalid signature" error

- Ensure `SERVICES_WEBHOOK_SHARED_SECRET` is identical in Laravel and FastAPI
- Check for whitespace/newline differences in the secret

### "Echo not initialized"

- Verify `VITE_PUSHER_APP_KEY` is set
- Check browser console for Pusher connection errors

### Events not received

- Verify channel name matches (`.DashboardUpdated` with leading dot)
- Check Pusher Debug Console at https://dashboard.pusher.com

### Stats not updating

- Check Laravel logs for broadcast errors
- Verify queue worker is running if using queued broadcasting
