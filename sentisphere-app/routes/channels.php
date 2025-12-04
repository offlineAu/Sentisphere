<?php

use Illuminate\Support\Facades\Broadcast;

/*
|--------------------------------------------------------------------------
| Broadcast Channels
|--------------------------------------------------------------------------
|
| Here you may register all of the event broadcasting channels that your
| application supports. The given channel authorization callbacks are
| used to check if an authenticated user can listen to the channel.
|
*/

// Public dashboard channel - any connected client can subscribe
// For production, consider switching to PrivateChannel with auth
Broadcast::channel('dashboard', function ($user = null) {
    // Public channel - return true for all
    // For private channel: return $user && $user->role === 'counselor';
    return true;
});

// Private dashboard channel (uncomment when ready for auth)
// Broadcast::channel('dashboard.{userId}', function ($user, $userId) {
//     return (int) $user->id === (int) $userId;
// });
