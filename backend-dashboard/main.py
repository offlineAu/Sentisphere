from fastapi import FastAPI, Query, HTTPException, Depends, status, UploadFile, Header, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import case, func, select, text
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, date
import os
from pathlib import Path
import json
from collections import Counter
import re
import typing
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import csv
import logging
import asyncio
import time
from fastapi.security import OAuth2PasswordBearer
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger


from app.core.config import settings
from app.db.database import engine, ENGINE_INIT_ERROR_MSG
from app.db.mobile_database import mobile_engine, get_mobile_db
from app.db.session import get_db, SessionLocal
from app.api.routes.auth import router as auth_router
from app.models.alert import Alert, AlertSeverity, AlertStatus
from app.models.counselor_profile import CounselorProfile
from app.models.appointment_log import AppointmentLog
from app.models.checkin_sentiment import CheckinSentiment
from app.models.conversations import Conversation, ConversationStatus
from app.models.emotional_checkin import EmotionalCheckin, EnergyLevel, MoodLevel, StressLevel
from app.models.journal import Journal
from app.models.journal_sentiment import JournalSentiment
from app.models.messages import Message
from app.schemas.alert import Alert as AlertSchema, AlertCreate, AlertUpdate
from app.schemas.checkin import (
    EmotionalCheckin as EmotionalCheckinSchema,
    EmotionalCheckinCreate,
    EmotionalCheckinUpdate,
)
from app.schemas.conversation import (
    Conversation as ConversationSchema,
    ConversationCreate,
    ConversationStart,
    ConversationUpdate,
    Message as MessageSchema,
    MessageCreate,
    MessageSend,
)
from app.schemas.journal import (
    Journal as JournalSchema,
    JournalCreate,
    JournalUpdate,
)
from app.models.notification import Notification
from app.models.user import User, UserRole
from app.models.mobile_user import MobileUser
from app.models.user_activity import UserActivity
from app.services.alert_service import AlertService
from app.services.checkin_service import CheckinService
from app.services.conversation_service import ConversationService
from app.services.journal_service import JournalService
from app.services.jwt import decode_token
from app.services.narrative_insight_service import NarrativeInsightService
from app.services.insight_generation_service import InsightGenerationService
from app.services.insight_data_service import build_sanitized_payload, discover_active_user_ids
from app.services.report_service import ReportService
from app.services.counselor_report_service import CounselorReportService
from app.services.sentiment_service import SentimentService
from app.services.counselor_service import CounselorService
from app.schemas.counselor_profile import CounselorProfilePayload
from app.services.embedding_service import EmbeddingService
from app.schemas.similarity import SimilarJournal
from app.schemas.sentiment import SentimentResult
from app.utils.nlp_loader import analyze_text
from app.utils.date_utils import (
    parse_global_range,
    get_week_range,
    generate_weekly_labels,
    format_range,
)
from app.utils.ws_manager import ConversationWSManager

BASE_DIR = Path(__file__).resolve().parent
EVENTS_FILE = BASE_DIR / "events.json"

app = FastAPI(title=settings.APP_NAME)

logging.basicConfig(level=logging.INFO)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Optional auth router (not enforced on other routes)
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

def _extract_user_id(token: str) -> int:
    try:
        payload = decode_token(token)
        sub = payload.get("sub")
        if not sub:
            raise ValueError("Invalid token payload")
        return int(sub)
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc


# --- Realtime broadcast manager (WebSocket + SSE) ---

WS_HEARTBEAT_SEC = 25
SSE_KEEPALIVE_SEC = 15


class _WSConn:
    def __init__(self, ws: WebSocket, user_id: int) -> None:
        self.ws = ws
        self.user_id = user_id
        self.last_pong = time.time()


class _SSEClient:
    def __init__(self, user_id: int) -> None:
        self.user_id = user_id
        self.queue: "asyncio.Queue[str]" = asyncio.Queue()


class _ConnectionManager:
    def __init__(self) -> None:
        self.ws_conns: set[_WSConn] = set()
        self.sse_clients: set[_SSEClient] = set()
        self.broadcast_queue: "asyncio.Queue[dict[str, typing.Any]]" = asyncio.Queue()
        self._lock = asyncio.Lock()

    async def register_ws(self, conn: _WSConn) -> None:
        async with self._lock:
            self.ws_conns.add(conn)
            logging.info("[realtime] WS connected user=%s total_ws=%d", conn.user_id, len(self.ws_conns))

    async def unregister_ws(self, conn: _WSConn) -> None:
        async with self._lock:
            if conn in self.ws_conns:
                self.ws_conns.remove(conn)
                logging.info("[realtime] WS disconnected user=%s total_ws=%d", conn.user_id, len(self.ws_conns))

    async def register_sse(self, client: _SSEClient) -> None:
        async with self._lock:
            self.sse_clients.add(client)
            logging.info("[realtime] SSE connected user=%s total_sse=%d", client.user_id, len(self.sse_clients))

    async def unregister_sse(self, client: _SSEClient) -> None:
        async with self._lock:
            if client in self.sse_clients:
                self.sse_clients.remove(client)
                logging.info("[realtime] SSE disconnected user=%s total_sse=%d", client.user_id, len(self.sse_clients))

    async def publish(self, event: dict[str, typing.Any]) -> None:
        await self.broadcast_queue.put(event)

    async def _send_ws(self, conn: _WSConn, event: dict[str, typing.Any]) -> None:
        try:
            await conn.ws.send_json(event)
        except Exception as exc:  # pragma: no cover - defensive
            logging.warning("[realtime] WS send failed; dropping conn: %s", exc)
            await self.unregister_ws(conn)

    async def _send_sse(self, client: _SSEClient, event: dict[str, typing.Any]) -> None:
        try:
            data = json.dumps(event, default=str, separators=(",", ":"))
            await client.queue.put(f"data: {data}\n\n")
        except Exception as exc:  # pragma: no cover - defensive
            logging.warning("[realtime] SSE send failed; ignoring client: %s", exc)

    async def broker_loop(self) -> None:
        while True:
            event = await self.broadcast_queue.get()
            # Fan out to WebSocket clients
            for conn in list(self.ws_conns):
                await self._send_ws(conn, event)
            # Fan out to SSE clients
            for client in list(self.sse_clients):
                await self._send_sse(client, event)

    async def heartbeat_loop(self) -> None:
        while True:
            ping = {
                "v": 1,
                "type": "ping",
                "ts": datetime.utcnow().isoformat() + "Z",
            }
            for conn in list(self.ws_conns):
                try:
                    await conn.ws.send_json(ping)
                except Exception:  # pragma: no cover - defensive
                    await self.unregister_ws(conn)
            await asyncio.sleep(WS_HEARTBEAT_SEC)


_rt_manager = _ConnectionManager()

ws_conv_manager = ConversationWSManager()


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    user_id = _extract_user_id(token)
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive or missing")
    return user


# --- Internal Scheduler (APScheduler) ---
scheduler: Optional[BackgroundScheduler] = None

def _last_completed_week_window() -> tuple[datetime, datetime]:
    today = datetime.now().date()
    monday_this_week = today - timedelta(days=today.weekday())  # Monday
    last_monday = monday_this_week - timedelta(days=7)
    start_dt = datetime.combine(last_monday, datetime.min.time())
    end_dt = datetime.combine(last_monday + timedelta(days=6), datetime.max.time())
    return start_dt, end_dt

def _last_7_full_days_window() -> tuple[datetime, datetime]:
    today_start = datetime.combine(datetime.now().date(), datetime.min.time())
    end_dt = today_start - timedelta(seconds=1)  # yesterday 23:59:59
    start_dt = today_start - timedelta(days=7)   # 7 days ago 00:00:00
    return start_dt, end_dt

def _run_weekly_insights_job():
    try:
        if not settings.INSIGHTS_FEATURE_ENABLED:
            return
        start_dt, end_dt = _last_completed_week_window()
        user_ids = discover_active_user_ids(start_dt, end_dt)
        # Include platform-level insight (user_id=None)
        targets: List[Optional[int]] = [None] + user_ids
        db = SessionLocal()
        try:
            for uid in targets:
                payload = build_sanitized_payload(uid, start_dt, end_dt)
                InsightGenerationService.compute_and_store(
                    db=db,
                    user_id=uid,
                    timeframe_start=start_dt.date(),
                    timeframe_end=end_dt.date(),
                    payload=payload,
                    insight_type="weekly",
                )
            logging.info("[scheduler] weekly insights generated for %d targets (%s to %s)", len(targets), start_dt, end_dt)
        finally:
            db.close()
    except Exception as exc:  # pragma: no cover
        logging.exception("[scheduler] weekly job failed: %s", exc)

def _run_daily_behavioral_job():
    try:
        if not settings.INSIGHTS_FEATURE_ENABLED:
            return
        start_dt, end_dt = _last_7_full_days_window()
        user_ids = discover_active_user_ids(start_dt, end_dt)
        targets: List[Optional[int]] = [None] + user_ids
        db = SessionLocal()
        try:
            for uid in targets:
                payload = build_sanitized_payload(uid, start_dt, end_dt)
                InsightGenerationService.compute_and_store(
                    db=db,
                    user_id=uid,
                    timeframe_start=start_dt.date(),
                    timeframe_end=end_dt.date(),
                    payload=payload,
                    insight_type="behavioral",
                )
            logging.info("[scheduler] behavioral insights generated for %d targets (%s to %s)", len(targets), start_dt, end_dt)
        finally:
            db.close()
    except Exception as exc:  # pragma: no cover
        logging.exception("[scheduler] behavioral job failed: %s", exc)

@app.on_event("startup")
def _start_scheduler():
    global scheduler
    if not settings.INSIGHTS_FEATURE_ENABLED:
        logging.info("[scheduler] insights disabled; scheduler not started")
        return
    try:
        scheduler = BackgroundScheduler()
        # Weekly: Monday 00:05
        scheduler.add_job(_run_weekly_insights_job, CronTrigger(day_of_week='mon', hour=0, minute=5))
        # Daily: 23:59
        scheduler.add_job(_run_daily_behavioral_job, CronTrigger(hour=23, minute=59))
        scheduler.start()
        logging.info("[scheduler] started (weekly Mon 00:05, daily 23:59)")
    except Exception as exc:  # pragma: no cover
        logging.exception("[scheduler] failed to start: %s", exc)

@app.on_event("shutdown")
def _stop_scheduler():
    global scheduler
    if scheduler:
        try:
            scheduler.shutdown(wait=False)
            logging.info("[scheduler] stopped")
        except Exception:
            pass


@app.on_event("startup")
async def _start_realtime_loops() -> None:
    """Launch background tasks for realtime broadcasting and heartbeats."""
    asyncio.create_task(_rt_manager.broker_loop())
    asyncio.create_task(_rt_manager.heartbeat_loop())
def require_counselor(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.counselor:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Counselor access required")
    return current_user


def require_student(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.student:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student access required")
    return current_user


# --- Mobile ingestion: Emotional check-ins ---


@app.get("/api/checkins", response_model=List[EmotionalCheckinSchema])
def list_my_checkins(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    return CheckinService.list_checkins(db, user_id=current_user.user_id, skip=skip, limit=limit)


@app.post("/api/checkins", response_model=EmotionalCheckinSchema, status_code=status.HTTP_201_CREATED)
def create_checkin(
    checkin_in: EmotionalCheckinCreate,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    payload = checkin_in
    if checkin_in.user_id is None or checkin_in.user_id != current_user.user_id:
        payload = EmotionalCheckinCreate(
            **checkin_in.model_dump(exclude_unset=True),
            user_id=current_user.user_id,
        )
    created = CheckinService.create_checkin(db, payload)
    return created


@app.get("/api/checkins/{checkin_id}", response_model=EmotionalCheckinSchema)
def get_checkin(
    checkin_id: int,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    checkin = CheckinService.get_checkin(db, checkin_id)
    if not checkin or checkin.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Check-in not found")
    return checkin


@app.patch("/api/checkins/{checkin_id}", response_model=EmotionalCheckinSchema)
def update_checkin(
    checkin_id: int,
    checkin_in: EmotionalCheckinUpdate,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    checkin = CheckinService.get_checkin(db, checkin_id)
    if not checkin or checkin.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Check-in not found")
    updated = CheckinService.update_checkin(db, checkin, checkin_in)
    return updated


@app.delete("/api/checkins/{checkin_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_checkin(
    checkin_id: int,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    checkin = CheckinService.get_checkin(db, checkin_id)
    if not checkin or checkin.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Check-in not found")
    CheckinService.delete_checkin(db, checkin)
    return None


# --- Mobile ingestion: Journals ---


@app.get("/api/journals-service", response_model=List[JournalSchema])
def list_my_journals(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    return JournalService.list_journals(db, user_id=current_user.user_id, skip=skip, limit=limit)


@app.post("/api/journals-service", response_model=JournalSchema, status_code=status.HTTP_201_CREATED)
def create_journal(
    journal_in: JournalCreate,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    payload = journal_in
    if journal_in.user_id is None or journal_in.user_id != current_user.user_id:
        payload = JournalCreate(
            **journal_in.model_dump(exclude_unset=True),
            user_id=current_user.user_id,
        )
    created = JournalService.create_journal(db, payload)

    # Publish a realtime journal.created event for connected dashboards
    try:
        journal_data = JournalSchema.model_validate(created).model_dump()
        event = {
            "v": 1,
            "type": "journal.created",
            "id": f"evt_journal_{journal_data.get('journal_id')}",
            "ts": (journal_data.get("created_at") or datetime.utcnow().isoformat() + "Z"),
            "user_id": journal_data.get("user_id"),
            "payload": {"journal": journal_data},
        }
        # Fire-and-forget to avoid blocking the request path
        asyncio.create_task(_rt_manager.publish(event))
    except Exception as exc:  # pragma: no cover - defensive
        logging.warning("[realtime] failed to publish journal event: %s", exc)

    return created


@app.get("/api/journals-service/{journal_id}", response_model=JournalSchema)
def get_journal(
    journal_id: int,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    journal = JournalService.get_journal(db, journal_id)
    if not journal or journal.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journal not found")
    return journal


@app.patch("/api/journals-service/{journal_id}", response_model=JournalSchema)
def update_journal(
    journal_id: int,
    journal_in: JournalUpdate,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    journal = JournalService.get_journal(db, journal_id)
    if not journal or journal.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journal not found")
    updated = JournalService.update_journal(db, journal, journal_in)
    return updated


@app.delete("/api/journals-service/{journal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_journal(
    journal_id: int,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    journal = JournalService.get_journal(db, journal_id)
    if not journal or journal.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journal not found")
    JournalService.delete_journal(db, journal)
    return None


# --- Debug: direct sentiment probe (development only) ---


class SentimentProbeIn(BaseModel):
    text: str


@app.post("/api/debug/sentiment", response_model=SentimentResult)
def debug_sentiment_probe(payload: SentimentProbeIn):
    if settings.ENV.lower() == "production":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not available in production")
    out = analyze_text(payload.text or "")
    return SentimentResult(
        sentiment=out.sentiment,
        emotions=out.emotions,
        confidence=out.confidence,
        model_version=out.model_version,
    )


# --- Journals: Similarity ---


@app.get("/api/journals-service/{journal_id}/similar", response_model=List[SimilarJournal])
def similar_journals_service(
    journal_id: int,
    top_k: int = Query(5, ge=1, le=20),
    same_user_only: bool = Query(False),
    _current_user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    results = EmbeddingService.similar_journals(
        db,
        journal_id=journal_id,
        top_k=top_k,
        same_user_only=same_user_only,
    )
    return results


# Alias path without the -service suffix (kept for flexibility)
@app.get("/api/journals/{journal_id}/similar", response_model=List[SimilarJournal])
def similar_journals_alias(
    journal_id: int,
    top_k: int = Query(5, ge=1, le=20),
    same_user_only: bool = Query(False),
    _current_user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    results = EmbeddingService.similar_journals(
        db,
        journal_id=journal_id,
        top_k=top_k,
        same_user_only=same_user_only,
    )
    return results


# --- Mobile ingestion: Alerts ---


@app.post("/alerts", response_model=AlertSchema, status_code=status.HTTP_201_CREATED)
def create_alert(
    alert_in: AlertCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payload_data = alert_in.model_dump(exclude_unset=True)
    if current_user.role == UserRole.student:
        if alert_in.user_id and alert_in.user_id != current_user.user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot report for another user")
        payload_data["user_id"] = current_user.user_id
    alert = AlertService.create_alert(db, AlertCreate(**payload_data))
    return alert


# Alias for frontend base URL that includes /api
@app.post("/api/alerts", response_model=AlertSchema, status_code=status.HTTP_201_CREATED)
def create_alert_api(
    alert_in: AlertCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payload_data = alert_in.model_dump(exclude_unset=True)
    if current_user.role == UserRole.student:
        if alert_in.user_id and alert_in.user_id != current_user.user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot report for another user")
        payload_data["user_id"] = current_user.user_id
    alert = AlertService.create_alert(db, AlertCreate(**payload_data))
    return alert


@app.websocket("/api/ws/journals")
async def journals_ws(websocket: WebSocket, token: Optional[str] = None) -> None:
    """Authenticated WebSocket stream for journal events.

    The client should pass a valid access token via `?token=...` query parameter.
    The token is validated using the existing JWT helper, and only a minimal
    ping/pong protocol is supported from the client side.
    """
    raw_token = token
    if not raw_token:
        # Fallback: try to read token from Sec-WebSocket-Protocol if needed later
        await websocket.close(code=4401)
        return
    try:
        user_id = _extract_user_id(raw_token)
    except HTTPException:
        await websocket.close(code=4401)
        return

    await websocket.accept()
    conn = _WSConn(websocket, user_id)
    await _rt_manager.register_ws(conn)

    try:
        while True:
            msg = await websocket.receive_text()
            try:
                data = json.loads(msg)
            except Exception:
                continue
            if data.get("type") == "pong":
                conn.last_pong = time.time()
    except WebSocketDisconnect:
        pass
    finally:
        await _rt_manager.unregister_ws(conn)


@app.get("/api/events/journals")
async def journals_sse(request: Request, token: str) -> StreamingResponse:
    """SSE fallback endpoint for journal events.

    The client passes a `token` query parameter with a valid JWT.
    """
    user_id = _extract_user_id(token)
    client = _SSEClient(user_id)
    await _rt_manager.register_sse(client)

    async def event_stream() -> typing.AsyncGenerator[bytes, None]:
        try:
            last_keepalive = time.time()
            while True:
                if await request.is_disconnected():
                    break
                # Periodic keep-alive comment to avoid idle timeouts
                now = time.time()
                if now - last_keepalive > SSE_KEEPALIVE_SEC:
                    yield b":keep-alive\n\n"
                    last_keepalive = now
                try:
                    chunk = await asyncio.wait_for(client.queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue
                yield chunk.encode("utf-8")
        finally:
            await _rt_manager.unregister_sse(client)

    headers = {
        "Cache-Control": "no-cache, no-transform",
        "Content-Type": "text/event-stream",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_stream(), headers=headers)

@app.websocket("/ws/conversations")
async def conversations_ws(websocket: WebSocket, token: Optional[str] = None) -> None:
    raw_token = token
    if not raw_token:
        await websocket.close(code=4401)
        return
    try:
        _ = _extract_user_id(raw_token)
    except HTTPException:
        await websocket.close(code=4401)
        return
    await ws_conv_manager.connect(websocket)
    try:
        while True:
            msg = await websocket.receive_text()
            try:
                data = json.loads(msg)
            except Exception:
                continue
            action = data.get("action")
            if action == "subscribe":
                try:
                    cid = int(data.get("conversation_id") or 0)
                    if cid:
                        await ws_conv_manager.subscribe(websocket, cid)
                except Exception:
                    continue
            elif action == "unsubscribe":
                try:
                    cid = int(data.get("conversation_id") or 0)
                    if cid:
                        await ws_conv_manager.unsubscribe(websocket, cid)
                except Exception:
                    continue
            elif action == "ping":
                await websocket.send_json({"type": "pong", "ts": datetime.utcnow().isoformat() + "Z"})
    except WebSocketDisconnect:
        pass
    finally:
        await ws_conv_manager.disconnect(websocket)

@app.get("/api/auth/me")
def auth_me(token: str = Depends(oauth2_scheme)):
    """Return the current authenticated user id from JWT (subject)."""
    try:
        payload = decode_token(token)
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return {"user_id": int(sub)}
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

@app.get("/api/counselors")
def list_counselors(
    token: str = Depends(oauth2_scheme),
    mdb: Session = Depends(get_mobile_db),
):
    """Return active counselors for selection, using the mobile DB only.

    We only validate the JWT signature/payload and do NOT look up the current
    user in the main DB, to avoid coupling to the web DB engine.
    """
    # Validate token (no main-DB user fetch)
    try:
        decode_token(token)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    # Read counselors from mobile DB
    rows = (
        mdb.execute(
            select(MobileUser).where(
                func.lower(MobileUser.role) == "counselor",
                MobileUser.is_active.is_(True),
            )
        )
        .scalars()
        .all()
    )
    return [
        {
            "user_id": u.user_id,
            "name": u.name,
            "nickname": u.nickname,
            "email": u.email,
        }
        for u in rows
    ]

# --- Mobile-only Conversations API (uses mobile DB, no main DB lookup) ---

@app.get("/api/mobile/counselors")
def mobile_list_counselors(
    token: str = Depends(oauth2_scheme),
    mdb: Session = Depends(get_mobile_db),
):
    """List all active counselors from mobile DB for student to select when starting a conversation."""
    _extract_user_id(token)  # Validate token
    rows = list(
        mdb.execute(
            text(
                """
                SELECT user_id, name, nickname, email
                FROM user
                WHERE role = 'counselor' AND is_active = 1
                ORDER BY name ASC
                """
            )
        ).mappings()
    )
    result = [dict(row) for row in rows]
    print(f"[mobile_list_counselors] Found {len(result)} counselors: {result}")
    return result


@app.get("/api/mobile/conversations")
def mobile_list_conversations(
    include_messages: bool = Query(False),
    token: str = Depends(oauth2_scheme),
    mdb: Session = Depends(get_mobile_db),
):
    uid = _extract_user_id(token)
    conv_rows = list(
        mdb.execute(
            text(
                """
                SELECT c.conversation_id, c.initiator_user_id, c.initiator_role,
                       c.subject, c.counselor_id, c.status, c.created_at, c.last_activity_at,
                       u.name AS counselor_name, u.email AS counselor_email
                FROM conversations c
                LEFT JOIN user u ON c.counselor_id = u.user_id
                WHERE c.initiator_user_id = :uid
                ORDER BY COALESCE(c.last_activity_at, c.created_at) DESC
                """
            ),
            {"uid": uid},
        ).mappings()
    )
    conversations = [dict(row) for row in conv_rows]
    if include_messages and conversations:
        for c in conversations:
            msgs = list(
                mdb.execute(
                    text(
                        """
                        SELECT message_id, conversation_id, sender_id, content, is_read, timestamp
                        FROM messages
                        WHERE conversation_id = :cid
                        ORDER BY timestamp ASC
                        """
                    ),
                    {"cid": c["conversation_id"]},
                ).mappings()
            )
            c["messages"] = [dict(m) for m in msgs]
    return conversations


@app.post("/api/mobile/conversations", status_code=status.HTTP_201_CREATED)
async def mobile_start_conversation(
    request: Request,
    token: str = Depends(oauth2_scheme),
    mdb: Session = Depends(get_mobile_db),
):
    uid = _extract_user_id(token)
    
    # Parse raw JSON body to ensure counselor_id is captured
    body = await request.json()
    print(f"[mobile_start_conversation] Raw JSON body: {body}")
    
    subject = body.get("subject")
    counselor_id = body.get("counselor_id")
    
    print(f"[mobile_start_conversation] Parsed values: subject={subject}, counselor_id={counselor_id}, type={type(counselor_id)}")
    print(f"[mobile_start_conversation] Creating conversation: uid={uid}, subject={subject}, counselor_id={counselor_id}")
    
    res = mdb.execute(
        text(
            """
            INSERT INTO conversations (initiator_user_id, initiator_role, subject, counselor_id, status, created_at, last_activity_at)
            VALUES (:uid, 'student', :subject, :counselor_id, 'open', NOW(), NOW())
            """
        ),
        {"uid": uid, "subject": subject, "counselor_id": counselor_id},
    )
    mdb.commit()
    cid = res.lastrowid
    print(f"[mobile_start_conversation] Inserted conversation_id={cid}")
    
    convo = mdb.execute(
        text(
            """
            SELECT c.conversation_id, c.initiator_user_id, c.initiator_role, c.subject, c.counselor_id,
                   c.status, c.created_at, c.last_activity_at,
                   u.name AS counselor_name, u.email AS counselor_email
            FROM conversations c
            LEFT JOIN user u ON c.counselor_id = u.user_id
            WHERE c.conversation_id = :cid LIMIT 1
            """
        ),
        {"cid": cid},
    ).mappings().first()
    
    result = dict(convo) if convo else {"conversation_id": cid, "initiator_user_id": uid, "initiator_role": "student", "subject": subject, "counselor_id": counselor_id, "status": "open"}
    print(f"[mobile_start_conversation] Returning: {result}")
    return result


@app.get("/api/mobile/conversations/{conversation_id}")
def mobile_get_conversation(
    conversation_id: int,
    include_messages: bool = Query(False),
    token: str = Depends(oauth2_scheme),
    mdb: Session = Depends(get_mobile_db),
):
    uid = _extract_user_id(token)
    convo = mdb.execute(
        text(
            """
            SELECT c.conversation_id, c.initiator_user_id, c.initiator_role, c.subject, c.counselor_id,
                   c.status, c.created_at, c.last_activity_at,
                   u.name AS counselor_name, u.email AS counselor_email
            FROM conversations c
            LEFT JOIN user u ON c.counselor_id = u.user_id
            WHERE c.conversation_id = :cid LIMIT 1
            """
        ),
        {"cid": conversation_id},
    ).mappings().first()
    if not convo or int(convo["initiator_user_id"]) != int(uid):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    data = dict(convo)
    if include_messages:
        msgs = list(
            mdb.execute(
                text(
                    """
                    SELECT message_id, conversation_id, sender_id, content, is_read, timestamp
                    FROM messages WHERE conversation_id = :cid ORDER BY timestamp ASC
                    """
                ),
                {"cid": conversation_id},
            ).mappings()
        )
        data["messages"] = [dict(m) for m in msgs]
    return data


@app.get("/api/mobile/conversations/{conversation_id}/messages")
def mobile_list_messages(
    conversation_id: int,
    token: str = Depends(oauth2_scheme),
    mdb: Session = Depends(get_mobile_db),
):
    uid = _extract_user_id(token)
    owner = mdb.execute(
        text("SELECT initiator_user_id FROM conversations WHERE conversation_id = :cid"),
        {"cid": conversation_id},
    ).mappings().first()
    if not owner or int(owner["initiator_user_id"]) != int(uid):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    msgs = list(
        mdb.execute(
            text(
                """
                SELECT message_id, conversation_id, sender_id, content, is_read, timestamp
                FROM messages WHERE conversation_id = :cid ORDER BY timestamp ASC
                """
            ),
            {"cid": conversation_id},
        ).mappings()
    )
    return [dict(m) for m in msgs]


@app.post("/api/mobile/conversations/{conversation_id}/messages", status_code=status.HTTP_201_CREATED)
async def mobile_send_message(
    conversation_id: int,
    message_in: MessageSend,
    token: str = Depends(oauth2_scheme),
    mdb: Session = Depends(get_mobile_db),
):
    uid = _extract_user_id(token)
    owner = mdb.execute(
        text("SELECT initiator_user_id FROM conversations WHERE conversation_id = :cid"),
        {"cid": conversation_id},
    ).mappings().first()
    if not owner or int(owner["initiator_user_id"]) != int(uid):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    res = mdb.execute(
        text(
            """
            INSERT INTO messages (conversation_id, sender_id, content, is_read, timestamp)
            VALUES (:cid, :sid, :content, :is_read, NOW())
            """
        ),
        {"cid": conversation_id, "sid": uid, "content": message_in.content, "is_read": bool(message_in.is_read)},
    )
    mdb.execute(text("UPDATE conversations SET last_activity_at = NOW() WHERE conversation_id = :cid"), {"cid": conversation_id})
    mdb.commit()
    mid = res.lastrowid
    row = mdb.execute(
        text(
            """
            SELECT message_id, conversation_id, sender_id, content, is_read, timestamp
            FROM messages WHERE message_id = :mid
            """
        ),
        {"mid": mid},
    ).mappings().first()
    payload = dict(row) if row else {
        "message_id": mid,
        "conversation_id": conversation_id,
        "sender_id": uid,
        "content": message_in.content,
        "is_read": bool(message_in.is_read),
        "timestamp": datetime.utcnow(),
    }
    # Broadcast to web dashboard subscribers for this conversation
    try:
        await ws_conv_manager.broadcast_message_created(conversation_id, payload)
    except Exception:
        pass
    return payload


@app.post("/api/mobile/conversations/{conversation_id}/read")
def mobile_mark_read(
    conversation_id: int,
    token: str = Depends(oauth2_scheme),
    mdb: Session = Depends(get_mobile_db),
):
    uid = _extract_user_id(token)
    owner = mdb.execute(
        text("SELECT initiator_user_id FROM conversations WHERE conversation_id = :cid"),
        {"cid": conversation_id},
    ).mappings().first()
    if not owner or int(owner["initiator_user_id"]) != int(uid):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    res = mdb.execute(
        text("UPDATE messages SET is_read = 1 WHERE conversation_id = :cid AND sender_id <> :uid"),
        {"cid": conversation_id, "uid": uid},
    )
    mdb.commit()
    return {"updated": res.rowcount or 0}


@app.patch("/api/mobile/conversations/{conversation_id}")
def mobile_update_conversation(
    conversation_id: int,
    conversation_in: ConversationUpdate,
    token: str = Depends(oauth2_scheme),
    mdb: Session = Depends(get_mobile_db),
):
    uid = _extract_user_id(token)
    owner = mdb.execute(
        text("SELECT initiator_user_id FROM conversations WHERE conversation_id = :cid"),
        {"cid": conversation_id},
    ).mappings().first()
    if not owner or int(owner["initiator_user_id"]) != int(uid):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    if conversation_in.last_activity_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="last_activity_at cannot be updated")
    updates = {}
    if conversation_in.status is not None:
        updates["status"] = conversation_in.status.value if hasattr(conversation_in.status, "value") else conversation_in.status
    if updates:
        set_clause = ", ".join(f"{k} = :{k}" for k in updates.keys())
        mdb.execute(text(f"UPDATE conversations SET {set_clause} WHERE conversation_id = :cid"), {**updates, "cid": conversation_id})
        mdb.commit()
    convo = mdb.execute(
        text("SELECT conversation_id, initiator_user_id, initiator_role, subject, counselor_id, status, created_at, last_activity_at FROM conversations WHERE conversation_id = :cid"),
        {"cid": conversation_id},
    ).mappings().first()
    return dict(convo) if convo else {"conversation_id": conversation_id, **updates}


# --- Counselor Conversation Endpoints (for web dashboard, uses mobile DB) ---

@app.get("/api/counselor/conversations")
def counselor_list_conversations(
    include_messages: bool = Query(False),
    current_user: User = Depends(require_counselor),
    mdb: Session = Depends(get_mobile_db),
):
    """List all conversations assigned to the current counselor."""
    counselor_id = current_user.user_id
    conv_rows = list(
        mdb.execute(
            text(
                """
                SELECT c.conversation_id, c.initiator_user_id, c.initiator_role,
                       c.subject, c.counselor_id, c.status, c.created_at, c.last_activity_at,
                       u.name AS student_name, u.email AS student_email, u.nickname AS student_nickname
                FROM conversations c
                LEFT JOIN user u ON c.initiator_user_id = u.user_id
                WHERE c.counselor_id = :counselor_id
                ORDER BY COALESCE(c.last_activity_at, c.created_at) DESC
                """
            ),
            {"counselor_id": counselor_id},
        ).mappings()
    )
    conversations = [dict(row) for row in conv_rows]
    if include_messages and conversations:
        for c in conversations:
            msgs = list(
                mdb.execute(
                    text(
                        """
                        SELECT message_id, conversation_id, sender_id, content, is_read, timestamp
                        FROM messages
                        WHERE conversation_id = :cid
                        ORDER BY timestamp ASC
                        """
                    ),
                    {"cid": c["conversation_id"]},
                ).mappings()
            )
            c["messages"] = [dict(m) for m in msgs]
    return conversations


@app.get("/api/counselor/conversations/{conversation_id}")
def counselor_get_conversation(
    conversation_id: int,
    include_messages: bool = Query(True),
    current_user: User = Depends(require_counselor),
    mdb: Session = Depends(get_mobile_db),
):
    """Get a specific conversation assigned to the current counselor."""
    counselor_id = current_user.user_id
    convo = mdb.execute(
        text(
            """
            SELECT c.conversation_id, c.initiator_user_id, c.initiator_role, c.subject, c.counselor_id,
                   c.status, c.created_at, c.last_activity_at,
                   u.name AS student_name, u.email AS student_email, u.nickname AS student_nickname
            FROM conversations c
            LEFT JOIN user u ON c.initiator_user_id = u.user_id
            WHERE c.conversation_id = :cid AND c.counselor_id = :counselor_id
            LIMIT 1
            """
        ),
        {"cid": conversation_id, "counselor_id": counselor_id},
    ).mappings().first()
    if not convo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found or not assigned to you")
    data = dict(convo)
    if include_messages:
        msgs = list(
            mdb.execute(
                text(
                    """
                    SELECT message_id, conversation_id, sender_id, content, is_read, timestamp
                    FROM messages WHERE conversation_id = :cid ORDER BY timestamp ASC
                    """
                ),
                {"cid": conversation_id},
            ).mappings()
        )
        data["messages"] = [dict(m) for m in msgs]
    return data


@app.get("/api/counselor/conversations/{conversation_id}/messages")
def counselor_list_messages(
    conversation_id: int,
    current_user: User = Depends(require_counselor),
    mdb: Session = Depends(get_mobile_db),
):
    """List messages for a conversation assigned to the current counselor."""
    counselor_id = current_user.user_id
    owner = mdb.execute(
        text("SELECT counselor_id FROM conversations WHERE conversation_id = :cid"),
        {"cid": conversation_id},
    ).mappings().first()
    if not owner or owner["counselor_id"] != counselor_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found or not assigned to you")
    msgs = list(
        mdb.execute(
            text(
                """
                SELECT message_id, conversation_id, sender_id, content, is_read, timestamp
                FROM messages WHERE conversation_id = :cid ORDER BY timestamp ASC
                """
            ),
            {"cid": conversation_id},
        ).mappings()
    )
    return [dict(m) for m in msgs]


@app.post("/api/counselor/conversations/{conversation_id}/messages", status_code=status.HTTP_201_CREATED)
def counselor_send_message(
    conversation_id: int,
    message_in: MessageSend,
    current_user: User = Depends(require_counselor),
    mdb: Session = Depends(get_mobile_db),
):
    """Send a message as a counselor to a conversation assigned to them."""
    counselor_id = current_user.user_id
    owner = mdb.execute(
        text("SELECT counselor_id FROM conversations WHERE conversation_id = :cid"),
        {"cid": conversation_id},
    ).mappings().first()
    if not owner or owner["counselor_id"] != counselor_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found or not assigned to you")
    res = mdb.execute(
        text(
            """
            INSERT INTO messages (conversation_id, sender_id, content, is_read, timestamp)
            VALUES (:cid, :sid, :content, :is_read, NOW())
            """
        ),
        {"cid": conversation_id, "sid": counselor_id, "content": message_in.content, "is_read": False},
    )
    mdb.execute(text("UPDATE conversations SET last_activity_at = NOW() WHERE conversation_id = :cid"), {"cid": conversation_id})
    mdb.commit()
    mid = res.lastrowid
    row = mdb.execute(
        text(
            """
            SELECT message_id, conversation_id, sender_id, content, is_read, timestamp
            FROM messages WHERE message_id = :mid
            """
        ),
        {"mid": mid},
    ).mappings().first()
    return dict(row) if row else {"message_id": mid, "conversation_id": conversation_id, "sender_id": counselor_id, "content": message_in.content, "is_read": False}


@app.post("/api/counselor/conversations/{conversation_id}/read")
def counselor_mark_read(
    conversation_id: int,
    current_user: User = Depends(require_counselor),
    mdb: Session = Depends(get_mobile_db),
):
    """Mark all messages from student as read for a counselor."""
    counselor_id = current_user.user_id
    owner = mdb.execute(
        text("SELECT counselor_id FROM conversations WHERE conversation_id = :cid"),
        {"cid": conversation_id},
    ).mappings().first()
    if not owner or owner["counselor_id"] != counselor_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found or not assigned to you")
    res = mdb.execute(
        text("UPDATE messages SET is_read = 1 WHERE conversation_id = :cid AND sender_id <> :counselor_id"),
        {"cid": conversation_id, "counselor_id": counselor_id},
    )
    mdb.commit()
    return {"updated": res.rowcount or 0}


@app.patch("/api/counselor/conversations/{conversation_id}")
def counselor_update_conversation(
    conversation_id: int,
    conversation_in: ConversationUpdate,
    current_user: User = Depends(require_counselor),
    mdb: Session = Depends(get_mobile_db),
):
    """Update a conversation (e.g., close it) as a counselor."""
    counselor_id = current_user.user_id
    owner = mdb.execute(
        text("SELECT counselor_id FROM conversations WHERE conversation_id = :cid"),
        {"cid": conversation_id},
    ).mappings().first()
    if not owner or owner["counselor_id"] != counselor_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found or not assigned to you")
    updates = {}
    if conversation_in.status is not None:
        updates["status"] = conversation_in.status.value if hasattr(conversation_in.status, "value") else conversation_in.status
    if updates:
        set_clause = ", ".join(f"{k} = :{k}" for k in updates.keys())
        mdb.execute(text(f"UPDATE conversations SET {set_clause} WHERE conversation_id = :cid"), {**updates, "cid": conversation_id})
        mdb.commit()
    convo = mdb.execute(
        text("SELECT conversation_id, initiator_user_id, initiator_role, subject, counselor_id, status, created_at, last_activity_at FROM conversations WHERE conversation_id = :cid"),
        {"cid": conversation_id},
    ).mappings().first()
    return dict(convo) if convo else {"conversation_id": conversation_id, **updates}


@app.get("/api/mood-trend")
def mood_trend(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    query = text(
        """
        SELECT
            YEAR(created_at) AS year,
            MONTH(created_at) AS month_num,
            MONTHNAME(created_at) AS month_name,
            WEEK(created_at, 3) - WEEK(DATE_SUB(created_at, INTERVAL DAYOFMONTH(created_at)-1 DAY), 3) + 1 AS week_in_month,
            ROUND(AVG(
                CASE mood_level
                    WHEN 'Very Sad' THEN 1
                    WHEN 'Sad' THEN 2
                    WHEN 'Neutral' THEN 3
                    WHEN 'Good' THEN 4
                    WHEN 'Happy' THEN 5
                    WHEN 'Very Happy' THEN 6
                    WHEN 'Excellent' THEN 7
                    ELSE NULL
                END
            ), 2) AS avgMood
        FROM emotional_checkin
        GROUP BY year, month_num, month_name, week_in_month
        ORDER BY year, month_num, week_in_month
        """
    )
    rows = db.execute(query).mappings()
    return [
        {
            "week": f"{row['year']}-{row['month_name']}-Week{row['week_in_month']}",
            "avgMood": float(row["avgMood"] or 0),
        }
        for row in rows
    ]


@app.get("/api/alerts")
@app.get("/alerts")
@app.get("/api/alerts")
def list_alerts(
    limit: int = Query(100, ge=1, le=1000),
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    alerts = CounselorReportService.list_alerts(db, limit=limit)
    return [
        {
            "severity": item["severity"],
            "created_at": item["created_at"].isoformat() if item["created_at"] else None,
        }
        for item in alerts
    ]


@app.get("/api/recent-alerts")
def recent_alerts(
    limit: int = Query(10, ge=1, le=100),
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    alerts = CounselorReportService.recent_alerts(db, limit=limit)
    return [
        {
            "id": item["id"],
            "name": item["name"],
            "severity": item["severity"],
            "status": item["status"],
            "created_at": item["created_at"].isoformat() if item["created_at"] else None,
        }
        for item in alerts
    ]


@app.get("/api/all-alerts")
def all_alerts(
    limit: int = Query(1000, ge=1, le=2000),
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    alerts = CounselorReportService.list_alerts(db, limit=limit)
    return [
        {
            "severity": item["severity"],
            "created_at": item["created_at"].isoformat() if item["created_at"] else None,
        }
        for item in alerts
    ]


@app.get("/api/students-monitored")
def students_monitored(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    count = db.scalar(
        select(func.count(func.distinct(EmotionalCheckin.user_id))).join(User, EmotionalCheckin.user_id == User.user_id)
        .where(User.role == UserRole.student, User.is_active.is_(True))
    ) or 0
    return {"count": int(count)}


@app.get("/api/this-week-checkins")
def this_week_checkins(
    range: str = Query("this_week"),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    start_dt, end_dt = parse_global_range(range, start, end)
    count = db.scalar(
        select(func.count(EmotionalCheckin.checkin_id)).where(
            EmotionalCheckin.created_at >= start_dt, EmotionalCheckin.created_at <= end_dt
        )
    ) or 0
    return {"count": int(count)}


@app.get("/api/open-appointments")
def open_appointments(
    range: str = Query("this_week"),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    start_dt, end_dt = parse_global_range(range, start, end)
    count = db.scalar(
        select(func.count(func.distinct(UserActivity.user_id))).where(
            UserActivity.action == "downloaded_form",
            UserActivity.target_type == "form",
            UserActivity.created_at >= start_dt,
            UserActivity.created_at <= end_dt,
        )
    ) or 0
    return {"count": int(count)}


@app.get("/api/high-risk-flags")
def high_risk_flags(
    range: str = Query("this_week"),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    start_dt, end_dt = parse_global_range(range, start, end)
    alert_count = db.scalar(
        select(func.count(Alert.alert_id)).where(
            Alert.severity.in_([AlertSeverity.HIGH, AlertSeverity.CRITICAL]),
            Alert.status.in_([AlertStatus.OPEN, AlertStatus.IN_PROGRESS]),
            Alert.created_at >= start_dt,
            Alert.created_at <= end_dt,
        )
    ) or 0
    journal_count = db.scalar(
        select(func.count(JournalSentiment.journal_id)).where(
            JournalSentiment.sentiment == "negative",
            JournalSentiment.analyzed_at >= start_dt,
            JournalSentiment.analyzed_at <= end_dt,
        )
    ) or 0
    checkin_count = db.scalar(
        select(func.count(CheckinSentiment.checkin_id)).where(
            CheckinSentiment.sentiment == "negative",
            CheckinSentiment.analyzed_at >= start_dt,
            CheckinSentiment.analyzed_at <= end_dt,
        )
    ) or 0
    return {"count": int(alert_count + journal_count + checkin_count)}


@app.get("/api/sentiments")
def sentiment_breakdown(
    period: str = Query("month", enum=["week", "month", "year"]),
    range: Optional[str] = Query(None),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    params: Dict[str, Any] = {}
    if range or start or end:
        start_dt, end_dt = parse_global_range(range or "this_week", start, end)
        condition = "analyzed_at BETWEEN :start AND :end"
        params = {"start": start_dt, "end": end_dt}
    else:
        if period == "week":
            condition = "YEARWEEK(analyzed_at, 1) = YEARWEEK(CURDATE(), 1)"
        elif period == "month":
            condition = "YEAR(analyzed_at) = YEAR(CURDATE()) AND MONTH(analyzed_at) = MONTH(CURDATE())"
        elif period == "year":
            condition = "YEAR(analyzed_at) = YEAR(CURDATE())"
        else:
            condition = "TRUE"

    query = text(
        f"""
        SELECT sentiment, COUNT(*) AS value FROM (
            SELECT sentiment, analyzed_at FROM checkin_sentiment
            UNION ALL
            SELECT sentiment, analyzed_at FROM journal_sentiment
        ) AS combined
        WHERE {condition}
        GROUP BY sentiment
        """
    )
    rows = db.execute(query, params).mappings()
    return [{"name": row["sentiment"], "value": row["value"]} for row in rows]


@app.get("/api/checkin-breakdown")
def checkin_breakdown(
    period: str = Query("month", enum=["week", "month", "year"]),
    range: Optional[str] = Query(None),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    params: Dict[str, Any] = {}
    if range or start or end:
        start_dt, end_dt = parse_global_range(range or "this_week", start, end)
        condition = "created_at BETWEEN :start AND :end"
        params = {"start": start_dt, "end": end_dt}
    else:
        if period == "week":
            condition = "YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)"
        elif period == "month":
            condition = "YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())"
        elif period == "year":
            condition = "YEAR(created_at) = YEAR(CURDATE())"
        else:
            condition = "TRUE"

    q_mood = text(f"""
        SELECT mood_level AS label, COUNT(*) AS value
        FROM emotional_checkin
        WHERE {condition}
        GROUP BY mood_level
    """)
    q_energy = text(f"""
        SELECT energy_level AS label, COUNT(*) AS value
        FROM emotional_checkin
        WHERE {condition}
        GROUP BY energy_level
    """)
    q_stress = text(f"""
        SELECT stress_level AS label, COUNT(*) AS value
        FROM emotional_checkin
        WHERE {condition}
        GROUP BY stress_level
    """)

    mood_rows = db.execute(q_mood, params).mappings()
    energy_rows = db.execute(q_energy, params).mappings()
    stress_rows = db.execute(q_stress, params).mappings()
    return {
        "mood": [{"label": r["label"], "value": r["value"]} for r in mood_rows],
        "energy": [{"label": r["label"], "value": r["value"]} for r in energy_rows],
        "stress": [{"label": r["label"], "value": r["value"]} for r in stress_rows],
    }


@app.get("/api/ai/sentiment-summary")
def ai_sentiment_summary(
    period: str = Query("month", enum=["week", "month", "year"]),
    range: Optional[str] = Query(None),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    """Return a short natural-language summary of recent sentiment patterns.

    This is intentionally lightweight and uses existing aggregate data instead
    of any heavy external AI dependencies.
    """
    if range or start or end:
        start_dt, end_dt = parse_global_range(range or "this_week", start, end)
        data = NarrativeInsightService.mood_shift_summary(db, start_dt=start_dt, end_dt=end_dt)
    else:
        data = NarrativeInsightService.mood_shift_summary(db, days=30)
    trend = str(data.get("trend", "stable"))
    details = data.get("details") or []
    if not details:
        summary = "Sentiment data is limited for this period; no clear trend yet."
    else:
        total_points = sum(int(d.get("count") or 0) for d in details)
        first = details[0]
        last = details[-1]
        direction = {
            "increasing": "has been rising",
            "decreasing": "has been easing",
        }.get(trend, "has been relatively steady")
        summary = (
            f"Across the last {len(details)} days, emotional activity {direction}. "
            f"There were about {total_points} check-ins overall, from "
            f"{first.get('date')} through {last.get('date')}."
        )
    return {"summary": summary}


@app.get("/api/ai/mood-summary")
def ai_mood_summary(
    period: str = Query("month", enum=["week", "month", "year"]),
    range: Optional[str] = Query(None),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    """Return a short wellness-focused summary for the counselor dashboard."""
    if range or start or end:
        start_dt, end_dt = parse_global_range(range or "this_week", start, end)
        current = int(CounselorReportService._wellness_index(db, start_dt, end_dt))
        # previous period of equal length
        delta = end_dt - start_dt
        prev_end = start_dt - timedelta(seconds=1)
        prev_start = prev_end - delta
        previous = int(CounselorReportService._wellness_index(db, prev_start, prev_end))
        # derive event for the selected window from academic events
        ev_name, _ = _event_for_range(start_dt.date(), end_dt.date())
    else:
        report = CounselorReportService.summary(db)
        current = int(report.get("current_wellness_index", 0))
        previous = int(report.get("previous_wellness_index", current))
        ev_name = report.get("event_name")
    change = current - previous
    direction = "held steady"
    if change > 0:
        direction = f"improved by {change} points"
    elif change < 0:
        direction = f"dipped by {abs(change)} points"
    base = f"Overall wellness {direction} to {current} on the index this period."
    if ev_name:
        base += f" This coincides with {ev_name.lower()}, which may be influencing student stress and engagement."
    return {"summary": base}

class CheckinIn(BaseModel):
    mood_level: str
    energy_level: str
    stress_level: str
    comment: Optional[str] = None

@app.post("/api/emotional-checkins")
def create_emotional_checkin(
    payload: CheckinIn,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    try:
        data = decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    # For mobile: subject is the Mobile DB user_id
    try:
        uid = int(data.get("sub"))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token subject")

    # Normalize stress label to match schema
    stress = payload.stress_level
    if stress == "Very High":
        stress = "Very High Stress"

    # Insert into the MOBILE database
    with mobile_engine.connect() as conn:
        try:
            ins = conn.execute(text(
                """
                INSERT INTO emotional_checkin (user_id, mood_level, energy_level, stress_level, comment, created_at)
                VALUES (:uid, :mood, :energy, :stress, :comment, NOW())
                """
            ), {
                "uid": uid,
                "mood": payload.mood_level,
                "energy": payload.energy_level,
                "stress": stress,
                "comment": (payload.comment or None),
            })
            conn.commit()
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to save check-in: {exc.__class__.__name__}")
    # Background analytics persistence: sentiments
    try:
        SentimentService.remove_existing_checkin_sentiments(db, int(ins.lastrowid))
        SentimentService.analyze_checkin(db, int(ins.lastrowid))
        db.commit()
    except Exception:
        db.rollback()
    return {"ok": True, "checkin_id": int(ins.lastrowid)}


@app.get("/api/emotional-checkins")
def list_emotional_checkins(
    days: int = Query(7, ge=1, le=31),
    limit: int = Query(200, ge=1, le=1000),
    token: str = Depends(oauth2_scheme),
):
    """List recent emotional check-ins for the authenticated mobile user.

    Returns raw rows from the mobile DB within the last `days` days, ordered by
    newest first. Timestamps are formatted as ISO strings.
    """
    try:
        data = decode_token(token)
        uid = int(data.get("sub"))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # Include today by subtracting (days-1); e.g., 7 -> last 7 calendar days
    start_dt = datetime.utcnow() - timedelta(days=days - 1)

    q = text(
        """
        SELECT checkin_id, user_id, mood_level, energy_level, stress_level, comment, created_at
        FROM emotional_checkin
        WHERE user_id = :uid AND created_at >= :start
        ORDER BY created_at DESC
        LIMIT :lim
        """
    )
    with mobile_engine.connect() as conn:
        rows = list(conn.execute(q, {"uid": uid, "start": start_dt, "lim": limit}).mappings())
        out = []
        for r in rows:
            created = r.get("created_at")
            out.append(
                {
                    "checkin_id": r.get("checkin_id"),
                    "user_id": r.get("user_id"),
                    "mood_level": r.get("mood_level"),
                    "energy_level": r.get("energy_level"),
                    "stress_level": r.get("stress_level"),
                    "comment": r.get("comment"),
                    "created_at": created.strftime("%Y-%m-%dT%H:%M:%S") if created else None,
                }
            )
        return out


class JournalIn(BaseModel):
    content: str


@app.post("/api/journals")
def create_journal(
    payload: JournalIn,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    try:
        data = decode_token(token)
        uid = int(data.get("sub"))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(status_code=422, detail="Content required")

    with mobile_engine.connect() as conn:
        try:
            ins = conn.execute(
                text(
                    """
                    INSERT INTO journal (user_id, content, created_at)
                    VALUES (:uid, :content, NOW())
                    """
                ),
                {"uid": uid, "content": content},
            )
            conn.commit()
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to save journal: {exc.__class__.__name__}")
    try:
        SentimentService.remove_existing_journal_sentiments(db, int(ins.lastrowid))
        SentimentService.analyze_journal(db, int(ins.lastrowid))
        db.commit()
    except Exception:
        db.rollback()
    return {"ok": True, "journal_id": int(ins.lastrowid)}

@app.get("/api/journals")
def list_journals(limit: int = Query(50, ge=1, le=200), token: str = Depends(oauth2_scheme)):
    try:
        data = decode_token(token)
        uid = int(data.get("sub"))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    q = text(
        """
        SELECT journal_id, content, created_at
        FROM journal
        WHERE user_id = :uid AND (deleted_at IS NULL)
        ORDER BY created_at DESC
        LIMIT :lim
        """
    )
    with mobile_engine.connect() as conn:
        rows = conn.execute(q, {"uid": uid, "lim": limit}).mappings()
        return [
            {
                "journal_id": r["journal_id"],
                "content": r["content"],
                "created_at": r["created_at"].strftime("%Y-%m-%dT%H:%M:%S") if r["created_at"] else None,
            }
            for r in rows
        ]

@app.get("/api/journals/{journal_id}")
def get_journal(journal_id: int, token: str = Depends(oauth2_scheme)):
    try:
        data = decode_token(token)
        uid = int(data.get("sub"))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    q = text(
        """
        SELECT journal_id, content, created_at
        FROM journal
        WHERE journal_id = :jid AND user_id = :uid AND (deleted_at IS NULL)
        LIMIT 1
        """
    )
    with mobile_engine.connect() as conn:
        row = conn.execute(q, {"jid": journal_id, "uid": uid}).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Journal not found")
        return {
            "journal_id": row["journal_id"],
            "content": row["content"],
            "created_at": row["created_at"].strftime("%Y-%m-%dT%H:%M:%S") if row["created_at"] else None,
        }


@app.delete("/api/journals/{journal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_journal_mobile(
    journal_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Delete a journal entry (soft delete) for mobile app."""
    try:
        data = decode_token(token)
        uid = int(data.get("sub"))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # Check ownership first
    check_q = text(
        """
        SELECT journal_id FROM journal
        WHERE journal_id = :jid AND user_id = :uid
        LIMIT 1
        """
    )
    with mobile_engine.connect() as conn:
        row = conn.execute(check_q, {"jid": journal_id, "uid": uid}).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Journal not found")

    # Hard delete the journal row
    delete_q = text(
        """
        DELETE FROM journal
        WHERE journal_id = :jid AND user_id = :uid
        """
    )
    with mobile_engine.begin() as conn:
        res = conn.execute(delete_q, {"jid": journal_id, "uid": uid})
        if (res.rowcount or 0) == 0:
            # Fallback to soft delete in case of restrictive constraints/environment
            soft_q = text(
                """
                UPDATE journal SET deleted_at = NOW()
                WHERE journal_id = :jid AND user_id = :uid AND (deleted_at IS NULL)
                """
            )
            soft = conn.execute(soft_q, {"jid": journal_id, "uid": uid})
            if (soft.rowcount or 0) == 0:
                raise HTTPException(status_code=404, detail="Journal not found")

    # Remove any stored sentiments associated with this journal entry
    try:
        SentimentService.remove_existing_journal_sentiments(db, journal_id)
        db.commit()
    except Exception:
        db.rollback()

    return None


@app.get("/reports/top-stats")
def get_top_stats(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    return CounselorReportService.top_stats(db)


@app.get("/reports/summary")
def reports_summary(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    return CounselorReportService.summary(db)


@app.get("/reports/trends")
def reports_trends(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    data = CounselorReportService.trends(db)
    return {
        **data,
        "dates": data["dates"],
        "mood": data["mood"],
        "energy": data["energy"],
        "stress": data["stress"],
        "wellness_index": data["wellness_index"],
        "current_index": data["current_index"],
        "previous_index": data["previous_index"],
        "change_percent": data["change_percent"],
        "numerical_change": data["numerical_change"],
    }


@app.get("/reports/engagement")
def reports_engagement(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    return CounselorReportService.engagement_metrics(db)


@app.get("/reports/weekly-insights")
def weekly_insights(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    return CounselorReportService.weekly_insights(db)


@app.get("/reports/behavior-insights")
def behavior_insights(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    return CounselorReportService.behavior_insights(db)


@app.get("/reports/attention")
def get_attention_students(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    return CounselorReportService.attention_students(db)


@app.get("/reports/concerns")
def get_concerns(
    period: str = Query("month", enum=["week", "month"]),
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()
    if period == "week":
        start = now - timedelta(days=7)
    else:
        start = now.replace(day=1)
    return CounselorReportService.concerns(db, start=start)


@app.get("/reports/interventions")
def get_interventions(
    period: str = Query("month", enum=["week", "month"]),
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()
    if period == "week":
        start = now - timedelta(days=7)
    else:
        start = now.replace(day=1)
    return CounselorReportService.interventions(db, start=start)


@app.get("/reports/participation")
def get_participation(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    return CounselorReportService.participation(db)


@app.get("/analytics/intervention-success")
def intervention_success(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    return CounselorReportService.intervention_success(db)


@app.get("/events")
def list_events(
    _user: User = Depends(require_counselor),
):
    return CounselorReportService.load_academic_events()


@app.post("/calendar/upload")
async def upload_calendar(
    file: UploadFile,
    _user: User = Depends(require_counselor),
):
    content = await file.read()

    def _extract_events_from_file(filename: str, content: bytes) -> List[Dict[str, Any]]:
        name = filename.lower()
        if name.endswith(".csv"):
            try:
                text_data = content.decode("utf-8-sig")
                import csv

                reader = csv.DictReader(text_data.splitlines())
                parsed: List[Dict[str, Any]] = []
                for row in reader:
                    start_val = row.get("start") or row.get("start_date")
                    end_val = row.get("end") or row.get("end_date") or start_val
                    if not start_val or not end_val:
                        continue
                    parsed.append(
                        {
                            "name": row.get("name") or row.get("event") or "Unknown Event",
                            "type": row.get("type"),
                            "start_date": start_val,
                            "end_date": end_val,
                        }
                    )
                return parsed
            except Exception:
                return []
        return []

    new_events = _extract_events_from_file(file.filename, content)
    if not new_events:
        return {"status": "uploaded", "events_extracted": 0}

    try:
        with EVENTS_FILE.open("w", encoding="utf-8") as fh:
            json.dump(new_events, fh, indent=2)
    except Exception as exc:  # pragma: no cover - file IO failure
        raise HTTPException(status_code=500, detail="Failed to persist events") from exc

    return {"status": "uploaded", "events_extracted": len(new_events)}


# --- Conversations API (service-backed) ---


def _ensure_conversation_access(
    conversation: Optional[Conversation],
    current_user: User,
) -> Conversation:
    """Enforce per-role access rules for a conversation.

    Students: can only access conversations they initiated.
    Counselors: can access any conversation (open or ended).
    Other roles: currently treated like counselors.
    """
    if conversation is None:
        logging.info("_ensure_conversation_access: conversation_id=NONE, user_id=%s, role=%s", getattr(current_user, "user_id", None), getattr(current_user, "role", None))
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    if current_user.role == UserRole.student and conversation.initiator_user_id != current_user.user_id:
        logging.info(
            "_ensure_conversation_access: deny student user_id=%s for convo_id=%s (initiator_user_id=%s)",
            current_user.user_id,
            conversation.conversation_id,
            conversation.initiator_user_id,
        )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    logging.info(
        "_ensure_conversation_access: allow user_id=%s role=%s convo_id=%s status=%s",
        getattr(current_user, "user_id", None),
        getattr(current_user, "role", None),
        getattr(conversation, "conversation_id", None),
        getattr(conversation, "status", None),
    )
    return conversation

    # end guard

@app.get("/api/conversations", response_model=List[ConversationSchema])
def list_conversations(
    include_messages: bool = Query(False),
    initiator_user_id: Optional[int] = Query(None),
    user_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Derive which user_id (if any) to filter conversations by.
    # Students are always restricted to their own conversations.
    # Counselors see only conversations for students they are assigned to via alerts.
    filter_initiator_id: Optional[int] = None
    counselor_user_id: Optional[int] = None
    if current_user.role == UserRole.student:
        filter_initiator_id = current_user.user_id
    elif current_user.role == UserRole.counselor:
        counselor_user_id = current_user.user_id
    elif initiator_user_id is not None:
        # Allow explicit filtering by initiator for non-counselor, non-student roles (e.g. admin).
        filter_initiator_id = initiator_user_id

    # Privacy: counselors cannot fetch messages in list payloads, but they can see conversation metadata.
    if current_user.role == UserRole.counselor:
        include_messages = False

    logging.info(
        "list_conversations: user_id=%s role=%s initiator_param=%s filter_initiator_id=%s counselor_user_id=%s include_messages=%s",
        getattr(current_user, "user_id", None),
        getattr(current_user, "role", None),
        initiator_user_id,
        filter_initiator_id,
        counselor_user_id,
        include_messages,
    )

    conversations = ConversationService.list_conversations(
        db,
        initiator_user_id=filter_initiator_id,
        counselor_user_id=counselor_user_id,
        include_messages=include_messages,
    )
    logging.info(
        "list_conversations: returned count=%d for user_id=%s role=%s",
        len(conversations),
        getattr(current_user, "user_id", None),
        getattr(current_user, "role", None),
    )
    return conversations


@app.post("/api/conversations", response_model=ConversationSchema, status_code=status.HTTP_201_CREATED)
def start_conversation(
    conversation_in: ConversationStart,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    payload = ConversationCreate(
        initiator_user_id=current_user.user_id,
        initiator_role=current_user.role.value,
        subject=conversation_in.subject,
        status=ConversationStatus.OPEN,
    )
    return ConversationService.create_conversation(db, payload)


@app.get("/api/conversations/{conversation_id}", response_model=ConversationSchema)
def get_conversation(
    conversation_id: int,
    include_messages: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Counselors may inspect conversation metadata, but we still avoid returning
    # full message transcripts via this endpoint by default.
    if current_user.role == UserRole.counselor and include_messages:
        include_messages = False
    logging.info(
        "get_conversation: user_id=%s role=%s convo_id=%s include_messages=%s",
        getattr(current_user, "user_id", None),
        getattr(current_user, "role", None),
        conversation_id,
        include_messages,
    )
    conversation = ConversationService.get_conversation(
        db,
        conversation_id,
        include_messages=include_messages,
    )
    convo = _ensure_conversation_access(conversation, current_user)
    return convo


@app.patch("/api/conversations/{conversation_id}", response_model=ConversationSchema)
def update_conversation(
    conversation_id: int,
    conversation_in: ConversationUpdate,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    if conversation_in.last_activity_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="last_activity_at cannot be updated")
    conversation = _ensure_conversation_access(
        ConversationService.get_conversation(db, conversation_id),
        current_user,
    )
    updated = ConversationService.update_conversation(db, conversation, conversation_in)
    return updated


@app.get("/api/conversations/{conversation_id}/messages", response_model=List[MessageSchema])
def list_conversation_messages(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Enforce access rules via conversation ownership; counselors are allowed to
    # see transcripts, students are limited to their own initiated conversations.
    logging.info(
        "list_conversation_messages: user_id=%s role=%s convo_id=%s",
        getattr(current_user, "user_id", None),
        getattr(current_user, "role", None),
        conversation_id,
    )
    _ensure_conversation_access(
        ConversationService.get_conversation(db, conversation_id),
        current_user,
    )
    messages = ConversationService.list_messages(db, conversation_id)
    logging.info(
        "list_conversation_messages: returned count=%d for user_id=%s role=%s convo_id=%s",
        len(messages),
        getattr(current_user, "user_id", None),
        getattr(current_user, "role", None),
        conversation_id,
    )
    return messages


@app.post(
    "/api/conversations/{conversation_id}/messages",
    response_model=MessageSchema,
    status_code=status.HTTP_201_CREATED,
)
async def send_message(
    conversation_id: int,
    message_in: MessageSend,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = _ensure_conversation_access(
        ConversationService.get_conversation(db, conversation_id),
        current_user,
    )
    message_payload = MessageCreate(
        sender_id=current_user.user_id,
        content=message_in.content,
        is_read=message_in.is_read,
    )
    logging.info(
        "send_message: user_id=%s role=%s convo_id=%s",
        getattr(current_user, "user_id", None),
        getattr(current_user, "role", None),
        conversation_id,
    )
    message = ConversationService.add_message(db, conversation, message_payload)
    # Broadcast to subscribers for this conversation after DB commit
    try:
        await ws_conv_manager.broadcast_message_created(
            conversation_id,
            MessageSchema.model_validate(message).model_dump(),
        )
    except Exception as exc:  # pragma: no cover - defensive
        logging.info("[realtime] conv broadcast failed: %s", exc.__class__.__name__)
    return message


@app.post("/api/conversations/{conversation_id}/read")
def mark_conversation_read(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = _ensure_conversation_access(
        ConversationService.get_conversation(db, conversation_id),
        current_user,
    )
    updated = ConversationService.mark_conversation_read(
        db,
        conversation.conversation_id,
        current_user.user_id,
    )
    logging.info(
        "mark_conversation_read: user_id=%s role=%s convo_id=%s updated=%s",
        getattr(current_user, "user_id", None),
        getattr(current_user, "role", None),
        conversation_id,
        updated,
    )
    return {"updated": updated}


# --- Analytics: Chat-based Intervention Success ---
def _simple_sentiment_scores(texts):
    """Return a list of polarity scores in [-1,1] using a tiny lexicon heuristic.
    This keeps the endpoint runnable without extra dependencies.
    """
    pos_words = {
        "good","great","improve","better","okay","fine","thanks","thank","happy","relieved","hopeful","resolved","helpful","appreciate","glad"
    }
    neg_words = {
        "bad","worse","sad","anxious","anxiety","stress","stressed","angry","upset","worried","depressed","terrible","awful","hopeless","stuck"
    }
    scores = []
    for t in texts or []:
        t_low = (t or "").lower()
        p = sum(1 for w in pos_words if w in t_low)
        n = sum(1 for w in neg_words if w in t_low)
        score = 0.0
        if p or n:
            score = (p - n) / max(p + n, 1)
        scores.append(max(-1.0, min(1.0, score)))
    return scores

def _avg(nums):
    nums = [float(x) for x in (nums or []) if x is not None]
    return (sum(nums) / len(nums)) if nums else 0.0

@app.get("/api/analytics/intervention-success")
def intervention_success():
    """Measure intervention success from chat only, by comparing early vs late
    student message sentiment within ended conversations.
    """
    q_convos = text(
        """
        SELECT c.conversation_id
        FROM conversations c
        WHERE c.status = 'ended'
        """
    )
    q_msgs = text(
        """
        SELECT m.content, m.timestamp, u.role
        FROM messages m
        JOIN user u ON m.sender_id = u.user_id
        WHERE m.conversation_id = :cid
        ORDER BY m.timestamp ASC
        """
    )

    total = 0
    success = 0
    total_duration_min = 0.0
    total_message_count = 0

    with engine.connect() as conn:
        convos = list(conn.execute(q_convos).mappings())
        for c in convos:
            cid = c["conversation_id"]
            rows = list(conn.execute(q_msgs, {"cid": cid}).mappings())
            if not rows:
                continue

            student_msgs = [r["content"] for r in rows if (r.get("role") or "").lower() == "student"]
            if len(student_msgs) < 2:
                continue

            total += 1

            # Early vs late sentiment (use up to 3 from start/end)
            start_slice = student_msgs[:3]
            end_slice = student_msgs[-3:]
            start_scores = _simple_sentiment_scores(start_slice)
            end_scores = _simple_sentiment_scores(end_slice)
            if _avg(end_scores) > _avg(start_scores):
                success += 1

            # Engagement metrics
            total_message_count += len(rows)
            try:
                first_ts = rows[0]["timestamp"]
                last_ts = rows[-1]["timestamp"]
                if first_ts and last_ts:
                    duration_min = (last_ts - first_ts).total_seconds() / 60.0
                    total_duration_min += max(0.0, duration_min)
            except Exception:
                pass

    success_rate = round((success / total * 100.0), 2) if total else 0.0
    avg_duration = round((total_duration_min / total), 1) if total else 0.0
    avg_messages = round((total_message_count / total), 1) if total else 0.0

    return {
        "overall_success_rate": success_rate,
        "total_sessions": total,
        "successful_sessions": success,
        "average_conversation_duration_minutes": avg_duration,
        "average_messages_per_conversation": avg_messages,
    }

# --- Messages per conversation ---
@app.get("/api/_legacy/conversations/{conversation_id}/messages")
def get_messages(conversation_id: int, current_user: str = Depends(get_current_user)):
    query = """
        SELECT 
            m.message_id AS id,
            m.conversation_id,
            m.sender_id,
            u.name AS sender_name,
            u.role AS sender_role,
            m.content,
            m.is_read,
            m.timestamp
        FROM messages m
        JOIN user u ON m.sender_id = u.user_id
        WHERE m.conversation_id = :cid
        ORDER BY m.timestamp ASC
    """
    with engine.connect() as conn:
        result = conn.execute(text(query), {"cid": conversation_id}).mappings()
        return [dict(row) for row in result]


# --- Send message ---
class MessageIn(BaseModel):
    sender_id: int
    content: str

@app.post("/api/_legacy/conversations/{conversation_id}/messages")
def send_message(conversation_id: int, message: MessageIn, current_user: str = Depends(get_current_user)):
    query = """
        INSERT INTO messages (conversation_id, sender_id, content, timestamp)
        VALUES (:cid, :sid, :content, NOW())
    """
    with engine.connect() as conn:
        result = conn.execute(
            text(query),
            {"cid": conversation_id, "sid": message.sender_id, "content": message.content}
        )
        conn.commit()

        return {
            "id": result.lastrowid,
            "conversation_id": conversation_id,
            "sender_id": message.sender_id,
            "content": message.content,
            "timestamp": str(datetime.now())
        }

@app.get("/health")
def health():
    status_map = {"web": "unknown", "mobile": "unknown"}

    def check_db(label: str, db_engine, init_error_msg: str | None = None):
        if init_error_msg:
            status_map[label] = f"error: {init_error_msg}"
            return False
        try:
            with db_engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            status_map[label] = "connected"
            return True
        except Exception as exc:
            status_map[label] = f"error: {exc.__class__.__name__}"
            return False

    web_ok = check_db("web", engine, ENGINE_INIT_ERROR_MSG)
    mobile_ok = check_db("mobile", mobile_engine)

    if web_ok and mobile_ok:
        return {"status": "ok", "databases": status_map}

    problem = []
    if not web_ok:
        problem.append("web_db unreachable")
    if not mobile_ok:
        problem.append("mobile_db unreachable")

    raise HTTPException(status_code=503, detail={"status": "unhealthy", "databases": status_map, "error": ", ".join(problem)})

# --- Mark messages as read in a conversation ---
@app.post("/api/conversations/{conversation_id}/read")
def mark_conversation_read(conversation_id: int, user_id: int = Query(...), current_user: str = Depends(get_current_user)):
    """
    Mark all messages in the conversation as read for the given user by setting is_read = 1
    for messages not sent by the user (i.e., incoming messages to the user).
    """
    update_q = text(
        """
        UPDATE messages
        SET is_read = 1
        WHERE conversation_id = :cid
          AND sender_id <> :uid
          AND (is_read = 0 OR is_read IS NULL)
        """
    )
    with engine.connect() as conn:
        result = conn.execute(update_q, {"cid": conversation_id, "uid": user_id})
        conn.commit()
        return {"updated": result.rowcount}
    
# --- Reports APIs ---

class WeeklyInsight(BaseModel):
    week_start: str
    week_end: str
    event_name: Optional[str] = None
    event_type: Optional[str] = None
    title: str
    description: str
    recommendation: str


class ReportSummary(BaseModel):
    week_start: str
    week_end: str
    current_wellness_index: int
    previous_wellness_index: int
    change: int
    event_name: Optional[str] = None
    event_type: Optional[str] = None
    insight: str
    insights: List[WeeklyInsight]


class TrendWeek(BaseModel):
    week_start: str
    week_end: str
    index: int
    avg_mood: float
    avg_energy: float
    avg_stress: float
    event_name: Optional[str] = None
    event_type: Optional[str] = None

class TrendsResponse(BaseModel):
    weeks: List[TrendWeek]

class EngagementMetrics(BaseModel):
    active_students_this_week: int
    active_students_last_week: int
    avg_checkins_per_student: float
    participation_change: str

def _week_bounds(today: date) -> tuple[datetime, datetime]:
    start = datetime.combine(today - timedelta(days=today.weekday()), datetime.min.time())
    end = start + timedelta(days=6, hours=23, minutes=59, seconds=59)
    return start, end

def _load_academic_events() -> list[dict]:
    try:
        events_path = Path(__file__).parent / "data" / "school_calendar.json"
        if events_path.exists():
            with open(events_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
    except Exception:
        pass
    return [
        {"name": "Midterm Exams", "type": "exam", "start_date": "2025-11-10", "end_date": "2025-11-16"},
        {"name": "Final Exams", "type": "exam", "start_date": "2025-12-08", "end_date": "2025-12-14"},
        {"name": "Enrollment Week", "type": "enrollment", "start_date": "2025-06-10", "end_date": "2025-06-16"},
        {"name": "Project Week", "type": "project", "start_date": "2025-10-20", "end_date": "2025-10-26"},
    ]

ACADEMIC_EVENTS = _load_academic_events()

def _parse_ymd(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()

def _event_for_range(start_d: date, end_d: date) -> tuple[Optional[str], Optional[str]]:
    for ev in ACADEMIC_EVENTS:
        try:
            ev_start = _parse_ymd(ev.get("start_date"))
            ev_end = _parse_ymd(ev.get("end_date"))
        except Exception:
            continue
        if ev_start <= end_d and ev_end >= start_d:
            return ev.get("name"), ev.get("type")
    return None, None

def _weekly_wellness_index(start_dt: datetime, end_dt: datetime) -> int:
    q = text(
        """
        SELECT ROUND(AVG(
            0.4 * (CASE mood_level
                WHEN 'Very Sad' THEN 0
                WHEN 'Sad' THEN 17
                WHEN 'Neutral' THEN 33
                WHEN 'Good' THEN 50
                WHEN 'Happy' THEN 67
                WHEN 'Very Happy' THEN 83
                WHEN 'Excellent' THEN 100
                ELSE NULL END)
          + 0.3 * (CASE energy_level
                WHEN 'Very Low' THEN 0
                WHEN 'Low' THEN 25
                WHEN 'Moderate' THEN 50
                WHEN 'High' THEN 75
                WHEN 'Very High' THEN 100
                ELSE NULL END)
          + 0.3 * (100 - (CASE stress_level
                WHEN 'No Stress' THEN 0
                WHEN 'Low Stress' THEN 25
                WHEN 'Moderate' THEN 50
                WHEN 'High Stress' THEN 75
                WHEN 'Very High Stress' THEN 100
                ELSE NULL END))
        ), 0) AS idx
        FROM emotional_checkin
        WHERE created_at >= :start AND created_at < :end
        """
    )
    with engine.connect() as conn:
        row = conn.execute(q, {
            "start": start_dt.strftime('%Y-%m-%d %H:%M:%S'),
            "end": (end_dt + timedelta(seconds=1)).strftime('%Y-%m-%d %H:%M:%S')
        }).mappings().first()
        val = row["idx"] if row else None
        try:
            return int(val or 0)
        except Exception:
            return 0


def _trend_detail(start_dt: datetime, end_dt: datetime) -> Dict[str, float]:
    query = text(
        """
        SELECT
            AVG(CASE mood_level
                WHEN 'Very Sad' THEN 1
                WHEN 'Sad' THEN 2
                WHEN 'Neutral' THEN 3
                WHEN 'Good' THEN 4
                WHEN 'Happy' THEN 5
                WHEN 'Very Happy' THEN 6
                WHEN 'Excellent' THEN 7
                ELSE NULL END) AS avg_mood,
            AVG(CASE energy_level
                WHEN 'Very Low' THEN 1
                WHEN 'Low' THEN 2
                WHEN 'Moderate' THEN 3
                WHEN 'High' THEN 4
                WHEN 'Very High' THEN 5
                ELSE NULL END) AS avg_energy,
            AVG(CASE stress_level
                WHEN 'No Stress' THEN 1
                WHEN 'Low Stress' THEN 2
                WHEN 'Moderate' THEN 3
                WHEN 'High Stress' THEN 4
                WHEN 'Very High Stress' THEN 5
                ELSE NULL END) AS avg_stress
        FROM emotional_checkin
        WHERE created_at >= :start AND created_at < :end
        """
    )
    end_exclusive = end_dt + timedelta(seconds=1)
    with engine.connect() as conn:
        row = conn.execute(query, {
            "start": start_dt.strftime('%Y-%m-%d %H:%M:%S'),
            "end": end_exclusive.strftime('%Y-%m-%d %H:%M:%S'),
        }).mappings().first()
        if not row:
            return {"avg_mood": 0.0, "avg_energy": 0.0, "avg_stress": 0.0}
        mood_raw = row["avg_mood"]
        energy_raw = row["avg_energy"]
        stress_raw = row["avg_stress"]

        def _scale(val: Optional[float], min_val: float, max_val: float) -> float:
            if val is None:
                return 0.0
            return round(((float(val) - min_val) / (max_val - min_val)) * 100, 1)

        return {
            "avg_mood": _scale(mood_raw, 1, 7),
            "avg_energy": _scale(energy_raw, 1, 5),
            "avg_stress": _scale(stress_raw, 1, 5),
        }


def _journal_themes(start_dt: datetime, end_dt: datetime, limit: int = 3) -> List[str]:
    q = text(
        """
        SELECT sentiment
        FROM journal_sentiment js
        JOIN journal j ON j.journal_id = js.journal_id
        WHERE j.created_at >= :start AND j.created_at < :end
        ORDER BY j.created_at DESC
        LIMIT 200
        """
    )
    with engine.connect() as conn:
        sentiments = [row["sentiment"] for row in conn.execute(q, {
            "start": start_dt.strftime('%Y-%m-%d %H:%M:%S'),
            "end": end_dt.strftime('%Y-%m-%d %H:%M:%S'),
        }).mappings()]
    counts = Counter(sentiments)
    return [name for name, _ in counts.most_common(limit)]


def _build_recommendation(change: int, themes: List[str]) -> str:
    if change >= 5:
        base = "Momentum is positive. Continue reinforcing healthy routines."
    elif change <= -5:
        base = "Consider proactive outreach—students may need extra support this week."
    else:
        base = "Wellness is stable. Maintain regular check-ins."
    if themes:
        theme_notes = ", ".join(themes[:2])
        return f"{base} Watch for recurring sentiments: {theme_notes}."
    return base


def _load_events() -> List[Dict[str, Any]]:
    if not EVENTS_FILE.exists():
        return []
    try:
        with EVENTS_FILE.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
            return data if isinstance(data, list) else []
    except Exception:
        return []


def _event_overlaps(event: Dict[str, Any], start: date, end: date) -> bool:
    try:
        ev_start = datetime.strptime(event["start"], "%Y-%m-%d").date()
        ev_end = datetime.strptime(event["end"], "%Y-%m-%d").date()
    except Exception:
        return False
    return ev_start <= end and ev_end >= start


def _extract_events_from_file(filename: str, content: bytes) -> List[Dict[str, Any]]:
    name = filename.lower()
    if name.endswith(".csv"):
        try:
            text_data = content.decode("utf-8-sig")
            reader = csv.DictReader(text_data.splitlines())
            events = []
            for row in reader:
                events.append({
                    "name": row.get("name") or row.get("event") or "Unknown Event",
                    "start": row.get("start") or row.get("start_date"),
                    "end": row.get("end") or row.get("end_date"),
                    "type": row.get("type")
                })
            return [ev for ev in events if ev.get("start") and ev.get("end")]
        except Exception:
            return []
    # Other formats would require OCR or structured parsing; return empty for now.
    return []
@app.get("/api/reports/summary", response_model=ReportSummary)
def reports_summary(current_user: str = Depends(get_current_user)):
    today = datetime.now().date()
    start_dt, end_dt = _week_bounds(today)

    insight_weeks = 4
    offsets = list(range(insight_weeks - 1, -1, -1))
    insight_records: List[Dict[str, typing.Any]] = []
    previous_index: Optional[int] = None
    last_index: Optional[int] = None

    for offset in offsets:
        week_start_dt = start_dt - timedelta(weeks=offset)
        week_end_dt = week_start_dt + timedelta(days=6, hours=23, minutes=59, seconds=59)
        index_val = _weekly_wellness_index(week_start_dt, week_end_dt)
        change = 0 if last_index is None else index_val - last_index
        last_index = index_val

        ev_name, ev_type = _event_for_range(week_start_dt.date(), week_end_dt.date())
        themes = _journal_themes(week_start_dt, week_end_dt)
        recommendation = _build_recommendation(change, themes)

        if change > 5:
            title = "Wellness Surge"
            direction = f"rose by {change} points"
        elif change < -5:
            title = "Wellness Dip"
            direction = f"fell by {abs(change)} points"
        elif change > 0:
            title = "Positive Momentum"
            direction = f"rose by {change} point{'' if change == 1 else 's'}"
        elif change < 0:
            title = "Downward Shift"
            direction = f"fell by {abs(change)} point{'' if change == -1 else 's'}"
        else:
            title = "Stable Wellness"
            direction = "held steady"

        description = f"Wellness index {direction} to {index_val}."
        if ev_name:
            description += f" During {ev_name.lower()}, watch for stress triggers."

        insight_obj = WeeklyInsight(
            week_start=week_start_dt.strftime('%Y-%m-%d'),
            week_end=(week_start_dt + timedelta(days=6)).strftime('%Y-%m-%d'),
            event_name=ev_name,
            event_type=ev_type,
            title=title,
            description=description,
            recommendation=recommendation,
        )

        insight_records.append({
            "insight": insight_obj,
            "change": change,
            "index": index_val,
        })

    insight_records = list(reversed(insight_records))  # most recent first
    insights = [record["insight"] for record in insight_records]

    current_record = insight_records[0]
    previous_record = insight_records[1] if len(insight_records) > 1 else insight_records[0]

    return ReportSummary(
        week_start=current_record["insight"].week_start,
        week_end=current_record["insight"].week_end,
        current_wellness_index=current_record["index"],
        previous_wellness_index=previous_record["index"],
        change=current_record["index"] - previous_record["index"],
        event_name=current_record["insight"].event_name,
        event_type=current_record["insight"].event_type,
        insight=current_record["insight"].description,
        insights=insights,
    )

def _collect_weekly_trends(weeks: int = 12) -> List[Dict[str, Any]]:
    today = datetime.now().date()
    this_start, _ = _week_bounds(today)
    base_monday = this_start.date()
    items: List[Dict[str, Any]] = []
    for i in range(weeks - 1, -1, -1):
        wk_start_date = base_monday - timedelta(weeks=i)
        wk_end_date = wk_start_date + timedelta(days=6)
        start_dt = datetime.combine(wk_start_date, datetime.min.time())
        end_dt = datetime.combine(wk_end_date, datetime.max.time())
        idx = _weekly_wellness_index(start_dt, end_dt)
        metrics = _trend_detail(start_dt, end_dt)
        items.append({
            "week_start": wk_start_date,
            "week_end": wk_end_date,
            "index": idx,
            "avg_mood": metrics["avg_mood"],
            "avg_energy": metrics["avg_energy"],
            "avg_stress": metrics["avg_stress"],
        })
    return items


@app.get("/api/reports/trends")
def reports_trends(
    range: Optional[str] = Query(None),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Exclude from global date filter by default (return full-history trends).
    # Only apply filter when the client explicitly provides range/start/end.
    if range or start or end:
        start_dt, end_dt = parse_global_range(range or "this_week", start, end)
        weeks = CheckinService.weekly_trend_rolling(db, start=start_dt.date(), end=end_dt.date())
    else:
        weeks = CheckinService.weekly_trend_rolling(db)
    return {"weeks": weeks}

@app.get("/api/reports/engagement", response_model=EngagementMetrics)
def reports_engagement(
    range: str = Query("this_week"),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    current_user: str = Depends(get_current_user),
):
    # Use the global date filter for the "current" period and compare to a previous
    # period of equal length. Field names are kept for backward compatibility.
    start_dt, end_dt = parse_global_range(range, start, end)
    delta = end_dt - start_dt
    prev_end_dt = start_dt - timedelta(seconds=1)
    prev_start_dt = prev_end_dt - delta

    q_counts = text(
        """
        SELECT 
          COUNT(DISTINCT user_id) AS active,
          COUNT(*) AS total
        FROM emotional_checkin
        WHERE created_at >= :start AND created_at < :end
        """
    )
    q_total_students = text("SELECT COUNT(*) AS total FROM user WHERE role = 'student'")

    with engine.connect() as conn:
        this_rows = conn.execute(q_counts, {
            "start": start_dt.strftime('%Y-%m-%d %H:%M:%S'),
            "end": (end_dt + timedelta(seconds=1)).strftime('%Y-%m-%d %H:%M:%S')
        }).mappings().first()
        last_rows = conn.execute(q_counts, {
            "start": prev_start_dt.strftime('%Y-%m-%d %H:%M:%S'),
            "end": (prev_end_dt + timedelta(seconds=1)).strftime('%Y-%m-%d %H:%M:%S')
        }).mappings().first()
        total_students = conn.execute(q_total_students).mappings().first()["total"]

    active_this = int(this_rows["active"] or 0)
    total_this = int(this_rows["total"] or 0)
    active_last = int(last_rows["active"] or 0)
    total_last = int(last_rows["total"] or 0)

    avg_this = round((total_this / active_this), 1) if active_this > 0 else 0.0
    part_this = (active_this / total_students) if total_students else 0.0
    part_last = (active_last / total_students) if total_students else 0.0
    if part_last > 0:
        change_pct = round(((part_this - part_last) * 100) / max(part_last, 1e-9))
        sign = "+" if change_pct >= 0 else ""
        part_change = f"{sign}{change_pct}%"
    else:
        part_change = "0%"

    return EngagementMetrics(
        active_students_this_week=active_this,
        active_students_last_week=active_last,
        avg_checkins_per_student=avg_this,
        participation_change=part_change,
    )


# --- Reports: Insights helpers (backed by ai_insights) ---
def _collect_week_windows(start_dt: datetime, end_dt: datetime) -> list[tuple[date, date]]:
    # Align to Mondays -> Sundays
    start_day = start_dt.date()
    end_day = end_dt.date()
    start_monday = start_day - timedelta(days=start_day.weekday())
    end_sunday = end_day + timedelta(days=(6 - end_day.weekday()))
    windows: list[tuple[date, date]] = []
    cur = start_monday
    while cur <= end_sunday:
        ws = cur
        we = cur + timedelta(days=6)
        windows.append((ws, we))
        cur = cur + timedelta(days=7)
    return windows


def _get_or_compute_weekly_insight(db: Session, tf_start: date, tf_end: date) -> Dict[str, Any]:
    # Try reading from ai_insights first
    row = None
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT data FROM ai_insights
                WHERE user_id IS NULL AND type = 'weekly'
                  AND timeframe_start = :ts AND timeframe_end = :te
                LIMIT 1
                """
            ),
            {"ts": tf_start, "te": tf_end},
        ).mappings().first()
    if row and row.get("data"):
        try:
            stored = row["data"] if isinstance(row["data"], dict) else json.loads(row["data"])
            return stored
        except Exception:
            pass

    # Compute now and upsert
    start_dt = datetime.combine(tf_start, datetime.min.time())
    end_dt = datetime.combine(tf_end, datetime.max.time())
    payload = build_sanitized_payload(None, start_dt, end_dt)
    data, stored = InsightGenerationService.compute_and_store(
        db=db,
        user_id=None,
        timeframe_start=tf_start,
        timeframe_end=tf_end,
        payload=payload,
        insight_type="weekly",
    )
    return data


def _reports_weekly_insights(db: Session, range: str | None, start: Optional[str], end: Optional[str]) -> List[Dict[str, Any]]:
    start_dt, end_dt = parse_global_range(range or "this_week", start, end)
    insights: List[Dict[str, Any]] = []
    for ws, we in _collect_week_windows(start_dt, end_dt):
        data = _get_or_compute_weekly_insight(db, ws, we)
        insights.append(
            {
                "week_start": ws.isoformat(),
                "week_end": we.isoformat(),
                "event_name": None,
                "event_type": None,
                "title": str(data.get("title") or "Weekly Summary"),
                "description": str(data.get("summary") or ""),
                "recommendation": str(
                    data.get("recommendation")
                    or (data.get("recommendations", [""]) or [""])[0]
                ),
            }
        )
    return insights


def _reports_behavior_insights(db: Session, range: str | None, start: Optional[str], end: Optional[str]) -> List[Dict[str, Any]]:
    this_start, this_end = parse_global_range(range or "this_week", start, end)
    tf_start = this_start.date()
    tf_end = this_end.date()

    # Try read from ai_insights
    row = None
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT data FROM ai_insights
                WHERE user_id IS NULL AND type = 'behavioral'
                  AND timeframe_start = :ts AND timeframe_end = :te
                LIMIT 1
                """
            ),
            {"ts": tf_start, "te": tf_end},
        ).mappings().first()
    if row and row.get("data"):
        try:
            data = row["data"] if isinstance(row["data"], dict) else json.loads(row["data"])
        except Exception:
            data = None
    else:
        payload = build_sanitized_payload(None, this_start, this_end)
        data, _ = InsightGenerationService.compute_and_store(
            db=db,
            user_id=None,
            timeframe_start=tf_start,
            timeframe_end=tf_end,
            payload=payload,
            insight_type="behavioral",
        )

    if not data:
        return []

    insights: List[Dict[str, Any]] = []

    # 1) Recurring Emotional Patterns
    patterns = data.get("recurring_emotional_patterns") or []
    insights.append(
        {
            "title": "Recurring Emotional Patterns",
            "description": "Top recurring emotional patterns detected in the selected period.",
            "metrics": [{"label": str(p), "value": "present"} for p in patterns[:6]],
        }
    )

    # 2) Irregular Changes
    irr = data.get("irregular_changes") or []
    insights.append(
        {
            "title": "Irregular Mood Changes",
            "description": f"Detected {len(irr)} large day-to-day mood swings (>= 15 points).",
            "metrics": [
                {"label": str(i.get("date")), "value": f"Δ {i.get('delta')}"}
                for i in irr[:5]
            ],
        }
    )

    # 3) Risk Flags
    rf = data.get("risk_flags") or {}
    insights.append(
        {
            "title": "Risk Flags",
            "description": "Key risk indicators for the selected period.",
            "metrics": [
                {"label": "Negative sentiment ratio", "value": f"{rf.get('negative_sentiment_ratio_percent', 0)}%"},
                {"label": "High-stress days", "value": rf.get("high_stress_days", 0)},
                {"label": "Late-night journals", "value": rf.get("late_night_journals", 0)},
            ],
        }
    )

    # 4) Behavioral Clusters
    bc = data.get("behavioral_clusters") or {}
    tod = bc.get("time_of_day") or {}
    dow = bc.get("day_of_week") or {}
    dow_names = {0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun"}
    cluster_metrics = [
        *[{"label": f"TOD: {k}", "value": v} for k, v in list(tod.items())[:4]],
        *[{"label": f"DOW: {dow_names.get(int(k), str(k))}", "value": v} for k, v in list(dow.items())[:4]],
    ]
    insights.append(
        {
            "title": "Behavioral Clusters",
            "description": "Time-of-day and day-of-week activity distributions.",
            "metrics": cluster_metrics,
        }
    )

    return insights

@app.get("/api/reports/weekly-insights")
def weekly_insights(
    range: str = Query("this_week"),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Delegate to CounselorReportService for privacy-aware weekly wellness insights.
    # The current implementation ignores explicit range/start/end values and always
    # computes relative to the current week window.
    return CounselorReportService.weekly_insights(db)


@app.get("/api/reports/behavior-insights")
def behavior_insights(
    range: str = Query("this_week"),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Delegate to CounselorReportService for behavioral stress/journaling insights.
    # As with weekly_insights, date-range query parameters are currently unused and
    # the service computes insights for this week vs last week.
    return CounselorReportService.behavior_insights(db)


@app.get("/api/ai/sentiment-summary")
def ai_sentiment_summary(
    period: str = Query("month", enum=["week", "month", "year"]),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    days_map = {"week": 7, "month": 30, "year": 365}
    days = days_map.get(period, 30)
    return NarrativeInsightService.behavior_highlights(db, days=days)


@app.get("/api/ai/mood-summary")
def ai_mood_summary(
    period: str = Query("month", enum=["week", "month", "year"]),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    days_map = {"week": 7, "month": 30, "year": 365}
    days = days_map.get(period, 30)
    return NarrativeInsightService.mood_shift_summary(db, days=days)
@app.get("/api/events")
def list_events(current_user: str = Depends(get_current_user)):
    return _load_events()


@app.post("/api/calendar/upload")
async def upload_calendar(file: UploadFile):

    content = await file.read()

    events = _extract_events_from_file(file.filename, content)
    if not events:
        return {"status": "uploaded", "events_extracted": 0}

    try:
        with EVENTS_FILE.open("w", encoding="utf-8") as f:
            json.dump(events, f, indent=2)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to persist events")

    return {"status": "uploaded", "events_extracted": len(events)}


@app.get("/api/reports/top-stats")
def get_top_stats(
    range: Optional[str] = Query(None),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    current_user: str = Depends(get_current_user),
):
    # Apply the global date filter window to time-based metrics (alerts and wellness),
    # while total_students and active_users remain global counts.
    start_dt, end_dt = parse_global_range(range or "this_week", start, end)

    q_totals = text(
        """
        SELECT 
            (SELECT COUNT(*) FROM user WHERE role = 'student') AS total_students,
            (SELECT COUNT(*) FROM user WHERE is_active = TRUE) AS active_users
        """
    )

    q_at_risk = text(
        """
        SELECT COUNT(*) AS at_risk_students
        FROM alert
        WHERE severity IN ('high','critical')
          AND status = 'open'
          AND created_at >= :start
          AND created_at <= :end
        """
    )

    q_wellness = text(
        """
        SELECT ROUND(AVG(
            CASE mood_level
                WHEN 'Very Sad' THEN 1
                WHEN 'Sad' THEN 2
                WHEN 'Neutral' THEN 3
                WHEN 'Good' THEN 4
                WHEN 'Happy' THEN 5
                WHEN 'Very Happy' THEN 6
                WHEN 'Excellent' THEN 7
                ELSE NULL
            END
        ), 2) AS avg_wellness_score
        FROM emotional_checkin
        WHERE created_at >= :start
          AND created_at <= :end
        """
    )

    with engine.connect() as conn:
        totals_row = conn.execute(q_totals).mappings().first()
        at_risk_row = conn.execute(
            q_at_risk,
            {"start": start_dt.strftime("%Y-%m-%d %H:%M:%S"), "end": end_dt.strftime("%Y-%m-%d %H:%M:%S")},
        ).mappings().first()
        wellness_row = conn.execute(
            q_wellness,
            {"start": start_dt.strftime("%Y-%m-%d %H:%M:%S"), "end": end_dt.strftime("%Y-%m-%d %H:%M:%S")},
        ).mappings().first()

        return {
            "total_students": totals_row["total_students"],
            "active_users": totals_row["active_users"],
            "at_risk_students": at_risk_row["at_risk_students"] if at_risk_row else 0,
            "avg_wellness_score": float(wellness_row["avg_wellness_score"] or 0) if wellness_row else 0.0,
        }


@app.get("/api/reports/attention")
def get_attention_students(
    range: Optional[str] = Query(None),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
):
    # Restrict attention list to alerts and check-ins within the selected window.
    start_dt, end_dt = parse_global_range(range or "this_week", start, end)

    query = text(
        """
        SELECT 
            u.user_id,
            u.name,
            COALESCE(a.severity, 'low') AS risk,
            ROUND(AVG(
                CASE e.mood_level
                    WHEN 'Very Sad' THEN 1
                    WHEN 'Sad' THEN 2
                    WHEN 'Neutral' THEN 3
                    WHEN 'Good' THEN 4
                    WHEN 'Happy' THEN 5
                    WHEN 'Very Happy' THEN 6
                    WHEN 'Excellent' THEN 7
                    ELSE NULL
                END
            ), 1) AS score,
            (SELECT name FROM user WHERE user_id = a.assigned_to) AS counselor,
            MAX(a.created_at) AS last_contact,
            GROUP_CONCAT(DISTINCT a.reason SEPARATOR ', ') AS concerns
        FROM user u
        LEFT JOIN alert a ON u.user_id = a.user_id AND a.status = 'open'
        LEFT JOIN emotional_checkin e ON u.user_id = e.user_id
            AND e.created_at >= :start AND e.created_at <= :end
        WHERE u.role = 'student'
          AND (a.created_at IS NULL OR (a.created_at >= :start AND a.created_at <= :end))
        GROUP BY u.user_id, u.name, a.severity, a.assigned_to
        HAVING risk != 'low'
        ORDER BY score ASC
        LIMIT 10
        """
    )

    params = {
        "start": start_dt.strftime("%Y-%m-%d %H:%M:%S"),
        "end": end_dt.strftime("%Y-%m-%d %H:%M:%S"),
    }

    with engine.connect() as conn:
        result = conn.execute(query, params).mappings()
        return [
            {
                "user_id": row["user_id"],
                "name": row["name"],
                "risk": row["risk"].capitalize(),
                "score": f"{row['score'] or 0}/10",
                "counselor": row["counselor"] or "Unassigned",
                "last_contact": row["last_contact"].strftime("%B %d, %Y") if row["last_contact"] else "",
                "concerns": row["concerns"].split(", ") if row["concerns"] else [],
            }
            for row in result
        ]


@app.get("/api/reports/concerns")
def get_concerns(period: str = Query("month", enum=["week", "month"])):
    now = datetime.now()
    if period == "week":
        start = now - timedelta(days=7)
    else:
        start = now.replace(day=1)

    # Attempt to aggregate emotions (comma-separated) from journal_sentiment and checkin_sentiment
    emotions_sql = text(
        """
        SELECT label, COUNT(*) AS students
        FROM (
            SELECT LOWER(TRIM(SUBSTRING_INDEX(js.emotions, ',', 1))) AS label
            FROM journal_sentiment js
            JOIN journal j ON j.journal_id = js.journal_id
            WHERE j.created_at >= :date AND js.emotions IS NOT NULL AND js.emotions <> ''
            UNION ALL
            SELECT LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(js.emotions, ',', 2), ',', -1)))
            FROM journal_sentiment js
            JOIN journal j ON j.journal_id = js.journal_id
            WHERE j.created_at >= :date AND js.emotions LIKE '%,%'
            UNION ALL
            SELECT LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(js.emotions, ',', 3), ',', -1)))
            FROM journal_sentiment js
            JOIN journal j ON j.journal_id = js.journal_id
            WHERE j.created_at >= :date AND js.emotions LIKE '%,%,%'
            UNION ALL
            SELECT LOWER(TRIM(SUBSTRING_INDEX(cs.emotions, ',', 1)))
            FROM checkin_sentiment cs
            JOIN emotional_checkin ec ON ec.checkin_id = cs.checkin_id
            WHERE ec.created_at >= :date AND cs.emotions IS NOT NULL AND cs.emotions <> ''
            UNION ALL
            SELECT LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(cs.emotions, ',', 2), ',', -1)))
            FROM checkin_sentiment cs
            JOIN emotional_checkin ec ON ec.checkin_id = cs.checkin_id
            WHERE ec.created_at >= :date AND cs.emotions LIKE '%,%'
            UNION ALL
            SELECT LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(cs.emotions, ',', 3), ',', -1)))
            FROM checkin_sentiment cs
            JOIN emotional_checkin ec ON ec.checkin_id = cs.checkin_id
            WHERE ec.created_at >= :date AND cs.emotions LIKE '%,%,%'
        ) t
        WHERE t.label IS NOT NULL AND t.label <> ''
        GROUP BY label
        ORDER BY students DESC
        LIMIT 5
        """
    )

    sentiments_sql = text(
        """
        SELECT label, COUNT(*) AS students FROM (
            SELECT LOWER(js.sentiment) AS label
            FROM journal_sentiment js
            JOIN journal j ON j.journal_id = js.journal_id
            WHERE j.created_at >= :date
            UNION ALL
            SELECT LOWER(cs.sentiment)
            FROM checkin_sentiment cs
            JOIN emotional_checkin ec ON ec.checkin_id = cs.checkin_id
            WHERE ec.created_at >= :date
        ) s
        GROUP BY label
        ORDER BY students DESC
        LIMIT 5
        """
    )

    with engine.connect() as conn:
        # Try emotions within requested period
        params = {"date": start.strftime('%Y-%m-%d %H:%M:%S')}
        rows = list(conn.execute(emotions_sql, params).mappings())
        # Fallback to sentiments within requested period
        if not rows:
            rows = list(conn.execute(sentiments_sql, params).mappings())
        # Final fallback: widen window to last 90 days
        if not rows:
            wide_start = (now - timedelta(days=90)).strftime('%Y-%m-%d %H:%M:%S')
            rows = list(conn.execute(emotions_sql, {"date": wide_start}).mappings())
            if not rows:
                rows = list(conn.execute(sentiments_sql, {"date": wide_start}).mappings())
        # Proxy fallback: top alert reasons (last 90 days)
        if not rows:
            alerts_q = text(
                """
                SELECT LOWER(TRIM(reason)) AS label, COUNT(*) AS students
                FROM alert
                WHERE created_at >= :date AND reason IS NOT NULL AND reason <> ''
                GROUP BY LOWER(TRIM(reason))
                ORDER BY students DESC
                LIMIT 5
                """
            )
            rows = list(conn.execute(alerts_q, {"date": (now - timedelta(days=90)).strftime('%Y-%m-%d %H:%M:%S')}).mappings())

        total = sum(int(r["students"]) for r in rows)
        return [
            {
                "label": (r["label"] or "").strip(),
                "students": int(r["students"]),
                "percent": round((int(r["students"]) / total) * 100, 1) if total > 0 else 0,
            }
            for r in rows
        ]


@app.get("/api/reports/interventions")
def get_interventions(period: str = Query("month", enum=["week", "month"])):
    now = datetime.now()
    if period == "week":
        start = now - timedelta(days=7)
    else:
        start = now.replace(day=1)

    summary_q = text(
        """
        SELECT 
          COUNT(*) AS total_alerts,
          SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved_alerts
        FROM alert
        WHERE created_at >= :date
        """
    )

    # Optional: by_type from intervention_log if table exists
    exists_q = text(
        """
        SELECT COUNT(*) AS cnt
        FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'intervention_log'
        """
    )
    by_type_q = text(
        """
        SELECT intervention_type AS label,
               COUNT(*) AS participants,
               ROUND(SUM(CASE WHEN outcome IN ('resolved','improved') THEN 1 ELSE 0 END)/COUNT(*)*100,1) AS percent
        FROM intervention_log
        WHERE started_at >= :date
        GROUP BY intervention_type
        ORDER BY participants DESC
        """
    )

    with engine.connect() as conn:
        s = conn.execute(summary_q, {"date": start.strftime('%Y-%m-%d %H:%M:%S')}).mappings().first()
        total_alerts = int(s["total_alerts"] or 0)
        resolved_alerts = int(s["resolved_alerts"] or 0)
        success_rate = round((resolved_alerts / total_alerts) * 100, 1) if total_alerts else 0.0

        has_intervention = conn.execute(exists_q).mappings().first()["cnt"] > 0
        by_type = []
        if has_intervention:
            by_type = [dict(row) for row in conn.execute(by_type_q, {"date": start.strftime('%Y-%m-%d %H:%M:%S')}).mappings()]
        else:
            # Fallback: derive by_type using appointment_log form_type (as proxy)
            fallback_q = text(
                """
                SELECT form_type AS label, COUNT(*) AS participants
                FROM appointment_log
                WHERE downloaded_at >= :date
                GROUP BY form_type
                ORDER BY participants DESC
                """
            )
            rows = conn.execute(fallback_q, {"date": start.strftime('%Y-%m-%d %H:%M:%S')}).mappings()
            total = sum(int(r["participants"]) for r in rows)
            # Re-run to iterate again
            rows = conn.execute(fallback_q, {"date": start.strftime('%Y-%m-%d %H:%M:%S')}).mappings()
            by_type = [
                {
                    "label": r["label"],
                    "participants": int(r["participants"]),
                    "percent": round((int(r["participants"]) / total) * 100, 1) if total > 0 else 0,
                }
                for r in rows
            ]

        return {
            "summary": {
                "total_alerts": total_alerts,
                "resolved_alerts": resolved_alerts,
                "success_rate": success_rate,
            },
            "by_type": by_type,
            "sentiment_change": []  # Optional: populate with advanced analysis later
        }

@app.get("/api/reports/participation")
def get_participation():
    query_total = "SELECT COUNT(*) AS total FROM user WHERE role='student'"
    query_submitted = """
        SELECT COUNT(DISTINCT user_id) AS submitted 
        FROM emotional_checkin
        WHERE created_at >= CURDATE()
    """
    with engine.connect() as conn:
        total = conn.execute(text(query_total)).mappings().first()["total"]
        submitted = conn.execute(text(query_submitted)).mappings().first()["submitted"]
        participation = round((submitted / total) * 100, 1) if total > 0 else 0
    return {"total": total, "submitted": submitted, "participation": participation}


class GenerateWeeklyInsightsRequest(BaseModel):
    user_id: Optional[int] = None
    week_start: date
    week_end: date


class GenerateBehavioralPatternsRequest(BaseModel):
    user_id: Optional[int] = None
    timeframe_start: date
    timeframe_end: date


def _require_internal(token: Optional[str]) -> None:
    if not settings.INSIGHTS_FEATURE_ENABLED:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Insights feature disabled")
    expected = settings.INTERNAL_API_TOKEN or ""
    if not expected or token != expected:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid internal token")


@app.post("/generate-weekly-insights")
def generate_weekly_insights(
    req: GenerateWeeklyInsightsRequest,
    x_internal_token: Optional[str] = Header(default=None, alias="X-Internal-Token"),
    db: Session = Depends(get_db),
):
    _require_internal(x_internal_token)
    # Build payload internally from DB
    start_dt = datetime.combine(req.week_start, datetime.min.time())
    end_dt = datetime.combine(req.week_end, datetime.max.time())
    payload = build_sanitized_payload(req.user_id, start_dt, end_dt)
    data, stored = InsightGenerationService.compute_and_store(
        db=db,
        user_id=req.user_id,
        timeframe_start=req.week_start,
        timeframe_end=req.week_end,
        payload=payload,
        insight_type="weekly",
    )
    if not stored:
        # Pass through insufficient-data style response
        return {"insight": None, "stored": False, **data}
    return {"insight": data, "stored": True}


@app.post("/generate-behavioral-patterns")
def generate_behavioral_patterns(
    req: GenerateBehavioralPatternsRequest,
    x_internal_token: Optional[str] = Header(default=None, alias="X-Internal-Token"),
    db: Session = Depends(get_db),
):
    _require_internal(x_internal_token)
    start_dt = datetime.combine(req.timeframe_start, datetime.min.time())
    end_dt = datetime.combine(req.timeframe_end, datetime.max.time())
    payload = build_sanitized_payload(req.user_id, start_dt, end_dt)
    data, stored = InsightGenerationService.compute_and_store(
        db=db,
        user_id=req.user_id,
        timeframe_start=req.timeframe_start,
        timeframe_end=req.timeframe_end,
        payload=payload,
        insight_type="behavioral",
    )
    if not stored:
        return {"insight": None, "stored": False, **data}
    return {"insight": data, "stored": True}

@app.get("/api/users/{user_id}")
def get_user(user_id: int):
    query = """
        SELECT user_id, name, nickname, role
        FROM user
        WHERE user_id = :uid
        LIMIT 1
    """
    with engine.connect() as conn:
        row = conn.execute(text(query), {"uid": user_id}).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        return {
            "user_id": row["user_id"],
            "name": row["name"],
            "nickname": row["nickname"],
            "role": row["role"],
        }


def _latest_insight_record(insight_type: str, user_id: Optional[int]) -> Optional[Dict[str, Any]]:
    base_sql = """
        SELECT insight_id, user_id, timeframe_start, timeframe_end, data, risk_level
        FROM ai_insights
        WHERE type = :type
    """
    params: Dict[str, Any] = {"type": insight_type}
    if user_id is None:
        sql = base_sql + " AND user_id IS NULL ORDER BY timeframe_end DESC LIMIT 1"
    else:
        sql = base_sql + " AND user_id = :uid ORDER BY timeframe_end DESC LIMIT 1"
        params["uid"] = user_id
    with engine.connect() as conn:
        row = conn.execute(text(sql), params).mappings().first()
        return dict(row) if row else None


@app.get("/api/insights/weekly")
@app.get("/api/insights/weekly/{user_id}")
def get_latest_weekly_insight(user_id: Optional[int] = None):
    rec = _latest_insight_record("weekly", user_id)
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No weekly insight found")
    return {
        "timeframe_start": rec["timeframe_start"].isoformat() if rec.get("timeframe_start") else None,
        "timeframe_end": rec["timeframe_end"].isoformat() if rec.get("timeframe_end") else None,
        "risk_level": rec.get("risk_level"),
        "data": rec.get("data"),
    }


@app.get("/api/insights/behavioral")
@app.get("/api/insights/behavioral/{user_id}")
def get_latest_behavioral_insight(user_id: Optional[int] = None):
    rec = _latest_insight_record("behavioral", user_id)
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No behavioral insight found")
    return {
        "timeframe_start": rec["timeframe_start"].isoformat() if rec.get("timeframe_start") else None,
        "timeframe_end": rec["timeframe_end"].isoformat() if rec.get("timeframe_end") else None,
        "risk_level": rec.get("risk_level"),
        "data": rec.get("data"),
    }
    
# --- Dashboard: Appointment Logs ---
@app.get("/api/appointment-logs")
def get_appointment_logs(
    user_id: Optional[int] = Query(None),
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(100, ge=1, le=1000),
):
    """Return recent appointment form download logs.
    - Filters: optional user_id; time window by `days` back from now.
    - Limited to `limit` rows, newest first.
    """
    where = ["downloaded_at >= DATE_SUB(NOW(), INTERVAL :days DAY)"]
    params = {"days": days, "limit": limit}
    if user_id is not None:
        where.append("user_id = :uid")
        params["uid"] = user_id

    query = f"""
        SELECT log_id, user_id, form_type, downloaded_at, remarks
        FROM appointment_log
        WHERE {' AND '.join(where)}
        ORDER BY downloaded_at DESC
        LIMIT :limit
    """
    with engine.connect() as conn:
        rows = conn.execute(text(query), params).mappings()
        return [
            {
                "log_id": r["log_id"],
                "user_id": r["user_id"],
                "form_type": r["form_type"],
                "downloaded_at": r["downloaded_at"].strftime("%Y-%m-%d %H:%M:%S") if r["downloaded_at"] else None,
                "remarks": r["remarks"],
            }
            for r in rows
        ]


# --- Dashboard: User Activities (appointments) ---
@app.get("/api/user-activities")
def get_user_activities(
    target_type: Optional[str] = Query(None, description="Filter by target_type, e.g., 'appointment' or 'form'"),
    action: Optional[str] = Query(None, description="Filter by action, e.g., 'open', 'downloaded_form'"),
    user_id: Optional[int] = Query(None),
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(100, ge=1, le=1000),
):
    """Return recent user activities, optionally filtered.
    Defaults to the last 30 days and returns up to `limit` records.
    """
    where = ["created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)"]
    params = {"days": days, "limit": limit}
    if target_type:
        where.append("target_type = :tt")
        params["tt"] = target_type
    if action:
        where.append("action = :ac")
        params["ac"] = action
    if user_id is not None:
        where.append("user_id = :uid")
        params["uid"] = user_id

    query = f"""
        SELECT activity_id, user_id, action, target_type, target_id,
               started_at, ended_at, duration_seconds, created_at
        FROM user_activities
        WHERE {' AND '.join(where)}
        ORDER BY created_at DESC
        LIMIT :limit
    """
    with engine.connect() as conn:
        rows = conn.execute(text(query), params).mappings()
        return [
            {
                "activity_id": r["activity_id"],
                "user_id": r["user_id"],
                "action": r["action"],
                "target_type": r["target_type"],
                "target_id": r["target_id"],
                "started_at": r["started_at"].strftime("%Y-%m-%d %H:%M:%S") if r["started_at"] else None,
                "ended_at": r["ended_at"].strftime("%Y-%m-%d %H:%M:%S") if r["ended_at"] else None,
                "duration_seconds": r["duration_seconds"],
                "created_at": r["created_at"].strftime("%Y-%m-%d %H:%M:%S") if r["created_at"] else None,
            }
            for r in rows
        ]


# --- Counselor profile ---
@app.get("/api/counselor-profile")
def get_counselor_profile(
    user_id: int = Query(...),
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    profile = CounselorService.get_profile(db, user_id=user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Counselor not found")
    return profile

@app.put("/api/counselor-profile")
def update_counselor_profile(
    user_id: int = Query(...),
    profile_in: CounselorProfilePayload = None,
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    payload = profile_in or CounselorProfilePayload()
    try:
        updated = CounselorService.update_profile(db, user_id=user_id, payload=payload)
        return updated
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# Run with: 
# For Windows: venv\Scripts\activate 
# For Mac: source .venv/bin/activate
# uvicorn main:app --reload --port 8001
