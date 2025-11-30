from __future__ import annotations

import asyncio
import json
from typing import Dict, Set, Optional
from datetime import datetime
from fastapi import WebSocket


class ConversationWSManager:
    def __init__(self) -> None:
        self._subs: Dict[int, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            for ws_set in self._subs.values():
                if websocket in ws_set:
                    ws_set.discard(websocket)

    async def subscribe(self, websocket: WebSocket, conversation_id: int) -> None:
        async with self._lock:
            self._subs.setdefault(conversation_id, set()).add(websocket)

    async def unsubscribe(self, websocket: WebSocket, conversation_id: int) -> None:
        async with self._lock:
            ws_set = self._subs.get(conversation_id)
            if ws_set and websocket in ws_set:
                ws_set.discard(websocket)

    async def broadcast_message_created(self, conversation_id: int, message: dict) -> None:
        event = {
            "type": "message.created",
            "conversation_id": int(conversation_id),
            "message": message,
            "server_timestamp": datetime.utcnow().isoformat() + "Z",
        }
        await self._broadcast(conversation_id, event)

    async def broadcast_conversation_updated(self, conversation: dict) -> None:
        cid = int(conversation.get("conversation_id"))
        event = {
            "type": "conversation.updated",
            "conversation": conversation,
            "server_timestamp": datetime.utcnow().isoformat() + "Z",
        }
        await self._broadcast(cid, event)

    async def _broadcast(self, conversation_id: int, event: dict) -> None:
        # Copy subscribers snapshot to avoid holding the lock while sending
        async with self._lock:
            targets = list(self._subs.get(conversation_id, set()))
        if not targets:
            return
        payload = json.dumps(event, default=str, separators=(",", ":"))
        for ws in targets:
            try:
                await ws.send_text(payload)
            except Exception:
                # Drop broken connections silently
                await self.disconnect(ws)
