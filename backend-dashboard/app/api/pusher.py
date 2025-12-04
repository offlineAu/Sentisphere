"""
Pusher Beams Authentication Endpoint

Provides authentication tokens for Android push notification registration
via Pusher Beams. This endpoint is called by the mobile app when
initializing Pusher Beams for a user.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

# Lazy initialization of Pusher Beams client
_beams_client = None


def get_beams_client():
    """Get or initialize the Pusher Beams client."""
    global _beams_client
    
    if _beams_client is not None:
        return _beams_client
    
    if not settings.PUSHER_INSTANCE_ID or not settings.PUSHER_SECRET_KEY:
        logger.warning("Pusher Beams not configured - PUSHER_INSTANCE_ID or PUSHER_SECRET_KEY missing")
        return None
    
    try:
        from pusher_push_notifications import PushNotifications
        _beams_client = PushNotifications(
            instance_id=settings.PUSHER_INSTANCE_ID,
            secret_key=settings.PUSHER_SECRET_KEY
        )
        logger.info("Pusher Beams client initialized successfully")
        return _beams_client
    except ImportError:
        logger.error("pusher_push_notifications package not installed")
        return None
    except Exception as e:
        logger.error(f"Failed to initialize Pusher Beams client: {e}")
        return None


class AuthPayload(BaseModel):
    user_id: int | str


@router.post("/auth")
def pusher_auth(payload: AuthPayload):
    """
    Generate a Pusher Beams authentication token for a user.
    
    This endpoint is called by the mobile app during Pusher Beams
    initialization to authenticate the user for push notifications.
    
    Args:
        payload: Contains user_id to authenticate
        
    Returns:
        Token object for Pusher Beams authentication
    """
    beams_client = get_beams_client()
    
    if beams_client is None:
        raise HTTPException(
            status_code=503,
            detail="Pusher Beams service not configured"
        )
    
    try:
        user_id_str = str(payload.user_id)
        token = beams_client.generate_token(user_id_str)
        logger.info(f"Generated Pusher Beams token for user {user_id_str}")
        return token
    except Exception as e:
        logger.error(f"Failed to generate Pusher Beams token for user {payload.user_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate authentication token"
        )
