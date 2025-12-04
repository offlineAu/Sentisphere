<?php

namespace App\Http\Controllers;

use App\Events\DashboardUpdated;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class DashboardWebhookController extends Controller
{
    /**
     * Webhook endpoint called by FastAPI when mobile data changes.
     * Verifies HMAC signature and broadcasts dashboard update via Pusher.
     */
    public function notify(Request $request): JsonResponse
    {
        // Verify webhook signature
        $secret = config('services.webhook.shared_secret');
        $signature = $request->header('X-Webhook-Signature');

        if (!$secret) {
            Log::error('[DashboardWebhook] SERVICES_WEBHOOK_SHARED_SECRET not configured');
            return response()->json(['error' => 'server misconfigured'], 500);
        }

        $body = $request->getContent();
        $expected = hash_hmac('sha256', $body, $secret);

        if (!hash_equals($expected, (string) $signature)) {
            Log::warning('[DashboardWebhook] Invalid signature', [
                'expected' => substr($expected, 0, 10) . '...',
                'received' => substr((string) $signature, 0, 10) . '...',
            ]);
            return response()->json(['error' => 'invalid signature'], 403);
        }

        // Debounce: skip if broadcast happened in last 0.5 seconds
        $throttleKey = 'dashboard:broadcast:lock';
        if (!Cache::add($throttleKey, true, 1)) {
            Log::debug('[DashboardWebhook] Throttled - broadcast already pending');
            return response()->json(['status' => 'throttled'], 200);
        }

        // Parse payload
        $payload = $request->json()->all();
        $reason = $payload['reason'] ?? 'webhook';

        // Recompute stats server-side for security (don't trust FastAPI payload)
        $stats = $this->computeDashboardStats($payload['range'] ?? 'this_week');

        // Broadcast via Pusher
        try {
            broadcast(new DashboardUpdated($stats, $reason));
            Log::info('[DashboardWebhook] Broadcast sent', ['reason' => $reason]);
            return response()->json(['status' => 'broadcasted', 'reason' => $reason]);
        } catch (\Exception $e) {
            Log::error('[DashboardWebhook] Broadcast failed', ['error' => $e->getMessage()]);
            return response()->json(['error' => 'broadcast failed'], 500);
        }
    }

    /**
     * Get current dashboard stats (for initial load).
     */
    public function current(Request $request): JsonResponse
    {
        $range = $request->query('range', 'this_week');
        $stats = $this->computeDashboardStats($range);
        return response()->json($stats);
    }

    /**
     * Compute dashboard statistics from database.
     */
    private function computeDashboardStats(string $range = 'this_week'): array
    {
        // Parse date range
        [$startDt, $endDt] = $this->parseDateRange($range);

        try {
            // Students monitored (all time - distinct users with check-ins)
            $studentsMonitored = DB::table('emotional_checkin')
                ->join('user', 'emotional_checkin.user_id', '=', 'user.user_id')
                ->where('user.role', 'student')
                ->where('user.is_active', true)
                ->distinct('emotional_checkin.user_id')
                ->count('emotional_checkin.user_id');

            // This week check-ins
            $thisWeekCheckins = DB::table('emotional_checkin')
                ->whereBetween('created_at', [$startDt, $endDt])
                ->count();

            // Downloaded appointment forms (unique users)
            $openAppointments = DB::table('user_activities')
                ->where('action', 'downloaded_form')
                ->where('target_type', 'form')
                ->whereBetween('created_at', [$startDt, $endDt])
                ->distinct('user_id')
                ->count('user_id');

            // High risk flags (alerts + negative sentiments)
            $alertCount = DB::table('alert')
                ->where('severity', 'high')
                ->whereIn('status', ['open', 'in_progress'])
                ->whereBetween('created_at', [$startDt, $endDt])
                ->count();

            $journalNegative = DB::table('journal_sentiment')
                ->where('sentiment', 'negative')
                ->whereBetween('analyzed_at', [$startDt, $endDt])
                ->count();

            $checkinNegative = DB::table('checkin_sentiment')
                ->where('sentiment', 'negative')
                ->whereBetween('analyzed_at', [$startDt, $endDt])
                ->count();

            $highRiskFlags = $alertCount + $journalNegative + $checkinNegative;

            // Recent alerts (last 5)
            $recentAlerts = DB::table('alert')
                ->join('user', 'alert.user_id', '=', 'user.user_id')
                ->select([
                    'alert.alert_id as id',
                    'user.name',
                    'alert.severity',
                    'alert.status',
                    'alert.reason',
                    'alert.created_at',
                ])
                ->orderByDesc('alert.created_at')
                ->limit(5)
                ->get()
                ->map(fn($a) => [
                    'id' => $a->id,
                    'name' => $a->name ?? 'Unknown',
                    'severity' => $a->severity,
                    'status' => $a->status,
                    'reason' => $a->reason ?? '',
                    'created_at' => $a->created_at,
                ])
                ->toArray();

            return [
                'students_monitored' => $studentsMonitored,
                'this_week_checkins' => $thisWeekCheckins,
                'open_appointments' => $openAppointments,
                'high_risk_flags' => $highRiskFlags,
                'recent_alerts' => $recentAlerts,
                'timestamp' => now()->toIso8601String(),
                'range' => $range,
            ];
        } catch (\Exception $e) {
            Log::error('[DashboardWebhook] Stats computation failed', ['error' => $e->getMessage()]);
            return [
                'students_monitored' => 0,
                'this_week_checkins' => 0,
                'open_appointments' => 0,
                'high_risk_flags' => 0,
                'recent_alerts' => [],
                'timestamp' => now()->toIso8601String(),
                'range' => $range,
                'error' => 'Failed to compute stats',
            ];
        }
    }

    /**
     * Parse global date range into start/end timestamps.
     */
    private function parseDateRange(string $range): array
    {
        $now = now();

        return match ($range) {
            'today' => [
                $now->copy()->startOfDay(),
                $now->copy()->endOfDay(),
            ],
            'yesterday' => [
                $now->copy()->subDay()->startOfDay(),
                $now->copy()->subDay()->endOfDay(),
            ],
            'this_week' => [
                $now->copy()->startOfWeek(),
                $now->copy()->endOfWeek(),
            ],
            'last_week' => [
                $now->copy()->subWeek()->startOfWeek(),
                $now->copy()->subWeek()->endOfWeek(),
            ],
            'this_month' => [
                $now->copy()->startOfMonth(),
                $now->copy()->endOfMonth(),
            ],
            'last_month' => [
                $now->copy()->subMonth()->startOfMonth(),
                $now->copy()->subMonth()->endOfMonth(),
            ],
            'last_7_days' => [
                $now->copy()->subDays(6)->startOfDay(),
                $now->copy()->endOfDay(),
            ],
            'last_30_days' => [
                $now->copy()->subDays(29)->startOfDay(),
                $now->copy()->endOfDay(),
            ],
            default => [
                $now->copy()->startOfWeek(),
                $now->copy()->endOfWeek(),
            ],
        };
    }
}
