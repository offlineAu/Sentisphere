# Sentisphere Real-Time Dashboard Architecture

## Overview

This document describes the real-time notification system that keeps the counselor dashboard synchronized with mobile app data submissions.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MOBILE APP (React Native)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Check-in   │  │   Journal   │  │    Alert    │  │   Message   │        │
│  │   Submit    │  │   Submit    │  │   Create    │  │    Send     │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
└─────────┼────────────────┼────────────────┼────────────────┼────────────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FASTAPI BACKEND (Port 8010)                          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    REST API ENDPOINTS                                │   │
│  │  POST /api/emotional-checkins  →  notify_dashboard_update("mobile_checkin")
│  │  POST /api/journals            →  notify_dashboard_update("mobile_journal")
│  │  POST /api/checkins            →  notify_dashboard_update("new_checkin")
│  │  POST /api/journals-service    →  notify_dashboard_update("new_journal")
│  │  POST /api/alerts              →  notify_dashboard_update("new_alert")
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │              DashboardEventDispatcher (Singleton)                    │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │  Features:                                                   │    │   │
│  │  │  • Debouncing (0.5s) - batches rapid updates                │    │   │
│  │  │  • Non-blocking - uses asyncio tasks                        │    │   │
│  │  │  • Thread-safe - uses asyncio locks                         │    │   │
│  │  │  • Robust - handles errors gracefully                       │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    DashboardWSManager                                │   │
│  │  • Manages WebSocket connections                                     │   │
│  │  • Broadcasts stats_update events                                    │   │
│  │  • Handles connect/disconnect                                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                 WebSocket: /ws/dashboard                             │   │
│  │  • Accepts token via query param                                     │   │
│  │  • Sends: connected, stats_update, pong                             │   │
│  │  • Receives: ping, refresh, set_range                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ WebSocket (wss://)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     REACT FRONTEND (Laravel + Vite)                         │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │              DashboardSocketManager (Singleton Class)                │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │  Features:                                                   │    │   │
│  │  │  • Singleton pattern - ONE connection for all components    │    │   │
│  │  │  • Exponential backoff - 1s → 2s → 4s → ... → 30s max      │    │   │
│  │  │  • Auto-reconnect - up to 10 attempts                       │    │   │
│  │  │  • Ping/pong keepalive - every 25 seconds                   │    │   │
│  │  │  • Auto-refresh on reconnect                                │    │   │
│  │  │  • Listener pattern - multiple components can subscribe     │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    useDashboardSocket() Hook                         │   │
│  │  • Returns: connected, stats, lastUpdate, refresh, setRange         │   │
│  │  • Callbacks: onStatsUpdate, onConnectionChange                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Dashboard Components                              │   │
│  │  • CounselorDashboard.tsx                                           │   │
│  │  • Reports.tsx                                                       │   │
│  │  • Any component using useDashboardSocket()                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Mobile App Submits Data
```
Mobile App → POST /api/emotional-checkins → FastAPI
```

### 2. FastAPI Processes & Notifies
```python
# In endpoint handler:
asyncio.create_task(notify_dashboard_update("mobile_checkin"))
```

### 3. Dispatcher Debounces & Broadcasts
```python
# DashboardEventDispatcher:
# - Waits 0.5s (debounce)
# - Computes fresh stats from DB
# - Broadcasts to all WebSocket clients
await dashboard_ws_manager.broadcast({
    "type": "stats_update",
    "stats": {...},
    "reason": "mobile_checkin",
    "timestamp": "2024-12-04T00:00:00Z"
})
```

### 4. React Receives & Updates UI
```typescript
// DashboardSocketManager receives message:
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'stats_update') {
        this.notifyStats(data.stats);  // Updates all listeners
    }
};

// useDashboardSocket hook updates state:
setStats(newStats);
setLastUpdate(new Date());
onStatsUpdate?.(newStats);  // Callback to parent component
```

## Endpoints That Trigger Dashboard Updates

| Endpoint | Reason | Description |
|----------|--------|-------------|
| `POST /api/checkins` | `new_checkin` | Web dashboard check-in |
| `POST /api/emotional-checkins` | `mobile_checkin` | Mobile app check-in |
| `POST /api/journals-service` | `new_journal` | Web dashboard journal |
| `POST /api/journals` | `mobile_journal` | Mobile app journal |
| `POST /api/alerts` | `new_alert` | New alert created |
| `POST /alerts` | `new_alert` | New alert (alias) |

## WebSocket Protocol

### Client → Server Messages
```json
{"action": "ping"}           // Keepalive
{"action": "refresh"}        // Request immediate stats
{"action": "set_range", "range": "this_week", "start": null, "end": null}
```

### Server → Client Messages
```json
{"type": "connected", "message": "Connected to dashboard notifications"}
{"type": "stats_update", "stats": {...}, "reason": "mobile_checkin", "timestamp": "..."}
{"type": "pong", "ts": "..."}
```

## Configuration

### Backend (FastAPI)
```python
# Debounce period (seconds)
DashboardEventDispatcher(debounce_seconds=0.5)

# WebSocket ping interval
WS_HEARTBEAT_SEC = 25
```

### Frontend (React)
```typescript
// DashboardSocketManager config
MAX_RECONNECT_ATTEMPTS = 10
BASE_RECONNECT_DELAY = 1000   // 1 second
MAX_RECONNECT_DELAY = 30000   // 30 seconds
PING_INTERVAL = 25000         // 25 seconds
```

## Testing Plan

### 1. Unit Tests

#### Backend
```python
# test_dashboard_dispatcher.py
async def test_debouncing():
    """Multiple rapid triggers should result in single broadcast"""
    
async def test_broadcast_to_all_clients():
    """Stats update should reach all connected clients"""
    
async def test_graceful_error_handling():
    """Dispatcher should not crash on DB errors"""
```

#### Frontend
```typescript
// useDashboardSocket.test.ts
test('singleton pattern prevents multiple connections')
test('exponential backoff on reconnect')
test('auto-refresh on reconnect')
test('listeners receive stats updates')
```

### 2. Integration Tests

```bash
# Terminal 1: Start backend
cd backend-dashboard
uvicorn main:app --reload --port 8010

# Terminal 2: Start frontend
cd sentisphere-app
npm run dev

# Terminal 3: Test with curl
# Create a check-in and verify dashboard updates
curl -X POST http://localhost:8010/api/emotional-checkins \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mood_level": "Happy", "energy_level": "High", "stress_level": "Low"}'
```

### 3. Manual Testing Checklist

- [ ] Open dashboard in browser
- [ ] Verify WebSocket connects (check console for "✓ Connected")
- [ ] Submit check-in from mobile app
- [ ] Verify dashboard updates within 1 second
- [ ] Close laptop lid / disconnect network
- [ ] Verify reconnection with exponential backoff
- [ ] Verify stats refresh after reconnect
- [ ] Open dashboard in multiple tabs
- [ ] Verify all tabs update simultaneously
- [ ] Submit 10 check-ins rapidly
- [ ] Verify debouncing (single update, not 10)

### 4. Postman Testing

```
# WebSocket Test
ws://localhost:8010/ws/dashboard?token=YOUR_JWT_TOKEN

# Send ping
{"action": "ping"}

# Request refresh
{"action": "refresh"}

# Change date range
{"action": "set_range", "range": "last_week"}
```

## Deployment Notes (Railway)

### Environment Variables
```bash
# Backend
FRONTEND_ORIGINS=https://your-app.railway.app,http://localhost:3000

# Frontend (.env)
VITE_API_URL=https://your-backend.railway.app
```

### WebSocket URL Detection
The frontend automatically detects the environment:
```typescript
if (window.location.hostname.includes('railway.app')) {
    wsUrl = 'wss://sentisphere.up.railway.app/ws/dashboard?token=...';
} else if (import.meta.env.DEV) {
    wsUrl = 'ws://localhost:8010/ws/dashboard?token=...';
}
```

### Railway Considerations
1. **WebSocket Timeout**: Railway has a 30-second idle timeout. The 25-second ping interval keeps connections alive.
2. **Connection Limits**: Monitor active WebSocket connections in Railway metrics.
3. **Scaling**: If scaling to multiple instances, consider using Redis pub/sub for cross-instance broadcasting.

## Troubleshooting

### "Max reconnection attempts reached"
- Check if backend is running on port 8010
- Verify JWT token is valid
- Check CORS settings allow WebSocket origin

### "No auth token available"
- Ensure user is logged in
- Check sessionStorage/localStorage for token

### Stats not updating
- Verify WebSocket is connected (check console)
- Check backend logs for broadcast messages
- Verify `notify_dashboard_update()` is called in endpoint

### Multiple connections
- This should not happen with singleton pattern
- If it does, check for multiple React root mounts
