<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class DashboardUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public array $stats;
    public string $reason;

    /**
     * Create a new event instance.
     */
    public function __construct(array $stats, string $reason = 'data_change')
    {
        $this->stats = $stats;
        $this->reason = $reason;
    }

    /**
     * Get the channels the event should broadcast on.
     * Using public channel for simplicity - switch to PrivateChannel for auth.
     */
    public function broadcastOn(): array
    {
        return [
            new Channel('dashboard'),
        ];
    }

    /**
     * The event's broadcast name.
     */
    public function broadcastAs(): string
    {
        return 'DashboardUpdated';
    }

    /**
     * Get the data to broadcast.
     */
    public function broadcastWith(): array
    {
        return [
            'type' => 'stats_update',
            'stats' => $this->stats,
            'reason' => $this->reason,
            'timestamp' => now()->toIso8601String(),
        ];
    }
}
