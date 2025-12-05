"""
Pusher service for real-time chat events.

This service handles:
- Message broadcasts to conversation channels
- Typing indicators
- Conversation status updates
- Dashboard real-time updates
"""

import os
import logging
import time
import threading
from typing import Optional, Dict, Any, List, Tuple
from collections import deque

# Try to import pusher, but don't fail if not installed
try:
    import pusher
    PUSHER_AVAILABLE = True
except ImportError:
    PUSHER_AVAILABLE = False
    logging.warning("Pusher package not installed. Real-time chat features will be disabled.")


class PusherService:
    """Service for broadcasting real-time events via Pusher with retry and batching."""
    
    _instance: Optional["PusherService"] = None
    _client: Optional[Any] = None
    _retry_queue: deque = deque(maxlen=100)  # Queue for failed events
    _retry_lock: threading.Lock = threading.Lock()
    _retry_thread: Optional[threading.Thread] = None
    _running: bool = False
    
    # Retry configuration
    MAX_RETRIES = 3
    RETRY_DELAY_SECONDS = 1.0
    BATCH_SIZE = 10  # Pusher allows up to 10 events per batch
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance
    
    def _initialize(self):
        """Initialize Pusher client from environment variables."""
        if not PUSHER_AVAILABLE:
            logging.error("[Pusher] ✗ pusher package not installed! Run: pip install pusher")
            self._client = None
            return
            
        app_id = os.getenv("PUSHER_APP_ID")
        key = os.getenv("PUSHER_APP_KEY")
        secret = os.getenv("PUSHER_APP_SECRET")
        cluster = os.getenv("PUSHER_APP_CLUSTER", "ap1")
        
        logging.info(f"[Pusher] Checking credentials: app_id={'✓' if app_id else '✗'}, key={'✓' if key else '✗'}, secret={'✓' if secret else '✗'}")
        
        if not all([app_id, key, secret]):
            logging.error("[Pusher] ✗ Missing credentials in .env! Need: PUSHER_APP_ID, PUSHER_APP_KEY, PUSHER_APP_SECRET")
            self._client = None
            return
        
        try:
            self._client = pusher.Pusher(
                app_id=app_id,
                key=key,
                secret=secret,
                cluster=cluster,
                ssl=True
            )
            logging.info(f"[Pusher] ✓ Client initialized successfully (cluster: {cluster})")
            
            # Start retry thread
            self._running = True
            self._retry_thread = threading.Thread(target=self._retry_worker, daemon=True)
            self._retry_thread.start()
        except Exception as e:
            logging.error(f"Failed to initialize Pusher: {e}")
            self._client = None
    
    def _retry_worker(self):
        """Background thread to retry failed events."""
        while self._running:
            try:
                time.sleep(self.RETRY_DELAY_SECONDS)
                self._process_retry_queue()
            except Exception as e:
                logging.error(f"[Pusher] Retry worker error: {e}")
    
    def _process_retry_queue(self):
        """Process events in the retry queue."""
        if not self._client or not self._retry_queue:
            return
            
        with self._retry_lock:
            items_to_retry = []
            while self._retry_queue and len(items_to_retry) < self.BATCH_SIZE:
                items_to_retry.append(self._retry_queue.popleft())
        
        for channel, event, data, retries in items_to_retry:
            if retries >= self.MAX_RETRIES:
                logging.warning(f"[Pusher] Max retries reached for {event} on {channel}, dropping event")
                continue
            try:
                self._client.trigger(channel, event, data)
                logging.info(f"[Pusher] ✓ Retry successful: '{event}' to '{channel}'")
            except Exception as e:
                logging.warning(f"[Pusher] Retry {retries + 1} failed for {event}: {e}")
                with self._retry_lock:
                    self._retry_queue.append((channel, event, data, retries + 1))
    
    @property
    def is_available(self) -> bool:
        """Check if Pusher is available and configured."""
        return self._client is not None
    
    def trigger(self, channel: str, event: str, data: Dict[str, Any], retry_on_fail: bool = True) -> bool:
        """
        Trigger an event on a Pusher channel with optional retry.
        
        Args:
            channel: The channel name (e.g., 'conversation-123')
            event: The event name (e.g., 'message', 'typing')
            data: The event payload
            retry_on_fail: Whether to queue for retry on failure
            
        Returns:
            True if successful, False otherwise
        """
        if not self._client:
            logging.warning(f"[Pusher] Client not available - cannot send {event} to {channel}")
            return False
        
        try:
            self._client.trigger(channel, event, data)
            logging.info(f"[Pusher] ✓ Sent '{event}' to channel '{channel}'")
            return True
        except Exception as e:
            logging.error(f"[Pusher] ✗ Failed to send '{event}' to '{channel}': {e}")
            if retry_on_fail:
                with self._retry_lock:
                    self._retry_queue.append((channel, event, data, 0))
                logging.info(f"[Pusher] Queued for retry: {event} on {channel}")
            return False
    
    def trigger_batch(self, events: List[Tuple[str, str, Dict[str, Any]]]) -> bool:
        """
        Trigger multiple events in a batch (more efficient for multiple updates).
        
        Args:
            events: List of (channel, event, data) tuples
            
        Returns:
            True if all successful, False otherwise
        """
        if not self._client or not events:
            return False
        
        try:
            batch = [
                {"channel": channel, "name": event, "data": data}
                for channel, event, data in events[:self.BATCH_SIZE]
            ]
            self._client.trigger_batch(batch)
            logging.info(f"[Pusher] ✓ Batch sent: {len(batch)} events")
            return True
        except Exception as e:
            logging.error(f"[Pusher] ✗ Batch trigger failed: {e}")
            # Queue individual events for retry
            for channel, event, data in events:
                with self._retry_lock:
                    self._retry_queue.append((channel, event, data, 0))
            return False
    
    def broadcast_message(self, conversation_id: int, message: Dict[str, Any]) -> bool:
        """Broadcast a new message to a conversation channel."""
        # Broadcast to specific conversation channel
        self.trigger(
            f"conversation-{conversation_id}",
            "message",
            {
                "type": "message.created",
                "conversation_id": conversation_id,
                "message": message,
            }
        )
        # Also broadcast to global conversations channel for sidebar badge updates
        return self.trigger(
            "conversations",
            "new_message",
            {
                "type": "new_message",
                "conversation_id": conversation_id,
                "sender_id": message.get("sender_id"),
            }
        )
    
    def broadcast_typing(self, conversation_id: int, user_id: int, nickname: str) -> bool:
        """Broadcast typing indicator to a conversation channel."""
        return self.trigger(
            f"conversation-{conversation_id}",
            "typing",
            {
                "type": "typing",
                "conversation_id": conversation_id,
                "user_id": user_id,
                "nickname": nickname,
            }
        )
    
    def broadcast_conversation_status(self, conversation_id: int, status: str) -> bool:
        """Broadcast conversation status change (open/ended)."""
        # Broadcast to specific conversation channel
        self.trigger(
            f"conversation-{conversation_id}",
            "status",
            {
                "type": "conversation.ended" if status == "ended" else "conversation.opened",
                "conversation_id": conversation_id,
                "status": status,
            }
        )
        # Also broadcast to global conversations channel for counselor dashboard
        return self.trigger(
            "conversations",
            "status_changed",
            {
                "conversation_id": conversation_id,
                "status": status,
            }
        )
    
    def broadcast_messages_read(self, conversation_id: int, reader_id: int, count: int) -> bool:
        """Broadcast that messages have been read in a conversation."""
        return self.trigger(
            f"conversation-{conversation_id}",
            "messages_read",
            {
                "type": "messages.read",
                "conversation_id": conversation_id,
                "reader_id": reader_id,
                "count": count,
            }
        )
    
    def broadcast_unread_count(self, user_id: int, total_unread: int) -> bool:
        """Broadcast updated unread count to a specific user's channel."""
        return self.trigger(
            f"user-{user_id}",
            "unread_count",
            {
                "type": "unread_count",
                "user_id": user_id,
                "total_unread": total_unread,
            }
        )
    
    # =========================================================================
    # Dashboard Events
    # =========================================================================
    
    def broadcast_new_checkin(self, user_id: int) -> bool:
        """Broadcast new check-in event to dashboard."""
        return self.trigger(
            "dashboard",
            "new_checkin",
            {
                "type": "new_checkin",
                "user_id": user_id,
            }
        )
    
    def broadcast_new_journal(self, user_id: int, journal_id: int) -> bool:
        """Broadcast new journal event to dashboard."""
        return self.trigger(
            "dashboard",
            "new_journal",
            {
                "type": "new_journal",
                "user_id": user_id,
                "journal_id": journal_id,
            }
        )
    
    def broadcast_new_alert(self, alert_id: int, severity: str) -> bool:
        """Broadcast new alert event to dashboard."""
        return self.trigger(
            "dashboard",
            "new_alert",
            {
                "type": "new_alert",
                "alert_id": alert_id,
                "severity": severity,
            }
        )
    
    def broadcast_dashboard_update(self, reason: str, stats: Optional[Dict[str, Any]] = None) -> bool:
        """Broadcast general dashboard update."""
        return self.trigger(
            "dashboard",
            "stats_update",
            {
                "type": "stats_update",
                "reason": reason,
                "stats": stats,
            }
        )


# Singleton instance
pusher_service = PusherService()
