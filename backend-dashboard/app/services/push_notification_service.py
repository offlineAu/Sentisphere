"""
Unified Push Notification Service

Handles all push notifications through the unified notification table:
- Daily motivational quotes (scheduler-based)
- High-risk wellness reminders (alert-triggered, INSTANT)
- System notifications
- Counselor messages (manual triggers)
- Manual test notifications

All notifications are:
1. Stored in the `notification` table
2. Sent IMMEDIATELY via Expo Push API (no delays)
"""

import httpx
import logging
import random
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import select, text, and_

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# Gentle wellness reminder messages (warm, non-clinical)
WELLNESS_REMINDER_MESSAGES = [
    {
        "title": "A Gentle Reminder",
        "message": "Hi! If you ever feel like talking to someone, the counselor's office is always open for you."
    },
    {
        "title": "We're Here For You",
        "message": "Just a friendly reminder that support is always available. The counseling team is happy to chat anytime."
    },
    {
        "title": "Campus Support",
        "message": "Hey there! Remember that the wellness center is always open if you need someone to talk to."
    },
    {
        "title": "Thinking of You",
        "message": "Hi! The counselor's office door is always open - no appointment needed. Take care!"
    },
    {
        "title": "You Matter",
        "message": "Just wanted to remind you that support services are available anytime you need them."
    },
]


# ============================================================================
# REUSABLE EXPO PUSH HELPER FUNCTION
# ============================================================================

async def send_expo_push(
    push_token: str,
    title: str,
    message: str,
    data: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    REUSABLE HELPER: Send a push notification to a single device via Expo Push API.
    
    Args:
        push_token: Expo push token (e.g., "ExponentPushToken[xxx]")
        title: Notification title
        message: Notification body
        data: Optional extra data to include
        
    Returns:
        Dict with:
        - success: bool
        - expo_response: dict or None
        - error: str or None
        - token_used: str (truncated for privacy)
    """
    result = {
        "success": False,
        "expo_response": None,
        "error": None,
        "token_used": push_token[:30] + "..." if push_token else None
    }
    
    # Validate token format
    if not push_token:
        result["error"] = "No push token provided"
        logger.warning("send_expo_push: No push token provided")
        return result
    
    if not push_token.startswith("ExponentPushToken"):
        result["error"] = f"Invalid push token format (must start with ExponentPushToken)"
        logger.warning(f"send_expo_push: Invalid token format: {push_token[:20]}...")
        return result
    
    # Build Expo message with high priority for Android
    expo_message = {
        "to": push_token,
        "sound": "default",
        "title": title,
        "body": message,
        "data": data or {},
        "priority": "high",
        "channelId": "default",
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                EXPO_PUSH_URL,
                json=expo_message,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                }
            )
            
            if response.status_code == 200:
                expo_data = response.json()
                result["expo_response"] = expo_data
                logger.info(f"Expo response: {expo_data}")
                
                # Handle both single response (dict) and batch response (list)
                data_field = expo_data.get("data")
                
                # Normalize to get the ticket - could be dict (single) or list (batch)
                if isinstance(data_field, dict):
                    ticket = data_field
                elif isinstance(data_field, list) and len(data_field) > 0:
                    ticket = data_field[0]
                else:
                    ticket = None
                
                if ticket:
                    ticket_status = ticket.get("status")
                    logger.info(f"Expo ticket status: {ticket_status}")
                    if ticket_status == "ok":
                        result["success"] = True
                        logger.info(f"Push sent successfully to {push_token[:25]}...")
                    else:
                        # Error status with details
                        error_msg = ticket.get("message") or ticket.get("details", {}).get("error") or f"Status: {ticket_status}"
                        result["error"] = error_msg
                        logger.warning(f"Expo ticket error: {error_msg}")
                else:
                    result["success"] = True  # No error reported
                    logger.info(f"Push sent to {push_token[:25]}...")
            else:
                result["error"] = f"Expo API returned {response.status_code}: {response.text[:200]}"
                logger.error(f"Expo API error: {response.status_code}")
                
    except httpx.TimeoutException:
        result["error"] = "Expo API request timed out"
        logger.error("send_expo_push: Request timed out")
    except Exception as e:
        result["error"] = str(e)
        logger.error(f"send_expo_push error: {e}")
    
    return result


async def send_expo_push_batch(
    messages: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Send push notifications in batch via Expo Push API.
    
    Each message should have: to, title, body, data (optional)
    
    Returns:
        Dict with success_count, failed_count, errors list
    """
    if not messages:
        return {"success_count": 0, "failed_count": 0, "errors": []}
    
    success_count = 0
    failed_count = 0
    errors = []
    
    try:
        batch_size = 100
        for i in range(0, len(messages), batch_size):
            batch = messages[i:i + batch_size]
            
            # Ensure proper format with high priority for Android
            formatted_batch = []
            for msg in batch:
                formatted_batch.append({
                    "to": msg.get("to"),
                    "sound": "default",
                    "title": msg.get("title", ""),
                    "body": msg.get("body", ""),
                    "data": msg.get("data", {}),
                    "priority": "high",
                    "channelId": "default",
                })
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    EXPO_PUSH_URL,
                    json=formatted_batch,
                    headers={
                        "Accept": "application/json",
                        "Accept-Encoding": "gzip, deflate",
                        "Content-Type": "application/json",
                    }
                )
                
                if response.status_code == 200:
                    result = response.json()
                    data_list = result.get("data", [])
                    for idx, item in enumerate(data_list):
                        if item.get("status") == "ok":
                            success_count += 1
                        else:
                            failed_count += 1
                            errors.append({
                                "index": i + idx,
                                "error": item.get("message", "Unknown error")
                            })
                else:
                    failed_count += len(batch)
                    errors.append({"batch_error": f"HTTP {response.status_code}"})
                    logger.error(f"Batch push failed: {response.status_code}")
                    
    except Exception as e:
        logger.error(f"Failed to send batch push notifications: {e}")
        failed_count += len(messages) - success_count
        errors.append({"exception": str(e)})
    
    logger.info(f"Batch push complete: {success_count} sent, {failed_count} failed")
    return {"success_count": success_count, "failed_count": failed_count, "errors": errors}


# ============================================================================
# USER PUSH TOKEN LOOKUP
# ============================================================================

def get_user_push_token(mobile_engine, user_id: int) -> Optional[str]:
    """
    Lookup user's Expo push token from the user table.
    """
    q = text("SELECT push_token FROM user WHERE user_id = :uid AND is_active = 1 LIMIT 1")
    try:
        with mobile_engine.connect() as conn:
            row = conn.execute(q, {"uid": user_id}).first()
            if row and row[0]:
                return row[0]
    except Exception as e:
        logger.error(f"Failed to lookup push token for user {user_id}: {e}")
    return None


# ============================================================================
# NOTIFICATION TABLE OPERATIONS
# ============================================================================

def create_notification_record(
    mobile_engine,
    user_id: int,
    title: Optional[str],
    message: str,
    category: str,
    source: str,
    related_alert_id: Optional[int] = None,
    is_sent: bool = False,
    sent_at: bool = False
) -> Optional[int]:
    """
    Create a notification record in the unified notification table.
    
    Categories: 'daily_quote', 'wellness_reminder', 'system', 'counselor_message', 'insight', 'other'
    Sources: 'scheduler', 'alert_trigger', 'manual', 'system'
    
    Returns:
        notification_id or None
    """
    insert_q = text(
        """
        INSERT INTO notification (user_id, title, message, category, source, related_alert_id, is_sent, sent_at, is_read, created_at)
        VALUES (
            :user_id,
            :title,
            :message,
            :category,
            :source,
            :related_alert_id,
            :is_sent,
            CASE WHEN :sent_at THEN CONVERT_TZ(NOW(), 'UTC', 'Asia/Manila') ELSE NULL END,
            FALSE,
            CONVERT_TZ(NOW(), 'UTC', 'Asia/Manila')
        )
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
                "related_alert_id": related_alert_id,
                "is_sent": is_sent,
                "sent_at": sent_at
            })
            notification_id = result.lastrowid
            logger.info(f"Created notification {notification_id} for user {user_id} [{category}]")
            return notification_id
    except Exception as e:
        logger.error(f"Failed to create notification: {e}")
        return None


def update_notification_sent(mobile_engine, notification_id: int) -> bool:
    """Mark notification as sent with current timestamp."""
    update_q = text(
        """
        UPDATE notification SET is_sent = TRUE, sent_at = CONVERT_TZ(NOW(), 'UTC', 'Asia/Manila')
        WHERE id = :notification_id
        """
    )
    try:
        with mobile_engine.begin() as conn:
            conn.execute(update_q, {"notification_id": notification_id})
        return True
    except Exception as e:
        logger.error(f"Failed to update notification {notification_id}: {e}")
        return False


def mark_notification_read(mobile_engine, notification_id: int) -> bool:
    """Mark notification as read with current timestamp."""
    update_q = text(
        """
        UPDATE notification SET is_read = TRUE, read_at = CONVERT_TZ(NOW(), 'UTC', 'Asia/Manila')
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
    """Get notifications for a user, sorted by created_at DESC."""
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
# INSTANT NOTIFICATION SENDER (Create + Send Immediately)
# ============================================================================

async def send_notification_instantly(
    mobile_engine,
    user_id: int,
    title: str,
    message: str,
    category: str,
    source: str,
    related_alert_id: Optional[int] = None,
    extra_data: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Create a notification AND send it INSTANTLY via Expo Push.
    
    This is the main function for sending notifications - NO DELAY.
    
    Args:
        mobile_engine: Database engine
        user_id: Target user
        title: Notification title
        message: Notification body
        category: 'daily_quote', 'wellness_reminder', 'system', 'counselor_message', 'insight', 'other'
        source: 'scheduler', 'alert_trigger', 'manual', 'system'
        related_alert_id: Optional linked alert
        extra_data: Extra data to include in push payload
        
    Returns:
        Dict with notification_id, push_result, success status
    """
    result = {
        "success": False,
        "notification_id": None,
        "push_sent": False,
        "push_result": None,
        "error": None
    }
    
    # 1. Get user's push token
    push_token = get_user_push_token(mobile_engine, user_id)
    if not push_token:
        result["error"] = "User has no push token registered"
        logger.warning(f"Cannot send notification to user {user_id}: no push token")
        # Still create the notification record
        notification_id = create_notification_record(
            mobile_engine, user_id, title, message, category, source, 
            related_alert_id, is_sent=False, sent_at=False
        )
        result["notification_id"] = notification_id
        return result
    
    # 2. Create notification record (mark as sent since we'll send immediately)
    notification_id = create_notification_record(
        mobile_engine, user_id, title, message, category, source,
        related_alert_id, is_sent=True, sent_at=True
    )
    
    if not notification_id:
        result["error"] = "Failed to create notification record"
        return result
    
    result["notification_id"] = notification_id
    
    # 3. Send via Expo Push API IMMEDIATELY
    push_data = {
        "notification_id": notification_id,
        "category": category,
        "source": source,
        **(extra_data or {})
    }
    
    push_result = await send_expo_push(push_token, title, message, push_data)
    result["push_result"] = push_result
    result["push_sent"] = push_result.get("success", False)
    
    if push_result.get("success"):
        result["success"] = True
        logger.info(f"✓ Notification {notification_id} sent instantly to user {user_id}")
    else:
        # Update notification to mark as not sent if push failed
        update_q = text("UPDATE notification SET is_sent = FALSE, sent_at = NULL WHERE id = :nid")
        try:
            with mobile_engine.begin() as conn:
                conn.execute(update_q, {"nid": notification_id})
        except:
            pass
        result["error"] = push_result.get("error")
        logger.warning(f"Notification {notification_id} created but push failed: {result['error']}")
    
    return result


# ============================================================================
# ALERT-TRIGGERED NOTIFICATIONS (INSTANT)
# ============================================================================

async def send_alert_notification_instantly(
    mobile_engine,
    alert_id: int,
    user_id: int,
    severity: str
) -> Dict[str, Any]:
    """
    Send a wellness notification INSTANTLY when a high-risk alert is created.
    
    NO DELAY - sends immediately.
    
    Args:
        mobile_engine: SQLAlchemy engine
        alert_id: The alert that triggered this
        user_id: Target user
        severity: Alert severity ('high', 'critical', etc.)
        
    Returns:
        Dict with notification_id, push_result, success status
    """
    # Select a random gentle message
    msg = random.choice(WELLNESS_REMINDER_MESSAGES)
    title = msg["title"]
    message = msg["message"]
    
    # Send instantly
    result = await send_notification_instantly(
        mobile_engine=mobile_engine,
        user_id=user_id,
        title=title,
        message=message,
        category="wellness_reminder",
        source="alert_trigger",
        related_alert_id=alert_id,
        extra_data={"alert_id": alert_id, "severity": severity}
    )
    
    result["alert_id"] = alert_id
    result["severity"] = severity
    result["message_title"] = title
    
    if result.get("success"):
        logger.info(f"✓ Instant wellness notification sent for alert {alert_id} to user {user_id}")
    
    return result


# ============================================================================
# DAILY QUOTE NOTIFICATIONS (INSTANT)
# ============================================================================

async def send_daily_quote_notifications(mobile_engine) -> Dict[str, Any]:
    """
    Send daily motivational quote notifications to all eligible users.
    
    ⚠️ CORRECT PER-USER DELIVERY:
    - Creates ONE notification per user (with that user's user_id)
    - Sends push to ONLY that user's push_token
    - NO BROADCAST to all users
    
    Returns:
        Dict with stats: created, sent, failed
    """
    from app.services.quote_service import fetch_daily_quote, get_random_fallback_quote
    
    logger.info("[Daily Quote] Starting daily quote notification job...")
    
    # Fetch a quote
    try:
        quote_data = await fetch_daily_quote()
    except Exception:
        quote_data = get_random_fallback_quote()
    
    quote = quote_data["quote"]
    author = quote_data["author"]
    title = "Daily Inspiration"
    message = f'"{quote}" — {author}'
    
    # Get all users with push tokens WHO HAVEN'T received a daily quote in the last 5 minutes
    # This prevents duplicates when testing with frequent intervals
    # TODO: Change to INTERVAL 23 HOUR for production (to allow once per day)
    get_users_q = text(
        """
        SELECT u.user_id, u.push_token, u.nickname FROM user u
        WHERE u.push_token IS NOT NULL AND u.push_token != ''
        AND u.push_token LIKE 'ExponentPushToken%'
        AND u.is_active = 1
        AND NOT EXISTS (
            SELECT 1 FROM notification n 
            WHERE n.user_id = u.user_id 
            AND n.category = 'daily_quote'
            AND n.created_at > CONVERT_TZ(NOW(), 'UTC', 'Asia/Manila') - INTERVAL 5 MINUTE
        )
        """
    )
    
    try:
        with mobile_engine.connect() as conn:
            users = conn.execute(get_users_q).mappings().all()
    except Exception as e:
        logger.error(f"[Daily Quote] Failed to fetch users: {e}")
        return {"created": 0, "sent": 0, "failed": 0, "error": str(e)}
    
    logger.info(f"[Daily Quote] Found {len(users)} eligible users for daily quote")
    
    if not users:
        return {"created": 0, "sent": 0, "failed": 0, "message": "No eligible users"}
    
    created_count = 0
    sent_count = 0
    failed_count = 0
    
    # CORRECT: For each user, create ONE notification and send to ONLY that user
    for user in users:
        user_id = user["user_id"]
        push_token = user["push_token"]
        nickname = user.get("nickname", "Unknown")
        
        logger.info(f"[Daily Quote] Processing user {user_id} ({nickname})")
        
        # Create notification record for THIS user (user_id in record)
        notif_id = create_notification_record(
            mobile_engine=mobile_engine,
            user_id=user_id,  # CRITICAL: notification belongs to this specific user
            title=title,
            message=message,
            category="daily_quote",
            source="scheduler",
            is_sent=False,  # Will mark as sent after successful push
            sent_at=False
        )
        
        if notif_id:
            created_count += 1
            logger.info(f"[Daily Quote] Created notification {notif_id} for user {user_id}")
            
            # Send push to ONLY this user's token (1 notification → 1 user)
            if push_token:
                logger.info(f"[Daily Quote] Sending notification {notif_id} to user {user_id}'s token")
                push_result = await send_expo_push(
                    push_token, title, message,
                    {"notification_id": notif_id, "category": "daily_quote"}
                )
                if push_result.get("success"):
                    # Mark as sent
                    update_q = text("UPDATE notification SET is_sent = TRUE, sent_at = CONVERT_TZ(NOW(), 'UTC', 'Asia/Manila') WHERE id = :nid")
                    try:
                        with mobile_engine.begin() as conn:
                            conn.execute(update_q, {"nid": notif_id})
                    except:
                        pass
                    sent_count += 1
                    logger.info(f"[Daily Quote] ✓ Notification {notif_id} sent to user {user_id}")
                else:
                    failed_count += 1
                    logger.error(f"[Daily Quote] ✗ Failed to send notification {notif_id} to user {user_id}: {push_result.get('error')}")
            else:
                logger.warning(f"[Daily Quote] Skipping user {user_id}: no valid push token")
    
    logger.info(f"[Daily Quote] Complete: created={created_count}, sent={sent_count}, failed={failed_count}")
    
    return {
        "created": created_count,
        "sent": sent_count,
        "failed": failed_count,
        "quote": quote_data
    }


# ============================================================================
# WELLNESS REMINDER (INSTANT - Called when alert is created)
# ============================================================================

async def send_wellness_reminder_instantly(
    mobile_engine,
    alert_id: int,
    user_id: int,
    skip_duplicate_check: bool = False
) -> Dict[str, Any]:
    """
    Send a gentle wellness reminder INSTANTLY when a high-risk alert is created.
    
    NO DELAY - sends immediately.
    
    Args:
        mobile_engine: SQLAlchemy engine
        alert_id: The alert ID that triggered this
        user_id: Target user
        skip_duplicate_check: If True, skip the 24-hour duplicate check
        
    Returns:
        Dict with success status and details
    """
    # Check for duplicate reminders within 24 hours (unless skipped)
    if not skip_duplicate_check:
        check_duplicate_q = text(
            """
            SELECT id FROM notification
            WHERE user_id = :user_id
            AND category = 'wellness_reminder'
            AND created_at > DATE_SUB(CONVERT_TZ(NOW(), 'UTC', 'Asia/Manila'), INTERVAL 24 HOUR)
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
    
    # Send instantly
    result = await send_notification_instantly(
        mobile_engine=mobile_engine,
        user_id=user_id,
        title=title,
        message=message,
        category="wellness_reminder",
        source="alert_trigger",
        related_alert_id=alert_id,
        extra_data={"alert_id": alert_id}
    )
    
    result["alert_id"] = alert_id
    result["message_title"] = title
    
    # If notification was sent successfully, mark the alert as resolved
    if result.get("success"):
        try:
            from app.services.smart_alert_service import SmartAlertService
            from app.db.database import SessionLocal
            with SessionLocal() as db:
                SmartAlertService.resolve_alert_on_notification(db, alert_id)
                result["alert_resolved"] = True
                logger.info(f"Alert {alert_id} resolved after successful notification")
        except Exception as e:
            logger.warning(f"Could not resolve alert {alert_id}: {e}")
            result["alert_resolved"] = False
    
    return result


# Legacy alias
async def send_wellness_reminder(mobile_engine, alert_id: int) -> Dict[str, Any]:
    """Legacy function - looks up user_id from alert and sends instantly."""
    get_alert_q = text("SELECT user_id FROM alert WHERE alert_id = :alert_id")
    try:
        with mobile_engine.connect() as conn:
            alert = conn.execute(get_alert_q, {"alert_id": alert_id}).mappings().first()
            if not alert:
                return {"success": False, "reason": "alert_not_found", "alert_id": alert_id}
    except Exception as e:
        return {"success": False, "reason": f"db_error: {e}", "alert_id": alert_id}
    
    return await send_wellness_reminder_instantly(mobile_engine, alert_id, alert["user_id"])


# ============================================================================
# TEST NOTIFICATION (Manual Testing via API)
# ============================================================================

async def send_test_notification(
    mobile_engine,
    user_id: int,
    title: str,
    message: str
) -> Dict[str, Any]:
    """
    Send a test notification for QA testing via Postman/API.
    
    Creates a notification record and sends immediately via Expo Push.
    
    Args:
        mobile_engine: Database engine
        user_id: Target user
        title: Notification title
        message: Notification body
        
    Returns:
        Dict with notification_id, push_result, token_used, etc.
    """
    # Get user's push token
    push_token = get_user_push_token(mobile_engine, user_id)
    
    result = {
        "success": False,
        "notification_id": None,
        "push_sent": False,
        "expo_response": None,
        "token_used": push_token[:30] + "..." if push_token else None,
        "error": None
    }
    
    if not push_token:
        result["error"] = "User has no push token registered"
        # Still create notification record
        notif_id = create_notification_record(
            mobile_engine, user_id, title, message,
            category="system", source="manual",
            is_sent=False, sent_at=False
        )
        result["notification_id"] = notif_id
        return result
    
    # Create notification record (mark as sent)
    notif_id = create_notification_record(
        mobile_engine, user_id, title, message,
        category="system", source="manual",
        is_sent=True, sent_at=True
    )
    
    if not notif_id:
        result["error"] = "Failed to create notification record"
        return result
    
    result["notification_id"] = notif_id
    
    # Send via Expo IMMEDIATELY
    push_result = await send_expo_push(
        push_token, title, message,
        {"notification_id": notif_id, "category": "system", "source": "manual"}
    )
    
    result["expo_response"] = push_result.get("expo_response")
    result["push_sent"] = push_result.get("success", False)
    
    if push_result.get("success"):
        result["success"] = True
        logger.info(f"✓ Test notification {notif_id} sent to user {user_id}")
    else:
        result["error"] = push_result.get("error")
        # Mark as not sent
        update_q = text("UPDATE notification SET is_sent = FALSE, sent_at = NULL WHERE id = :nid")
        try:
            with mobile_engine.begin() as conn:
                conn.execute(update_q, {"nid": notif_id})
        except:
            pass
    
    return result


# ============================================================================
# COUNSELOR MESSAGE NOTIFICATION (Manual Trigger)
# ============================================================================

async def send_counselor_message(
    mobile_engine,
    user_id: int,
    title: str,
    message: str,
    counselor_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Send a counselor message notification to a student.
    
    Args:
        mobile_engine: Database engine
        user_id: Target student user
        title: Message title
        message: Message body
        counselor_id: Optional counselor ID who sent the message
        
    Returns:
        Dict with notification details
    """
    return await send_notification_instantly(
        mobile_engine=mobile_engine,
        user_id=user_id,
        title=title or "Message from Counselor 💬",
        message=message,
        category="counselor_message",
        source="manual",
        extra_data={"counselor_id": counselor_id} if counselor_id else None
    )


# ============================================================================
# SYSTEM NOTIFICATION
# ============================================================================

async def send_system_notification(
    mobile_engine,
    user_id: int,
    title: str,
    message: str
) -> Dict[str, Any]:
    """Send a system notification to a user."""
    return await send_notification_instantly(
        mobile_engine=mobile_engine,
        user_id=user_id,
        title=title,
        message=message,
        category="system",
        source="system"
    )


# ============================================================================
# PROCESS UNSENT NOTIFICATIONS (Per-User Delivery - NO BROADCAST)
# ============================================================================

async def process_unsent_notifications(mobile_engine) -> Dict[str, Any]:
    """
    Process all unsent notifications and deliver them to their SPECIFIC users.
    
    ⚠️ CRITICAL: This function sends each notification ONLY to its associated user_id.
    There is NO broadcast - each notification row is delivered to exactly ONE user.
    
    Logic:
    1. Query unsent notifications JOINed with user table to get push_token
    2. For each notification: send to ONLY that notification's user_id's push_token
    3. Mark notification as sent after successful delivery
    
    Returns:
        Dict with processed, sent, skipped, failed counts
    """
    logger.info("[Process Unsent] Starting per-user notification delivery...")
    
    # Query unsent notifications with their owner's push token
    # CRITICAL: We JOIN to get ONLY the notification owner's token, not all users
    query = text("""
        SELECT 
            n.id as notification_id,
            n.user_id,
            n.title,
            n.message,
            n.category,
            n.source,
            u.push_token,
            u.nickname
        FROM notification n
        JOIN user u ON u.user_id = n.user_id
        WHERE n.is_sent = FALSE
        AND u.push_token IS NOT NULL
        AND u.push_token != ''
        AND u.push_token LIKE 'ExponentPushToken%'
        ORDER BY n.created_at ASC
        LIMIT 100
    """)
    
    processed = 0
    sent = 0
    skipped = 0
    failed = 0
    
    try:
        with mobile_engine.connect() as conn:
            notifications = conn.execute(query).mappings().all()
            logger.info(f"[Process Unsent] Found {len(notifications)} unsent notifications to process")
            
            for notif in notifications:
                notif_id = notif["notification_id"]
                user_id = notif["user_id"]
                push_token = notif["push_token"]
                nickname = notif.get("nickname", "Unknown")
                title = notif.get("title") or "Notification"
                message = notif.get("message") or ""
                category = notif.get("category") or "system"
                
                processed += 1
                
                # Log the 1-to-1 mapping
                logger.info(f"[Process Unsent] Sending notification {notif_id} to user {user_id} ({nickname})")
                
                if not push_token:
                    logger.warning(f"[Process Unsent] Skipping notification {notif_id}: user {user_id} has no push token")
                    skipped += 1
                    continue
                
                # Send to ONLY this user's push token
                push_result = await send_expo_push(
                    push_token=push_token,
                    title=title,
                    message=message,
                    data={"notification_id": notif_id, "category": category}
                )
                
                if push_result.get("success"):
                    # Mark as sent
                    update_q = text("UPDATE notification SET is_sent = TRUE, sent_at = NOW() WHERE id = :nid")
                    with mobile_engine.begin() as update_conn:
                        update_conn.execute(update_q, {"nid": notif_id})
                    logger.info(f"[Process Unsent] ✓ Marked notification {notif_id} as sent to user {user_id}")
                    sent += 1
                else:
                    logger.error(f"[Process Unsent] ✗ Failed to send notification {notif_id} to user {user_id}: {push_result.get('error')}")
                    failed += 1
                    
    except Exception as e:
        logger.error(f"[Process Unsent] Error processing notifications: {e}")
        return {
            "success": False,
            "error": str(e),
            "processed": processed,
            "sent": sent,
            "skipped": skipped,
            "failed": failed
        }
    
    logger.info(f"[Process Unsent] Complete: processed={processed}, sent={sent}, skipped={skipped}, failed={failed}")
    
    return {
        "success": True,
        "processed": processed,
        "sent": sent,
        "skipped": skipped,
        "failed": failed
    }


# ============================================================================
# ALERT MONITORING (Background Job)
# ============================================================================

async def monitor_alerts_for_wellness_notifications(mobile_engine) -> Dict[str, Any]:
    """
    Monitor alerts table for new high-risk alerts that haven't been notified.
    Sends wellness reminder notifications for any unprocessed alerts.
    
    This runs as a scheduled background job every 15 minutes.
    
    Returns:
        Dict with processed count and sent count
    """
    # Query for high-risk alerts that haven't been notified yet
    # Look for alerts created in the last 24 hours that don't have a notification
    # Note: MariaDB/MySQL uses INTERVAL 24 HOUR syntax (not PostgreSQL's '24 hours')
    # Alert table uses 'severity' column with values: 'low', 'medium', 'high'
    query = text("""
        SELECT a.alert_id, a.user_id, a.created_at, u.push_token, u.nickname
        FROM alert a
        JOIN user u ON a.user_id = u.user_id
        WHERE a.created_at > NOW() - INTERVAL 24 HOUR
        AND a.severity = 'high'
        AND u.push_token IS NOT NULL
        AND u.push_token != ''
        AND NOT EXISTS (
            SELECT 1 FROM notification n 
            WHERE n.category = 'wellness_reminder' 
            AND n.related_alert_id = a.alert_id 
            AND n.user_id = a.user_id
        )
        ORDER BY a.created_at DESC
        LIMIT 50
    """)
    
    processed = 0
    sent = 0
    errors = []
    
    try:
        with mobile_engine.connect() as conn:
            # Debug: First check if any high alerts exist at all
            debug_query = text("SELECT COUNT(*) as cnt FROM alert WHERE severity = 'high'")
            debug_result = conn.execute(debug_query).fetchone()
            logger.info(f"[Alert Monitor] Total high-severity alerts in DB: {debug_result[0] if debug_result else 0}")
            
            result = conn.execute(query)
            alerts = result.fetchall()
            logger.info(f"[Alert Monitor] Found {len(alerts)} unnotified high-risk alerts")
            
            for alert in alerts:
                alert_id = alert[0]
                user_id = alert[1]
                push_token = alert[3] if len(alert) > 3 else None
                nickname = alert[4] if len(alert) > 4 else None
                processed += 1
                logger.info(f"[Alert Monitor] Processing alert_id={alert_id} for user {nickname}(id={user_id}), token={push_token[:25] if push_token else 'None'}...")
                
                try:
                    # Send wellness reminder for this alert (skip duplicate check for faster response)
                    notification_result = await send_wellness_reminder_instantly(
                        mobile_engine=mobile_engine,
                        alert_id=alert_id,
                        user_id=user_id,
                        skip_duplicate_check=True  # Skip 24h duplicate check for testing
                    )
                    
                    if notification_result.get("success"):
                        sent += 1
                        logger.info(f"Sent wellness reminder for alert {alert_id} to user {user_id}")
                    else:
                        errors.append(f"Alert {alert_id}: {notification_result.get('error', 'Unknown error')}")
                        
                except Exception as e:
                    errors.append(f"Alert {alert_id}: {str(e)}")
                    logger.error(f"Failed to send wellness reminder for alert {alert_id}: {e}")
                    
    except Exception as e:
        logger.error(f"Failed to query alerts for monitoring: {e}")
        return {
            "success": False,
            "error": str(e),
            "processed": 0,
            "sent": 0
        }
    
    return {
        "success": True,
        "processed": processed,
        "sent": sent,
        "errors": errors if errors else None
    }
