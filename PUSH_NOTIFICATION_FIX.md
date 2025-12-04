# Push Notification Fix - Token Collision Bug

## Problem Identified

**Two different users were sharing the same push token**, causing notifications to be sent to the wrong device.

### Root Cause

When a user logs out, their push token was **not being cleared** from the database. This caused:

1. User A logs in on iPhone → registers iPhone's Expo token to User A's database row
2. User A logs out → **token stays in User A's row** ❌
3. User B logs in on same iPhone → registers same iPhone token to User B's row
4. **Both User A and User B now have the same token** (iPhone's token)
5. Notifications sent to User A go to iPhone (now User B's device) ❌

## Solution Implemented

### 1. Fixed Logout Flow (`app/logout.tsx`)

- Added import: `import { unregisterPushToken } from '@/utils/notifications'`
- Updated `doLogout()` to call `unregisterPushToken()` **before** clearing auth token
- This ensures the push token is removed from the backend when user logs out

### 2. Added Diagnostic Logging

**Mobile app** (`utils/notifications.ts`):
- Added detailed logging for token registration showing:
  - Platform (iOS/Android)
  - Token (first 40 chars)
  - Auth token (first 20 chars)
  - Registration success/failure

**Backend** (`backend-dashboard/main.py`):
- Added logging to `/api/push-token` endpoint showing:
  - User ID and nickname
  - Token being registered
  - Success/failure status
  - Rows updated count

These logs will help track:
- Which user is registering which token
- If token collisions still occur
- If tokens are being properly cleared on logout

## What You Need to Do

### 1. Deploy Backend Changes

```bash
cd /Users/USER/Documents/GitHub/Sentisphere/backend-dashboard
git add main.py
git commit -m "Add detailed logging for push token registration"
git push origin main
# Railway will auto-deploy
```

### 2. Rebuild Mobile App

Since you changed `google-services.json` and updated mobile code:

```bash
cd /Users/USER/Documents/GitHub/Sentisphere/sentisphere-mobile
eas build -p android --profile releaseApk
# or whichever profile you use for standalone
```

### 3. Test the Fix

**After deploying backend and installing new build:**

1. **On iPhone (User A):**
   - Log in as User A
   - Watch logs for token registration: `[Push Token Registration] User {id} ({nickname}) registering token...`
   - Note the token

2. **Log out User A:**
   - Press logout button
   - Watch logs for: `[Logout] Unregistering push token...`
   - Backend should show token being cleared (set to NULL)

3. **On Android (User B):**
   - Log in as User B (different user)
   - Watch logs for token registration
   - Note the token (should be different from iPhone)

4. **Send test notifications:**
   - Use backend or Expo notification tool to send to User A → should go to iPhone only
   - Send to User B → should go to Android only
   - They should NOT receive each other's notifications

### 4. Check Railway Logs

Watch Railway logs for these lines when users log in/out:

```
[Push Token Registration] User {id} ({nickname}) registering token: ExponentPushToken[...]
✓ Successfully updated token for user {id} ({nickname})
```

When user logs out (calls DELETE `/api/push-token`), you should see the token being cleared.

## Additional Notes

- The FCM credentials are now properly configured in Expo for `com.sentisphere.mobile`
- `google-services.json` is aligned with project ID `sentisphere-be1f1`
- Backend uses Expo Push API (not direct FCM), which is correct
- The bug was in **logout flow**, not FCM/Expo configuration

## Verification Checklist

- [ ] Backend deployed with new logging
- [ ] Mobile app rebuilt with logout fix
- [ ] New build installed on both devices
- [ ] User A can log in and receive notifications
- [ ] User A's token is cleared on logout (check Railway logs)
- [ ] User B can log in and receive notifications
- [ ] User A and User B have **different tokens** in database
- [ ] Notifications go to correct device only
