from datetime import datetime, timedelta
from typing import Optional
import jwt
from app.core.config import settings
from datetime import timezone


def create_access_token(
    subject: str,
    expires_delta: Optional[timedelta] = None,
    user_data: Optional[dict] = None
) -> str:
    try:
        # Calculate expiration time
        expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.JWT_EXPIRE_MINUTES))
        
        # Prepare the base payload
        payload = {
            "sub": str(subject),
            "exp": int(expire.timestamp()),
            "iat": int(datetime.now(timezone.utc).timestamp()),
        }
        
        # Add user data to the payload
        if user_data:
            # Convert all values to strings to ensure JSON serialization
            for key, value in user_data.items():
                if value is not None and key not in payload:
                    payload[key] = str(value)
        
        print(f"Creating JWT with payload: {payload}")  # Debug log
        
        # Encode the JWT token
        encoded_jwt = jwt.encode(
            payload,
            settings.JWT_SECRET_KEY,
            algorithm=settings.JWT_ALGORITHM
        )
        
        # Convert from bytes to string if needed (for PyJWT < 2.0.0)
        if isinstance(encoded_jwt, bytes):
            encoded_jwt = encoded_jwt.decode('utf-8')
            
        print(f"Successfully created JWT token")
        return encoded_jwt
        
    except Exception as e:
        print(f"Error in create_access_token: {str(e)}")
        print(f"Type of error: {type(e).__name__}")
        if hasattr(e, 'args'):
            print(f"Error args: {e.args}")
        raise
    return encoded_jwt


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
