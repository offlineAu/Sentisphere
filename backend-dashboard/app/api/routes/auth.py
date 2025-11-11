from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy import text, select, func, or_
from sqlalchemy.exc import ProgrammingError, IntegrityError
from app.schemas.auth import Token
from app.services.jwt import create_access_token
from app.db.database import engine, ENGINE_INIT_ERROR_MSG
from app.db.mobile_database import mobile_engine, MobileSessionLocal
from app.models.mobile_user import MobileUser
from datetime import datetime, timezone, timedelta
from app.core.config import settings
import httpx
import re

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

def _allowed_domain(email: str) -> bool:
    try:
        domain = (email or "").split("@", 1)[1].lower()
    except Exception:
        return False
    # allow exact match or subdomains of any allowed root (e.g., 1.ustp.edu.ph endswith ustp.edu.ph)
    allowed = {d.lower() for d in settings.ALLOWED_EMAIL_DOMAINS}
    return any(domain == d or domain.endswith("." + d) for d in allowed)

def _ms_creds_present() -> bool:
    return bool(settings.MS_TENANT_ID and settings.MS_CLIENT_ID and settings.MS_CLIENT_SECRET)

@router.post("/microsoft")
async def microsoft_auth(request: Request):
    if not settings.MS_CLIENT_ID or not settings.MS_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Microsoft app credentials are not configured on the server")
    try:
        data = await request.json()
    except Exception:
        data = {}
    code = (data.get("code") or "").strip()
    redirect_uri = (data.get("redirect_uri") or "").strip() or None
    if not code:
        raise HTTPException(status_code=422, detail="Missing authorization code")
    try:
        token_resp = httpx.post(
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            data={
                "client_id": settings.MS_CLIENT_ID,
                "client_secret": settings.MS_CLIENT_SECRET,
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri or "http://localhost:8081/auth",
            },
            timeout=15.0,
        )
        token_resp.raise_for_status()
        token_json = token_resp.json()
        access_token = token_json.get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="Failed to obtain Microsoft access token")
        me = httpx.get(
            "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName,department",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10.0,
        )
        me.raise_for_status()
        u = me.json() or {}
        email = (u.get("mail") or u.get("userPrincipalName") or "").strip().lower()
        name = (u.get("displayName") or (email.split("@",1)[0] if "@" in email else "User")).strip()
        if not email or "@" not in email:
            raise HTTPException(status_code=400, detail="Microsoft account did not return a valid email")
        if not _allowed_domain(email):
            raise HTTPException(status_code=403, detail="Email domain not allowed")
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT user_id, role FROM user WHERE email = :email LIMIT 1"),
                {"email": email},
            ).mappings().first()
            if row and row["role"] != "student":
                raise HTTPException(status_code=400, detail="Email already used by another role")
            if row:
                conn.execute(
                    text("UPDATE user SET name = :name, is_active = 1 WHERE user_id = :id"),
                    {"name": name or None, "id": row["user_id"]},
                )
                user_id = row["user_id"]
            else:
                result = conn.execute(
                    text(
                        "INSERT INTO user (email, name, role, is_active, created_at) VALUES (:email, :name, 'student', 1, NOW())"
                    ),
                    {"email": email, "name": name or None},
                )
                user_id = result.lastrowid
            conn.commit()
        jwt_token = create_access_token(
            subject=str(user_id),
            expires_delta=timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
            user_data={"email": email, "name": name, "role": "student"},
        )
        return {"ok": True, "access_token": jwt_token, "student": {"email": email, "name": name, "department": u.get("department"), "microsoft_id": u.get("id")}}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Microsoft auth failed: {str(e)}")

@router.post("/verify-school-email")
async def verify_school_email(request: Request):
    try:
        data = await request.json()
    except Exception:
        data = {}
    email = (data.get("email") or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=422, detail="Invalid email format")

    # Strict USTP pattern: firstname.lastname@[1-8]?.ustp.edu.ph
    ustp_pattern = r"^[a-z]+\.[a-z]+@[1-8]?\.ustp\.edu\.ph$|^[a-z]+\.[a-z]+@ustp\.edu\.ph$"
    if not re.match(ustp_pattern, email):
        raise HTTPException(status_code=400, detail="Invalid or non-USTP email")

    # Allowed explicit domains
    VALID_USTP_DOMAINS = {
        "ustp.edu.ph",
        "1.ustp.edu.ph",
        "2.ustp.edu.ph",
        "3.ustp.edu.ph",
        "4.ustp.edu.ph",
        "5.ustp.edu.ph",
        "6.ustp.edu.ph",
        "7.ustp.edu.ph",
        "8.ustp.edu.ph",
    }
    try:
        domain = email.split("@", 1)[1]
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid email format")

    if domain not in VALID_USTP_DOMAINS:
        raise HTTPException(status_code=400, detail="Email domain not allowed")

    return {"status": "verified", "domain": domain}

@router.post("/verify-email")
async def verify_email(request: Request):
    try:
        data = await request.json()
    except Exception:
        data = {}
    email = (data.get("email") or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=422, detail="Invalid email")
    if not _allowed_domain(email):
        raise HTTPException(status_code=400, detail="Email domain not allowed")

    student = {"email": email}
    method = "domain_only"
    if _ms_creds_present():
        try:
            token_resp = httpx.post(
                f"https://login.microsoftonline.com/{settings.MS_TENANT_ID}/oauth2/v2.0/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": settings.MS_CLIENT_ID,
                    "client_secret": settings.MS_CLIENT_SECRET,
                    "scope": "https://graph.microsoft.com/.default",
                },
                timeout=10.0,
            )
            token_resp.raise_for_status()
            access_token = token_resp.json().get("access_token")
            if access_token:
                method = "graph"
                q = (
                    f"https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,department"
                    f"&$filter=mail eq '{email}' or userPrincipalName eq '{email}'"
                )
                g = httpx.get(q, headers={"Authorization": f"Bearer {access_token}"}, timeout=10.0)
                if g.status_code == 200:
                    arr = g.json().get("value") or []
                    if arr:
                        u = arr[0]
                        student.update({
                            "name": u.get("displayName") or (email.split("@",1)[0]),
                            "student_id": u.get("id"),
                            "college": u.get("department"),
                        })
        except Exception:
            pass
    if "name" not in student:
        student["name"] = email.split("@", 1)[0]
    return {"verified": True, "method": method, "student": student}

@router.post("/mobile/register")
async def mobile_register(request: Request):
    try:
        data = await request.json()
    except Exception:
        data = {}

    nickname = (data.get("nickname") or "").strip()
    if len(nickname) < 3 or len(nickname) > 50:
        raise HTTPException(status_code=422, detail="Nickname must be 3-50 characters")

    created_user = None
    with MobileSessionLocal() as db:
        try:
            existing = db.execute(
                select(MobileUser).where(
                    or_(
                        func.lower(MobileUser.nickname) == func.lower(nickname),
                        func.lower(MobileUser.name) == func.lower(nickname),
                    )
                ).limit(1)
            ).scalars().first()

            if existing:
                if (existing.role or "student") != "student":
                    raise HTTPException(status_code=400, detail="Nickname already used by another role")
                token = create_access_token(
                    subject=str(existing.user_id),
                    expires_delta=timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
                    user_data={
                        "email": existing.email or "",
                        "name": existing.nickname or existing.name or nickname,
                        "role": "student",
                    },
                )
                return {"ok": True, "user_id": existing.user_id, "access_token": token, "existing": True}

            new_user = MobileUser(
                email=None,
                name=nickname,
                role="student",
                nickname=nickname,
                is_active=True,
            )
            db.add(new_user)
            db.commit()
            db.refresh(new_user)
            created_user = new_user
        except HTTPException:
            db.rollback()
            raise
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(status_code=400, detail="Nickname already exists") from exc
        except Exception as exc:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to register: {str(exc)}") from exc

    if not created_user:
        raise HTTPException(status_code=500, detail="Failed to register user")

    token = create_access_token(
        subject=str(created_user.user_id),
        expires_delta=timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
        user_data={"name": created_user.nickname or nickname, "role": "student"},
    )
    return {"ok": True, "user_id": created_user.user_id, "access_token": token, "existing": False}

@router.post("/mobile/login")
async def mobile_login(request: Request):
    try:
        data = await request.json()
    except Exception:
        data = {}

    nickname = (data.get("nickname") or "").strip()
    if not nickname:
        raise HTTPException(status_code=422, detail="Nickname required")

    with MobileSessionLocal() as db:
        user = db.execute(
            select(MobileUser).where(
                or_(
                    func.lower(MobileUser.nickname) == func.lower(nickname),
                    func.lower(MobileUser.name) == func.lower(nickname),
                )
            ).limit(1)
        ).scalars().first()

        if not user or (user.role or "student") != "student":
            raise HTTPException(status_code=404, detail="Not registered")

        token = create_access_token(
            subject=str(user.user_id),
            expires_delta=timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
            user_data={
                "email": user.email or "",
                "name": user.nickname or user.name or nickname,
                "role": "student",
            },
        )
        return {"access_token": token}


@router.post("/register")
async def register_student(request: Request):
    try:
        data = await request.json()
    except Exception:
        data = {}
    email = (data.get("email") or "").strip().lower()
    nickname = (data.get("nickname") or "").strip()
    password = (data.get("password") or "").strip()
    name = (data.get("name") or "").strip() or (email.split("@",1)[0] if email else nickname)

    # Branch: nickname-first registration (no email required)
    if nickname and not email:
        if len(nickname) < 3 or len(nickname) > 50:
            raise HTTPException(status_code=422, detail="Nickname must be 3-50 characters")
        with engine.connect() as conn:
            # Check duplicates by nickname or name
            row = conn.execute(
                text("SELECT user_id FROM user WHERE LOWER(nickname) = LOWER(:n) OR LOWER(name) = LOWER(:n) LIMIT 1"),
                {"n": nickname},
            ).mappings().first()
            if row:
                raise HTTPException(status_code=400, detail="Nickname already taken")

            to_store = password
            if _bcrypt_available() and password:
                import bcrypt  # type: ignore
                to_store = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

            result = conn.execute(
                text(
                    "INSERT INTO user (email, name, role, nickname, password_hash, is_active, created_at) "
                    "VALUES (NULL, :name, 'student', :nickname, :ph, 1, NOW())"
                ),
                {"name": nickname, "nickname": nickname, "ph": to_store or None},
            )
            user_id = result.lastrowid
            conn.commit()
        token = create_access_token(subject=str(user_id), expires_delta=timedelta(minutes=settings.JWT_EXPIRE_MINUTES), user_data={"name": nickname, "role": "student"})
        return {"ok": True, "user_id": user_id, "access_token": token}

    # Fallback: email-based registration (existing behavior)
    if not email or "@" not in email:
        raise HTTPException(status_code=422, detail="Invalid email")
    if not _allowed_domain(email):
        raise HTTPException(status_code=400, detail="Email domain not allowed")
    with engine.connect() as conn:
        row = conn.execute(text("SELECT user_id, role FROM user WHERE email = :email LIMIT 1"), {"email": email}).mappings().first()
        if row and row["role"] != "student":
            raise HTTPException(status_code=400, detail="Email already used by another role")
        if row:
            conn.execute(text("UPDATE user SET name = :name, nickname = :nickname, is_active = 1 WHERE user_id = :id"), {"name": name, "nickname": nickname or None, "id": row["user_id"]})
            user_id = row["user_id"]
        else:
            result = conn.execute(text("INSERT INTO user (email, name, role, nickname, is_active, created_at) VALUES (:email, :name, 'student', :nickname, 1, NOW())"), {"email": email, "name": name, "nickname": nickname or None})
            user_id = result.lastrowid
        conn.commit()
    token = create_access_token(subject=str(user_id), expires_delta=timedelta(minutes=settings.JWT_EXPIRE_MINUTES), user_data={"email": email, "name": name, "role": "student"})
    return {"ok": True, "user_id": user_id, "access_token": token}

@router.post("/login")
async def student_login(request: Request):
    try:
        data = await request.json()
    except Exception:
        data = {}
    email = (data.get("email") or "").strip().lower()
    nickname = (data.get("nickname") or "").strip()
    password = data.get("password")
    if not email and not nickname:
        raise HTTPException(status_code=422, detail="Missing email or nickname")
    if email and not _allowed_domain(email):
        raise HTTPException(status_code=400, detail="Email domain not allowed")
    with engine.connect() as conn:
        if email:
            row = conn.execute(text("SELECT user_id, role, password_hash, email, name, nickname FROM user WHERE email = :email LIMIT 1"), {"email": email}).mappings().first()
        else:
            row = conn.execute(text("SELECT user_id, role, password_hash, email, name, nickname FROM user WHERE LOWER(nickname) = LOWER(:n) OR LOWER(name) = LOWER(:n) LIMIT 1"), {"n": nickname}).mappings().first()
        if not row or (row.get("role") or row["role"]) != "student":
            raise HTTPException(status_code=404, detail="Not registered")
        if settings.ALLOW_PASSWORDLESS_STUDENT_LOGIN:
            pass
        else:
            if not password:
                raise HTTPException(status_code=422, detail="Missing password")
            ph = row.get("password_hash") or ""
            if ph:
                try:
                    import bcrypt  # type: ignore
                    if not bcrypt.checkpw(password.encode(), ph.encode()):
                        raise HTTPException(status_code=400, detail="Invalid credentials")
                except HTTPException:
                    raise
                except Exception:
                    if password != ph:
                        raise HTTPException(status_code=400, detail="Invalid credentials")
        user_id = str(row["user_id"])
        user_email = (row.get("email") or email or "")
        user_name = (row.get("name") or row.get("nickname") or nickname or user_email.split("@")[0] if user_email else "Student")
        token = create_access_token(subject=user_id, expires_delta=timedelta(minutes=settings.JWT_EXPIRE_MINUTES), user_data={"email": user_email, "name": user_name, "role": "student"})
        return Token(access_token=token)

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
