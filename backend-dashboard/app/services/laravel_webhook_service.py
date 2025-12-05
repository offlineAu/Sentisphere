"""
Laravel Webhook Service

Sends signed webhooks to Laravel to trigger Pusher broadcasts
when mobile data changes (check-ins, journals, alerts, etc.)

This replaces the direct WebSocket broadcasting with Laravel Echo.
"""

import asyncio
import hashlib
import hmac
import json
import logging
from os import getenv
from typing import Optional

import httpx

# Configuration from environment
LARAVEL_WEBHOOK_URL = getenv('LARAVEL_WEBHOOK_URL')  # e.g., https://sentisphere-production.up.railway.app/api/dashboard/notify-update
SHARED_SECRET = getenv('SERVICES_WEBHOOK_SHARED_SECRET')

# Debounce state
_pending_webhook = False
_debounce_task: Optional[asyncio.Task] = None
_debounce_seconds = 0.5


async def _send_webhook(reason: str, stats: Optional[dict] = None):
    """Actually send the webhook to Laravel."""
    global _pending_webhook
    
    if not LARAVEL_WEBHOOK_URL:
        logging.warning("[webhook] LARAVEL_WEBHOOK_URL not configured")
        return
    
    if not SHARED_SECRET:
        logging.warning("[webhook] SERVICES_WEBHOOK_SHARED_SECRET not configured")
        return
    
    try:
        # Build payload
        payload = {
            "reason": reason,
            "stats": stats,  # Laravel will recompute for security
            "range": "this_week",
        }
        
        body = json.dumps(payload).encode('utf-8')
        
        # Sign with HMAC-SHA256
        signature = hmac.new(
            SHARED_SECRET.encode('utf-8'),
            body,
            hashlib.sha256
        ).hexdigest()
        
        headers = {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
        }
        
        # Send async request
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                LARAVEL_WEBHOOK_URL,
                content=body,
                headers=headers,
            )
            
            if response.status_code == 200:
                logging.info("[webhook] Laravel notified successfully: %s", reason)
            elif response.status_code == 403:
                logging.error("[webhook] Invalid signature - check SERVICES_WEBHOOK_SHARED_SECRET")
            else:
                logging.warning("[webhook] Laravel returned %d: %s", response.status_code, response.text[:100])
                
    except httpx.TimeoutException:
        logging.error("[webhook] Request to Laravel timed out")
    except Exception as e:
        logging.error("[webhook] Failed to notify Laravel: %s", str(e))
    finally:
        _pending_webhook = False


async def notify_laravel_dashboard(reason: str = "data_change"):
    """
    Trigger a dashboard update via Laravel webhook.
    
    This is debounced - multiple rapid calls result in a single webhook.
    
    Args:
        reason: Description of what triggered the update (for logging)
    
    Usage:
        await notify_laravel_dashboard("mobile_checkin")
    """
    global _pending_webhook, _debounce_task
    
    if _pending_webhook:
        logging.debug("[webhook] Update already pending, skipping: %s", reason)
        return
    
    _pending_webhook = True
    logging.info("[webhook] Dashboard update triggered by: %s", reason)
    
    # Cancel existing debounce task
    if _debounce_task and not _debounce_task.done():
        _debounce_task.cancel()
    
    # Schedule debounced send
    async def debounced():
        await asyncio.sleep(_debounce_seconds)
        await _send_webhook(reason)
    
    _debounce_task = asyncio.create_task(debounced())


def notify_laravel_dashboard_sync(reason: str = "data_change"):
    """
    Synchronous wrapper for notify_laravel_dashboard.
    Use this from sync FastAPI endpoints.
    """
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(notify_laravel_dashboard(reason))
    except RuntimeError:
        # No running loop
        asyncio.run(notify_laravel_dashboard(reason))
