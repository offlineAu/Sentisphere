"""
Pusher service for real-time chat events.

This service handles:
- Message broadcasts to conversation channels
- Typing indicators
- Conversation status updates
"""

import os
import logging
from typing import Optional, Dict, Any

# Try to import pusher, but don't fail if not installed
try:
    import pusher
    PUSHER_AVAILABLE = True
except ImportError:
    PUSHER_AVAILABLE = False
    logging.warning("Pusher package not installed. Real-time chat features will be disabled.")


class PusherService:
    """Service for broadcasting real-time events via Pusher."""
    
    _instance: Optional["PusherService"] = None
    _client: Optional[Any] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance
    
    def _initialize(self):
        """Initialize Pusher client from environment variables."""
        if not PUSHER_AVAILABLE:
            self._client = None
            return
            
        app_id = os.getenv("PUSHER_APP_ID")
        key = os.getenv("PUSHER_APP_KEY")
        secret = os.getenv("PUSHER_APP_SECRET")
        cluster = os.getenv("PUSHER_APP_CLUSTER", "ap1")
        
        if not all([app_id, key, secret]):
            logging.warning("Pusher credentials not configured. Real-time features disabled.")
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
            logging.info(f"Pusher client initialized (cluster: {cluster})")
        except Exception as e:
            logging.error(f"Failed to initialize Pusher: {e}")
            self._client = None
    
    @property
    def is_available(self) -> bool:
        """Check if Pusher is available and configured."""
        return self._client is not None
    
    def trigger(self, channel: str, event: str, data: Dict[str, Any]) -> bool:
        """
        Trigger an event on a Pusher channel.
        
        Args:
            channel: The channel name (e.g., 'conversation-123')
            event: The event name (e.g., 'message', 'typing')
            data: The event payload
            
        Returns:
            True if successful, False otherwise
        """
        if not self._client:
            return False
        
        try:
            self._client.trigger(channel, event, data)
            return True
        except Exception as e:
            logging.error(f"Pusher trigger failed: {e}")
            return False
    
    def broadcast_message(self, conversation_id: int, message: Dict[str, Any]) -> bool:
        """Broadcast a new message to a conversation channel."""
        return self.trigger(
            f"conversation-{conversation_id}",
            "message",
            {
                "type": "message.created",
                "conversation_id": conversation_id,
                "message": message,
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
