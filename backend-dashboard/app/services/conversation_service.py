from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.conversations import Conversation, ConversationStatus
from app.models.messages import Message
from app.schemas.conversation import (
    ConversationCreate,
    ConversationUpdate,
    MessageCreate,
)


class ConversationService:
    @staticmethod
    def list_conversations(
        db: Session,
        *,
        initiator_user_id: Optional[int] = None,
        include_messages: bool = False,
    ) -> List[Conversation]:
        stmt = select(Conversation).order_by(
            Conversation.last_activity_at.desc().nullslast(),
            Conversation.created_at.desc(),
        )
        if initiator_user_id is not None:
            stmt = stmt.where(Conversation.initiator_user_id == initiator_user_id)
        if include_messages:
            stmt = stmt.options(joinedload(Conversation.messages))
        return list(db.scalars(stmt))

    @staticmethod
    def get_conversation(db: Session, conversation_id: int, *, include_messages: bool = False) -> Optional[Conversation]:
        stmt = select(Conversation).where(Conversation.conversation_id == conversation_id)
        if include_messages:
            stmt = stmt.options(joinedload(Conversation.messages))
        return db.scalars(stmt).first()

    @staticmethod
    def create_conversation(db: Session, conversation_in: ConversationCreate, *, commit: bool = True) -> Conversation:
        conversation = Conversation(
            initiator_user_id=conversation_in.initiator_user_id,
            initiator_role=conversation_in.initiator_role,
            subject=conversation_in.subject,
            status=conversation_in.status,
            created_at=datetime.utcnow(),
            last_activity_at=datetime.utcnow(),
        )
        db.add(conversation)
        if commit:
            db.commit()
            db.refresh(conversation)
        else:
            db.flush()
        return conversation

    @staticmethod
    def update_conversation(
        db: Session,
        conversation: Conversation,
        conversation_in: ConversationUpdate,
        *,
        commit: bool = True,
    ) -> Conversation:
        for field, value in conversation_in.model_dump(exclude_unset=True).items():
            setattr(conversation, field, value)
        db.add(conversation)
        if commit:
            db.commit()
            db.refresh(conversation)
        else:
            db.flush()
        return conversation

    @staticmethod
    def add_message(
        db: Session,
        conversation: Conversation,
        message_in: MessageCreate,
        *,
        commit: bool = True,
    ) -> Message:
        timestamp = datetime.utcnow()
        message = Message(
            conversation_id=conversation.conversation_id,
            sender_id=message_in.sender_id,
            content=message_in.content,
            is_read=message_in.is_read or False,
            timestamp=timestamp,
        )
        db.add(message)
        conversation.last_activity_at = timestamp
        db.add(conversation)
        if commit:
            db.commit()
            db.refresh(message)
            db.refresh(conversation)
        else:
            db.flush()
        return message

    @staticmethod
    def list_messages(db: Session, conversation_id: int) -> List[Message]:
        stmt = (
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.timestamp.asc())
        )
        return list(db.scalars(stmt))

    @staticmethod
    def mark_conversation_read(
        db: Session,
        conversation_id: int,
        user_id: int,
        *,
        commit: bool = True,
    ) -> int:
        stmt = (
            select(Message)
            .where(
                Message.conversation_id == conversation_id,
                Message.sender_id != user_id,
                Message.is_read.is_(False),
            )
        )
        messages = list(db.scalars(stmt))
        for message in messages:
            message.is_read = True
            db.add(message)
        if commit:
            db.commit()
        else:
            db.flush()
        return len(messages)
