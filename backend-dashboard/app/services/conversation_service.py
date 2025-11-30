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
        counselor_user_id: Optional[int] = None,
        include_messages: bool = False,
    ) -> List[Conversation]:
        # Order newest activity first
        stmt = select(Conversation).order_by(
            Conversation.last_activity_at.desc(),
            Conversation.created_at.desc(),
        )
        if initiator_user_id is not None:
            stmt = stmt.where(Conversation.initiator_user_id == initiator_user_id)
        if counselor_user_id is not None:
            # Show conversations explicitly assigned to this counselor
            stmt = stmt.where(Conversation.counselor_id == counselor_user_id)
        if include_messages:
            stmt = stmt.options(joinedload(Conversation.messages))
        # No JOINs -> no duplicate rows; still cast to list
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
            counselor_id=conversation_in.counselor_id,
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
        # Let the DB assign the timestamp via server_default=func.now() so it
        # matches the database clock (and mobile), then propagate that value
        # to the parent conversation's last_activity_at.
        message = Message(
            conversation_id=conversation.conversation_id,
            sender_id=message_in.sender_id,
            content=message_in.content,
            is_read=message_in.is_read or False,
        )
        db.add(message)
        # Flush so that server_defaults (e.g. timestamp) are populated on the ORM object
        db.flush()
        # Use the DB-assigned timestamp for conversation activity
        conversation.last_activity_at = message.timestamp
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

    @staticmethod
    def get_or_create_by_pair(
        db: Session,
        *,
        initiator_user_id: int,
        counselor_id: Optional[int],
        subject: Optional[str] = None,
        status: ConversationStatus = ConversationStatus.OPEN,
    ) -> Conversation:
        # Try find latest conversation for this student-counselor pair
        stmt = (
            select(Conversation)
            .where(
                Conversation.initiator_user_id == initiator_user_id,
                (Conversation.counselor_id == counselor_id)
                if counselor_id is not None
                else (Conversation.counselor_id.is_(None)),
            )
            .order_by(Conversation.last_activity_at.desc(), Conversation.created_at.desc())
        )
        existing = db.scalars(stmt).first()
        if existing:
            return existing
        # Create a new conversation
        conv = Conversation(
            initiator_user_id=initiator_user_id,
            initiator_role="student",
            subject=subject,
            counselor_id=counselor_id,
            status=status,
            created_at=datetime.utcnow(),
            last_activity_at=datetime.utcnow(),
        )
        db.add(conv)
        db.commit()
        db.refresh(conv)
        return conv
