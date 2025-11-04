from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from app.schemas.auth import Token
from app.services.jwt import create_access_token
from app.db.database import engine
from datetime import datetime, timezone, timedelta
from app.core.config import settings

router = APIRouter()

def _bcrypt_available():
    try:
        import bcrypt  # type: ignore
        return True
    except Exception:
        return False

def _verify_password(plain: str, stored: str) -> bool:
    if not stored:
        return False
    if stored.startswith("$2a$") or stored.startswith("$2b$") or stored.startswith("$2y$"):
        try:
            import bcrypt  # type: ignore
            return bcrypt.checkpw(plain.encode(), stored.encode())
        except Exception:
            return False
    return plain == stored

@router.post("/token", response_model=Token)
async def login_for_access_token(request: Request):
    # Extract credentials from form-encoded or JSON body
    username = None
    password = None
    try:
        ctype = request.headers.get("content-type", "").lower()
        if ctype.startswith("application/x-www-form-urlencoded") or ctype.startswith("multipart/form-data"):
            form = await request.form()
            username = form.get("username")
            password = form.get("password")
        else:
            data = await request.json()
            username = data.get("username")
            password = data.get("password")
    except Exception:
        pass
    if not username or not password:
        raise HTTPException(status_code=422, detail="Missing username or password")

    with engine.connect() as conn:
        row = None
        try:
            row = conn.execute(
                text(
                    """
                    SELECT user_id, email, name, password_hash, password
                    FROM user
                    WHERE email = :email OR name = :email
                    LIMIT 1
                    """
                ),
                {"email": username},
            ).mappings().first()
        except ProgrammingError:
            row = conn.execute(
                text(
                    """
                    SELECT user_id, email, name, password_hash
                    FROM user
                    WHERE email = :email OR name = :email
                    LIMIT 1
                    """
                ),
                {"email": username},
            ).mappings().first()
        stored = ""
        if row:
            try:
                stored = (row.get("password_hash") or "") or (row.get("password") or "")
            except AttributeError:
                stored = (row["password_hash"] if "password_hash" in row and row["password_hash"] else "") or (row["password"] if "password" in row and row["password"] else "")
        if not row or not _verify_password(password, stored):
            raise HTTPException(status_code=400, detail="Incorrect username or password")
            
        try:
            # Get user details with proper type conversion and fallbacks
            user_id = str(row.get("user_id") or "")
            if not user_id:
                raise ValueError("User ID is required")
                
            user_email = str(row.get("email") or "")
            user_name = str(row.get("name") or user_email.split('@')[0] if user_email and '@' in user_email else "User")
            
            # Prepare user data for token - ensure all values are strings
            user_data = {
                "email": user_email,
                "name": user_name,
                "role": "counselor"
            }
            
            print(f"Creating token with user data: {user_data}")
            
            # Create token with user data
            token = create_access_token(
                subject=user_id,
                expires_delta=timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
                user_data=user_data
            )
            
            if not token:
                raise ValueError("Failed to create token: Empty token returned")
                
            print(f"Token created successfully. Length: {len(token)}")
            return Token(access_token=token)
            
        except ValueError as ve:
            print(f"Validation error: {str(ve)}")
            raise HTTPException(status_code=400, detail=str(ve))
        except Exception as e:
            error_msg = f"Error creating access token: {str(e)}"
            print(error_msg)
            raise HTTPException(status_code=500, detail=error_msg)
        return Token(access_token=token)

@router.post("/signup")
async def signup(payload: dict):
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip()
    password = payload.get("password") or ""
    confirm = payload.get("confirm_password") or ""
    if not email or not password or not confirm:
        raise HTTPException(status_code=400, detail="Missing required fields")
    if password != confirm:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    with engine.connect() as conn:
        exists = conn.execute(text("SELECT COUNT(*) AS c FROM user WHERE email = :email"), {"email": email}).mappings().first()["c"]
        if exists:
            raise HTTPException(status_code=400, detail="Email already registered")
        to_store = password
        if _bcrypt_available():
            import bcrypt  # type: ignore
            to_store = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        result = conn.execute(text(
            """
            INSERT INTO user (email, name, role, password_hash, is_active, created_at)
            VALUES (:email, :name, 'counselor', :ph, 1, NOW())
            """
        ), {"email": email, "name": name or None, "ph": to_store})
        conn.commit()
        return {"ok": True, "user_id": result.lastrowid}

@router.post("/logout")
async def logout():
    return {"ok": True}
