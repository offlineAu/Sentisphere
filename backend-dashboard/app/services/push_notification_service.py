"""
Unified Push Notification Service

Handles all push notifications through the unified notification table:
- Daily motivational quotes (scheduler-based)
- High-risk wellness reminders (alert-triggered)
- System notifications
- Manual notifications

All notifications are stored in the `notification` table before being sent via Expo Push API.
"""

import httpx
import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import select, text, and_

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# Gentle wellness reminder messages (warm, non-clinical)
WELLNESS_REMINDER_MESSAGES = [
    {
        "title": "A Gentle Reminder 💙",
        "message": "Hi! If you ever feel like talking to someone, the counselor's office is always open for you."
    },
    {
        "title": "We're Here For You 🌸",
        "message": "Just a friendly reminder that support is always available. The counseling team is happy to chat anytime."
    },
    {
        "title": "Campus Support 🤝",
        "message": "Hey there! Remember that the wellness center is always open if you need someone to talk to."
    },
    {
        "title": "Thinking of You 🌿",
        "message": "Hi! The counselor's office door is always open - no appointment needed. Take care!"
    },
    {
        "title": "You Matter 💜",
        "message": "Just wanted to remind you that support services are available anytime you need them."
    },
]


# ============================================================================
# EXPO PUSH API FUNCTIONS
# ============================================================================

async def _send_expo_push(
    push_token: str,
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Send a push notification to a single device via Expo Push API.
    This is the low-level function that actually sends to Expo.
    """
    if not push_token or not push_token.startswith("ExponentPushToken"):
        logger.warning(f"Invalid push token format: {push_token}")
        return False
    
    message = {
        "to": push_token,
        "sound": "default",
        "title": title,
        "body": body,
        "data": data or {},
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                EXPO_PUSH_URL,
                json=message,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                logger.info(f"Push notification sent successfully")
                return True
            else:
                logger.error(f"Push notification failed: {response.status_code} - {response.text}")
                return False
                
    except Exception as e:
        logger.error(f"Failed to send push notification: {e}")
        return False


async def _send_expo_push_batch(
    messages: List[Dict[str, Any]]
) -> Dict[str, int]:
    """
    Send push notifications in batch via Expo Push API.
    Returns dict with success and failed counts.
    """
    if not messages:
        return {"success": 0, "failed": 0}
    
    success_count = 0
    failed_count = 0
    
    try:
        batch_size = 100
        for i in range(0, len(messages), batch_size):
            batch = messages[i:i + batch_size]
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    EXPO_PUSH_URL,
                    json=batch,
                    headers={
                        "Accept": "application/json",
                        "Accept-Encoding": "gzip, deflate",
                        "Content-Type": "application/json",
                    }
                )
                
                if response.status_code == 200:
                    result = response.json()
                    data_list = result.get("data", [])
                    for item in data_list:
                        if item.get("status") == "ok":
                            success_count += 1
                        else:
                            failed_count += 1
                else:
                    failed_count += len(batch)
                    logger.error(f"Batch push failed: {response.status_code}")
                    
    except Exception as e:
        logger.error(f"Failed to send batch push notifications: {e}")
        failed_count += len(messages) - success_count
    
    return {"success": success_count, "failed": failed_count}


# ============================================================================
# NOTIFICATION TABLE OPERATIONS
# ============================================================================

def create_notification(
    mobile_engine,
    user_id: int,
    title: Optional[str],
    message: str,
    category: str,
    source: str,
    related_alert_id: Optional[int] = None
) -> Optional[int]:
    """
    Create a new notification record in the unified notification table.
    
    Args:
        mobile_engine: SQLAlchemy engine for the mobile database
        user_id: Target user ID
        title: Notification title (optional)
        message: Notification body text
        category: One of 'daily_quote', 'wellness_reminder', 'system', 'counselor_message', 'insight', 'other'
        source: One of 'scheduler', 'alert_trigger', 'manual', 'system'
        related_alert_id: Optional alert ID for wellness reminders
        
    Returns:
        The created notification ID, or None if failed
    """
    insert_q = text(
        """
        INSERT INTO notification (user_id, title, message, category, source, related_alert_id, is_sent, is_read, created_at)
        VALUES (:user_id, :title, :message, :category, :source, :related_alert_id, FALSE, FALSE, NOW())
        """
    )
    
    try:
        with mobile_engine.begin() as conn:
            result = conn.execute(insert_q, {
                "user_id": user_id,
                "title": title,
                "message": message,
                "category": category,
                "source": source,
                "related_alert_id": related_alert_id
            })
            notification_id = result.lastrowid
            logger.info(f"Created notification {notification_id} for user {user_id} (category={category})")
            return notification_id
    except Exception as e:
        logger.error(f"Failed to create notification: {e}")
        return None


def update_notification_sent(
    mobile_engine,
    notification_id: int,
    is_sent: bool = True
) -> bool:
    """
    Update notification to mark as sent.
    """
    update_q = text(
        """
        UPDATE notification
        SET is_sent = :is_sent, sent_at = CASE WHEN :is_sent THEN NOW() ELSE sent_at END
        WHERE id = :notification_id
        """
    )
    
    try:
        with mobile_engine.begin() as conn:
            conn.execute(update_q, {"notification_id": notification_id, "is_sent": is_sent})
        return True
    except Exception as e:
        logger.error(f"Failed to update notification {notification_id}: {e}")
        return False


def mark_notification_read(
    mobile_engine,
    notification_id: int
) -> bool:
    """
    Mark notification as read.
    """
    update_q = text(
        """
        UPDATE notification
        SET is_read = TRUE, read_at = NOW()
        WHERE id = :notification_id
        """
    )
    
    try:
        with mobile_engine.begin() as conn:
            conn.execute(update_q, {"notification_id": notification_id})
        return True
    except Exception as e:
        logger.error(f"Failed to mark notification {notification_id} as read: {e}")
        return False


def get_user_notifications(
    mobile_engine,
    user_id: int,
    limit: int = 50,
    offset: int = 0
) -> List[Dict[str, Any]]:
    """
    Get notifications for a user, sorted by created_at DESC.
    """
    select_q = text(
        """
        SELECT id, user_id, title, message, category, source, related_alert_id,
               is_sent, sent_at, is_read, read_at, created_at
        FROM notification
        WHERE user_id = :user_id
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
        """
    )
    
    try:
        with mobile_engine.connect() as conn:
            rows = conn.execute(select_q, {"user_id": user_id, "limit": limit, "offset": offset}).mappings().all()
            return [dict(row) for row in rows]
    except Exception as e:
        logger.error(f"Failed to get notifications for user {user_id}: {e}")
        return []


# ============================================================================
# SEND NOTIFICATION (Create + Send via Expo)
# ============================================================================

async def send_push_notification(
    mobile_engine,
    user_id: int,
    notification_id: int
) -> bool:
    """
    Send a notification via Expo Push API and update its status.
    
    1. Fetch the user's Expo push token
    2. Fetch the notification details
    3. Send via Expo Push API
    4. Update is_sent = TRUE and sent_at = NOW()
    
    Args:
        mobile_engine: SQLAlchemy engine
        user_id: Target user ID
        notification_id: ID of the notification to send
        
    Returns:
        True if sent successfully, False otherwise
    """
    # Fetch user's push token
    get_token_q = text(
        """
        SELECT push_token FROM user
        WHERE user_id = :user_id AND is_active = 1
        """
    )
    
    try:
        with mobile_engine.connect() as conn:
            user_row = conn.execute(get_token_q, {"user_id": user_id}).mappings().first()
            if not user_row or not user_row.get("push_token"):
                logger.info(f"User {user_id} has no push token or is inactive")
                return False
            
            push_token = user_row["push_token"]
    except Exception as e:
        logger.error(f"Failed to fetch push token for user {user_id}: {e}")
        return False
    
    # Fetch notification details
    get_notif_q = text(
        """
        SELECT id, title, message, category FROM notification
        WHERE id = :notification_id
        """
    )
    
    try:
        with mobile_engine.connect() as conn:
            notif_row = conn.execute(get_notif_q, {"notification_id": notification_id}).mappings().first()
            if not notif_row:
                logger.error(f"Notification {notification_id} not found")
                return False
    except Exception as e:
        logger.error(f"Failed to fetch notification {notification_id}: {e}")
        return False
    
    # Send via Expo
    success = await _send_expo_push(
        push_token=push_token,
        title=notif_row.get("title") or "SentiSphere",
        body=notif_row["message"],
        data={
            "notification_id": notification_id,
            "category": notif_row.get("category")
        }
    )
    
    # Update notification status
    if success:
        update_notification_sent(mobile_engine, notification_id, is_sent=True)
    
    return success


# ============================================================================
# DAILY QUOTE NOTIFICATIONS
# ============================================================================

async def send_daily_quote_notifications(mobile_engine) -> Dict[str, Any]:
    """
    Send daily motivational quote notifications to all users with push tokens.
    
    Workflow:
    1. Fetch a quote from the quote service
    2. Get all users with valid push tokens
    3. For each user:
       - Create notification in table (category='daily_quote', source='scheduler')
       - Send via Expo Push
       - Update notification status
    
    Returns:
        Dict with stats: created, sent, failed
    """
    from app.services.quote_service import fetch_daily_quote, get_random_fallback_quote
    
    # Fetch a quote
    try:
        quote_data = await fetch_daily_quote()
    except Exception:
        quote_data = get_random_fallback_quote()
    
    quote = quote_data["quote"]
    author = quote_data["author"]
    title = "✨ Daily Inspiration"
    message = f'"{quote}" — {author}'
    
    # Get all users with push tokens
    get_users_q = text(
        """
        SELECT user_id, push_token FROM user
        WHERE push_token IS NOT NULL AND push_token != ''
        AND is_active = 1
        """
    )
    
    try:
        with mobile_engine.connect() as conn:
            users = conn.execute(get_users_q).mappings().all()
    except Exception as e:
        logger.error(f"Failed to fetch users for daily quotes: {e}")
        return {"created": 0, "sent": 0, "failed": 0, "error": str(e)}
    
    if not users:
        return {"created": 0, "sent": 0, "failed": 0, "message": "No users with push tokens"}
    
    created_count = 0
    sent_count = 0
    failed_count = 0
    
    # Batch create notifications and prepare Expo messages
    expo_messages = []
    notification_ids = []
    
    for user in users:
        user_id = user["user_id"]
        push_token = user["push_token"]
        
        # Create notification record
        notif_id = create_notification(
            mobile_engine=mobile_engine,
            user_id=user_id,
            title=title,
            message=message,
            category="daily_quote",
            source="scheduler"
        )
        
        if notif_id:
            created_count += 1
            notification_ids.append((notif_id, user_id))
            
            if push_token and push_token.startswith("ExponentPushToken"):
                expo_messages.append({
                    "to": push_token,
                    "sound": "default",
                    "title": title,
                    "body": message,
                    "data": {"notification_id": notif_id, "category": "daily_quote"}
                })
    
    # Send batch via Expo
    if expo_messages:
        result = await _send_expo_push_batch(expo_messages)
        sent_count = result["success"]
        failed_count = result["failed"]
        
        # Update sent status for all notifications
        for notif_id, user_id in notification_ids:
            update_notification_sent(mobile_engine, notif_id, is_sent=True)
    
    logger.info(f"Daily quotes: created={created_count}, sent={sent_count}, failed={failed_count}")
    
    return {
        "created": created_count,
        "sent": sent_count,
        "failed": failed_count,
        "quote": quote_data
    }


# ============================================================================
# WELLNESS REMINDER NOTIFICATIONS (Alert-Triggered)
# ============================================================================

async def send_wellness_reminder(
    mobile_engine,
    alert_id: int
) -> Dict[str, Any]:
    """
    Send a gentle wellness reminder when a high-risk alert is created.
    
    This function:
    1. Reads the alert to get user_id (does NOT modify alert table)
    2. Checks for duplicate reminders within 24 hours
    3. Creates notification with:
       - category = 'wellness_reminder'
       - source = 'alert_trigger'
       - related_alert_id = alert_id
    4. Sends via Expo Push
    5. Updates notification status
    
    The message is warm and supportive - does NOT reveal high-risk status.
    
    Args:
        mobile_engine: SQLAlchemy engine
        alert_id: The alert ID that triggered this reminder
        
    Returns:
        Dict with success status and details
    """
    import random
    
    # Read alert to get user_id (READ ONLY - do not modify)
    get_alert_q = text(
        """
        SELECT alert_id, user_id, severity, status FROM alert
        WHERE alert_id = :alert_id
        """
    )
    
    try:
        with mobile_engine.connect() as conn:
            alert = conn.execute(get_alert_q, {"alert_id": alert_id}).mappings().first()
            if not alert:
                return {"success": False, "reason": "alert_not_found", "alert_id": alert_id}
    except Exception as e:
        logger.error(f"Failed to read alert {alert_id}: {e}")
        return {"success": False, "reason": f"db_error: {e}", "alert_id": alert_id}
    
    user_id = alert["user_id"]
    
    # Check for duplicate reminders within 24 hours
    check_duplicate_q = text(
        """
        SELECT id FROM notification
        WHERE user_id = :user_id
        AND category = 'wellness_reminder'
        AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
        LIMIT 1
        """
    )
    
    try:
        with mobile_engine.connect() as conn:
            existing = conn.execute(check_duplicate_q, {"user_id": user_id}).mappings().first()
            if existing:
                logger.info(f"Wellness reminder already sent to user {user_id} within 24 hours")
                return {
                    "success": False,
                    "reason": "duplicate_within_24h",
                    "alert_id": alert_id,
                    "user_id": user_id
                }
    except Exception as e:
        logger.warning(f"Could not check for duplicate reminders: {e}")
    
    # Select a random gentle message
    msg = random.choice(WELLNESS_REMINDER_MESSAGES)
    title = msg["title"]
    message = msg["message"]
    
    # Create notification record
    notif_id = create_notification(
        mobile_engine=mobile_engine,
        user_id=user_id,
        title=title,
        message=message,
        category="wellness_reminder",
        source="alert_trigger",
        related_alert_id=alert_id
    )
    
    if not notif_id:
        return {
            "success": False,
            "reason": "failed_to_create_notification",
            "alert_id": alert_id,
            "user_id": user_id
        }
    
    # Send via Expo
    success = await send_push_notification(
        mobile_engine=mobile_engine,
        user_id=user_id,
        notification_id=notif_id
    )
    
    return {
        "success": success,
        "alert_id": alert_id,
        "user_id": user_id,
        "notification_id": notif_id,
        "message_title": title
    }


# ============================================================================
# ALERT MONITORING (Background Listener)
# ============================================================================

async def monitor_alerts_for_wellness_notifications(mobile_engine) -> Dict[str, Any]:
    """
    Monitor alerts and send wellness notifications for high-risk alerts.
    
    Conditions:
    - Alert severity IN ('high', 'critical')
    - Alert status = 'open'
    - No wellness reminder sent for this alert yet
    
    This function ONLY READS from the alert table, never modifies it.
    
    Returns:
        Dict with stats on processed alerts
    """
    # Find high-risk alerts that haven't triggered a notification yet
    find_alerts_q = text(
        """
        SELECT a.alert_id, a.user_id, a.severity
        FROM alert a
        LEFT JOIN notification n ON n.related_alert_id = a.alert_id AND n.category = 'wellness_reminder'
        WHERE a.severity IN ('high', 'critical')
        AND a.status = 'open'
        AND n.id IS NULL
        ORDER BY a.created_at DESC
        LIMIT 50
        """
    )
    
    try:
        with mobile_engine.connect() as conn:
            alerts = conn.execute(find_alerts_q).mappings().all()
    except Exception as e:
        logger.error(f"Failed to query alerts for wellness notifications: {e}")
        return {"processed": 0, "sent": 0, "error": str(e)}
    
    if not alerts:
        return {"processed": 0, "sent": 0, "message": "No new high-risk alerts"}
    
    processed = 0
    sent = 0
    
    for alert in alerts:
        processed += 1
        result = await send_wellness_reminder(
            mobile_engine=mobile_engine,
            alert_id=alert["alert_id"]
        )
        if result.get("success"):
            sent += 1
    
    logger.info(f"Wellness monitor: processed={processed}, sent={sent}")
    
    return {"processed": processed, "sent": sent}


# ============================================================================
# LEGACY COMPATIBILITY FUNCTIONS
# ============================================================================

async def send_push_notifications_batch(
    push_tokens: List[str],
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None
) -> Dict[str, int]:
    """Legacy function for backwards compatibility."""
    if not push_tokens:
        return {"success": 0, "failed": 0}
    
    valid_tokens = [t for t in push_tokens if t and t.startswith("ExponentPushToken")]
    if not valid_tokens:
        return {"success": 0, "failed": len(push_tokens)}
    
    messages = [
        {
            "to": token,
            "sound": "default",
            "title": title,
            "body": body,
            "data": data or {},
        }
        for token in valid_tokens
    ]
    
    return await _send_expo_push_batch(messages)


async def send_daily_quote_notification(
    push_tokens: List[str],
    quote: str,
    author: str
) -> Dict[str, int]:
    """Legacy function for backwards compatibility."""
    title = "✨ Daily Inspiration"
    body = f'"{quote}" — {author}'
    
    return await send_push_notifications_batch(
        push_tokens=push_tokens,
        title=title,
        body=body,
        data={"type": "daily_quote", "quote": quote, "author": author}
    )
