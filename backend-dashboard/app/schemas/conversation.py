from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.conversations import ConversationStatus


class MessageBase(BaseModel):
    content: str
    is_read: Optional[bool] = False


class Message(MessageBase):
    model_config = ConfigDict(from_attributes=True)

    message_id: int
    conversation_id: int
    sender_id: int
    timestamp: datetime


class MessageCreate(MessageBase):
    sender_id: int


class MessageSend(MessageBase):
    pass


class ConversationBase(BaseModel):
    subject: Optional[str] = None
    status: ConversationStatus = ConversationStatus.OPEN


class ConversationCreate(ConversationBase):
    initiator_user_id: int
    initiator_role: str


class ConversationStart(ConversationBase):
    pass


class ConversationUpdate(BaseModel):
    subject: Optional[str] = None
    status: Optional[ConversationStatus] = None
    last_activity_at: Optional[datetime] = None


class Conversation(ConversationBase):
    model_config = ConfigDict(from_attributes=True)

    conversation_id: int
    initiator_user_id: int
    initiator_role: str
    created_at: datetime
    last_activity_at: Optional[datetime] = None
    messages: List[Message] = Field(default_factory=list)
