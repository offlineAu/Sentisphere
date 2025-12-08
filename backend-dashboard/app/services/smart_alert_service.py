"""
Smart Alert Service

Triggers alerts based on:
1. Consecutive negative check-ins (2-3 in a row)
2. Cumulative negative sentiment threshold
3. Distress keyword detection

Alerts are resolved when:
1. Notification is successfully sent to student
2. Conversation with counselor has positive flow
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List, Tuple

from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import Session

from app.models.alert import Alert, AlertSeverity, AlertStatus
from app.models.emotional_checkin import EmotionalCheckin
from app.models.checkin_sentiment import CheckinSentiment
from app.models.journal_sentiment import JournalSentiment
from app.models.notification import Notification
from app.models.conversations import Conversation, ConversationStatus
from app.models.messages import Message
from app.schemas.alert import AlertCreate

logger = logging.getLogger(__name__)

# Configuration
CONSECUTIVE_NEGATIVE_THRESHOLD = 2  # Trigger after 2 consecutive negative check-ins
SENTIMENT_SCORE_THRESHOLD = -0.6  # Cumulative sentiment score threshold
NEGATIVE_MOOD_LEVELS = ["Terrible", "Bad", "Upset", "Anxious", "Very Sad", "Sad"]
HIGH_STRESS_LEVELS = ["High"]
LOW_ENERGY_LEVELS = ["Low"]

# Mood level to numeric score (lower = worse)
MOOD_SCORES = {
    "Terrible": 1, "Bad": 2, "Upset": 3, "Anxious": 4, "Meh": 5,
    "Okay": 6, "Great": 7, "Loved": 8, "Awesome": 9,
    "Very Sad": 1, "Sad": 2, "Neutral": 5, "Good": 6, "Happy": 7,
    "Very Happy": 8, "Excellent": 9
}

# ============================================================================
# CRISIS LANGUAGE DETECTION - Suicidal/Self-harm keywords
# English, Tagalog (Filipino), and Bisaya (Cebuano) supported
# ============================================================================
CRISIS_KEYWORDS = [
    # English - Direct mentions
    "kill myself", "end my life", "suicide", "suicidal", "hang myself",
    "want to die", "wanna die", "don't want to live", "dont want to live",
    "better off dead", "no reason to live", "end it all", "take my life",
    "cutting myself", "hurt myself", "self harm", "self-harm", "slit my wrist",
    "overdose", "jump off", "shoot myself", "drown myself",
    # English - Indirect/Passive
    "wish i was dead", "wish i were dead", "can't go on", "cant go on",
    "tired of living", "tired of life", "no point in living", "give up on life",
    "disappear forever", "never wake up", "not worth living", "why am i alive",
    "rather be dead", "hate my life", "hate being alive",
    # Tagalog (Filipino) - Direct
    "magpakamatay", "gusto ko nang mamatay", "ayaw ko nang mabuhay",
    "papatayin ko sarili ko", "puputulin ko ugat ko", "pagod na ako sa lahat",
    "wala na akong pakialam", "susuko na ako", "bebenta ko sarili ko",
    "lalunurin ko sarili ko", "bibitayin ko sarili ko",
    # Tagalog - Indirect
    "pagod na ako", "ayoko na", "suko na ako", "wala na akong pake",
    "bakit pa ako nabubuhay", "mas mabuti pang wala na ako",
    "sana hindi na ako magising", "para akong patay", "namamatay na ako sa loob",
    # Bisaya (Cebuano) - Direct
    "hikog", "gusto ko na maghikog", "maghikog nako", "hikogun nako akong kaugalingon",
    "matapos na ang lahat", "undangon nalang", "patyon nako akong kaugalingon",
    "sampolan nako akong kaugalingon", "putlon nako akong ugat",
    "gusto ko na mahuman ang tanan", "tuslok nako akong kaugalingon",
    # Bisaya - Indirect
    "kapoy nako", "pagod na ko sa tanan", "wala na koy paki", "gusto ko na mosuko",
    "ngano pa man ko buhi", "mas maayo pang wala nako",
    "ayaw ko na magpadayon", "murag patay nako sa sulod",
    "sana dili na ko mamata", "kapoy na kaayo ko sa kinabuhi",
    # Crisis phrases (mixed language)
    "jump off a bridge", "tulak sa tulay", "tumalon sa tulay",
    "not gonna make it", "di ko na kaya", "dili nako kaya",
]

# Strongly negative sentiment that may indicate crisis
STRONGLY_NEGATIVE_SENTIMENTS = ["strongly_negative", "very_negative", "crisis"]


class SmartAlertService:
    """Service for intelligent alert triggering and resolution."""

    @staticmethod
    def check_user_for_alert(
        db: Session,
        user_id: int,
        *,
        lookback_days: int = 7
    ) -> Optional[Dict[str, Any]]:
        """
        Check if a user should trigger an alert based on recent activity.
        
        Returns alert data if triggered, None otherwise.
        """
        cutoff = datetime.utcnow() - timedelta(days=lookback_days)
        
        # Get recent check-ins ordered by date (newest first)
        checkins = list(db.scalars(
            select(EmotionalCheckin)
            .where(
                EmotionalCheckin.user_id == user_id,
                EmotionalCheckin.created_at >= cutoff
            )
            .order_by(EmotionalCheckin.created_at.desc())
            .limit(10)
        ))
        
        if len(checkins) < CONSECUTIVE_NEGATIVE_THRESHOLD:
            return None
        
        # Check for consecutive negative check-ins
        consecutive_negative = 0
        reasons = []
        
        for checkin in checkins:
            mood_str = checkin.mood_level.value if hasattr(checkin.mood_level, 'value') else str(checkin.mood_level)
            stress_str = checkin.stress_level.value if hasattr(checkin.stress_level, 'value') else str(checkin.stress_level)
            energy_str = checkin.energy_level.value if hasattr(checkin.energy_level, 'value') else str(checkin.energy_level)
            
            is_negative = (
                mood_str in NEGATIVE_MOOD_LEVELS or
                stress_str in HIGH_STRESS_LEVELS or
                energy_str in LOW_ENERGY_LEVELS
            )
            
            if is_negative:
                consecutive_negative += 1
                if mood_str in NEGATIVE_MOOD_LEVELS:
                    reasons.append(f"negative mood ({mood_str})")
                if stress_str in HIGH_STRESS_LEVELS:
                    reasons.append("high stress")
                if energy_str in LOW_ENERGY_LEVELS:
                    reasons.append("low energy")
            else:
                break  # Stop counting if we hit a non-negative check-in
        
        # Check if threshold met
        if consecutive_negative >= CONSECUTIVE_NEGATIVE_THRESHOLD:
            # Check if there's already an open alert for this user
            existing_alert = db.scalars(
                select(Alert)
                .where(
                    Alert.user_id == user_id,
                    Alert.status != AlertStatus.RESOLVED,
                    Alert.created_at >= cutoff
                )
            ).first()
            
            if existing_alert:
                logger.info(f"User {user_id} already has open alert {existing_alert.alert_id}")
                return None
            
            # Determine severity based on count
            if consecutive_negative >= 4:
                severity = AlertSeverity.HIGH
            elif consecutive_negative >= 3:
                severity = AlertSeverity.MEDIUM
            else:
                severity = AlertSeverity.LOW
            
            unique_reasons = list(set(reasons))[:3]
            reason_text = f"{consecutive_negative} consecutive concerning check-ins: {', '.join(unique_reasons)}"
            
            return {
                "user_id": user_id,
                "severity": severity,
                "reason": reason_text,
                "consecutive_count": consecutive_negative,
                "trigger_type": "consecutive_negative"
            }
        
        return None

    @staticmethod
    def check_crisis_language(
        db: Session,
        user_id: int,
        *,
        lookback_days: int = 7
    ) -> Optional[Dict[str, Any]]:
        """
        Check for suicidal/crisis language in check-in comments and journals.
        Returns HIGH severity alert data if detected.
        """
        from app.models.journal import Journal
        
        cutoff = datetime.utcnow() - timedelta(days=lookback_days)
        matched_keywords = []
        matched_sources = []
        
        # Check recent check-in comments
        checkins = list(db.scalars(
            select(EmotionalCheckin)
            .where(
                EmotionalCheckin.user_id == user_id,
                EmotionalCheckin.created_at >= cutoff,
                EmotionalCheckin.comment.isnot(None)
            )
        ))
        
        for checkin in checkins:
            comment = (checkin.comment or "").lower()
            for keyword in CRISIS_KEYWORDS:
                if keyword.lower() in comment:
                    matched_keywords.append(keyword)
                    matched_sources.append(f"check-in ({checkin.created_at.strftime('%Y-%m-%d')})")
                    break  # One match per entry is enough
        
        # Check recent journals
        journals = list(db.scalars(
            select(Journal)
            .where(
                Journal.user_id == user_id,
                Journal.created_at >= cutoff,
                Journal.deleted_at.is_(None)
            )
        ))
        
        for journal in journals:
            content = (journal.content or "").lower()
            for keyword in CRISIS_KEYWORDS:
                if keyword.lower() in content:
                    matched_keywords.append(keyword)
                    matched_sources.append(f"journal ({journal.created_at.strftime('%Y-%m-%d')})")
                    break
        
        if matched_keywords:
            # Check for existing alert
            existing = db.scalars(
                select(Alert)
                .where(
                    Alert.user_id == user_id,
                    Alert.status != AlertStatus.RESOLVED,
                    Alert.created_at >= cutoff
                )
            ).first()
            
            if existing:
                logger.info(f"User {user_id} already has open alert for crisis language")
                return None
            
            unique_keywords = list(set(matched_keywords))[:3]
            reason = f"CRISIS LANGUAGE DETECTED: '{', '.join(unique_keywords)}' found in {', '.join(matched_sources[:2])}"
            
            logger.warning(f"[CRISIS] User {user_id}: {reason}")
            
            return {
                "user_id": user_id,
                "severity": AlertSeverity.HIGH,  # Always HIGH for crisis language
                "reason": reason,
                "matched_keywords": unique_keywords,
                "trigger_type": "crisis_language"
            }
        
        return None

    @staticmethod
    def check_escalation_risk(
        db: Session,
        user_id: int,
        *,
        lookback_days: int = 7
    ) -> Optional[Dict[str, Any]]:
        """
        Predictive flagging: check if student may become high-risk based on patterns.
        Combines check-ins AND journals for comprehensive analysis.
        
        Triggers MEDIUM alert (warning) if:
        - 3+ consecutive negative check-ins OR
        - 2+ strongly negative journal sentiments OR
        - High stress streak (3+ days) combined with negative journals
        """
        from app.models.journal import Journal
        
        cutoff = datetime.utcnow() - timedelta(days=lookback_days)
        risk_factors = []
        
        # Factor 1: Check for negative check-in streak (not enough for full alert yet)
        checkins = list(db.scalars(
            select(EmotionalCheckin)
            .where(
                EmotionalCheckin.user_id == user_id,
                EmotionalCheckin.created_at >= cutoff
            )
            .order_by(EmotionalCheckin.created_at.desc())
            .limit(5)
        ))
        
        negative_streak = 0
        high_stress_days = 0
        for checkin in checkins:
            mood_str = checkin.mood_level.value if hasattr(checkin.mood_level, 'value') else str(checkin.mood_level)
            stress_str = checkin.stress_level.value if hasattr(checkin.stress_level, 'value') else str(checkin.stress_level)
            
            if mood_str in NEGATIVE_MOOD_LEVELS:
                negative_streak += 1
            else:
                break
            
            if stress_str in HIGH_STRESS_LEVELS or stress_str in ["Very High Stress", "Very High"]:
                high_stress_days += 1
        
        if negative_streak >= 3:
            risk_factors.append(f"{negative_streak} consecutive negative moods")
        
        if high_stress_days >= 3:
            risk_factors.append(f"{high_stress_days} high-stress days")
        
        # Factor 2: Check journal sentiments
        journal_sentiments = list(db.scalars(
            select(JournalSentiment)
            .join(Journal)
            .where(
                Journal.user_id == user_id,
                JournalSentiment.analyzed_at >= cutoff
            )
        ))
        
        strongly_negative_count = 0
        for js in journal_sentiments:
            sentiment = (js.sentiment or "").lower()
            if sentiment in ["negative", "strongly_negative", "very_negative"]:
                strongly_negative_count += 1
        
        if strongly_negative_count >= 2:
            risk_factors.append(f"{strongly_negative_count} negative journal entries")
        
        # Factor 3: Combined pattern (stress + negative journals)
        if high_stress_days >= 2 and strongly_negative_count >= 1:
            risk_factors.append("stress + negative journaling pattern")
        
        # Trigger if 2+ risk factors present
        if len(risk_factors) >= 2:
            existing = db.scalars(
                select(Alert)
                .where(
                    Alert.user_id == user_id,
                    Alert.status != AlertStatus.RESOLVED,
                    Alert.created_at >= cutoff
                )
            ).first()
            
            if existing:
                return None
            
            reason = f"ESCALATION WARNING: Possible high-risk trajectory - {'; '.join(risk_factors)}"
            
            logger.info(f"[ESCALATION RISK] User {user_id}: {reason}")
            
            return {
                "user_id": user_id,
                "severity": AlertSeverity.MEDIUM,  # Warning level
                "reason": reason,
                "risk_factors": risk_factors,
                "trigger_type": "escalation_risk"
            }
        
        return None

    @staticmethod
    def check_sentiment_threshold(
        db: Session,
        user_id: int,
        *,
        lookback_days: int = 7
    ) -> Optional[Dict[str, Any]]:
        """
        Check if user's cumulative sentiment score exceeds negative threshold.
        """
        cutoff = datetime.utcnow() - timedelta(days=lookback_days)
        
        # Get recent check-in sentiments
        checkin_sentiments = list(db.scalars(
            select(CheckinSentiment)
            .join(EmotionalCheckin)
            .where(
                EmotionalCheckin.user_id == user_id,
                CheckinSentiment.analyzed_at >= cutoff
            )
        ))
        
        # Get recent journal sentiments
        journal_sentiments = list(db.scalars(
            select(JournalSentiment)
            .where(JournalSentiment.analyzed_at >= cutoff)
        ))
        
        if not checkin_sentiments and not journal_sentiments:
            return None
        
        # Calculate weighted sentiment score
        total_score = 0.0
        count = 0
        
        for s in checkin_sentiments:
            sentiment = s.sentiment.lower() if s.sentiment else "neutral"
            confidence = float(s.confidence) if s.confidence else 0.5
            
            if sentiment == "negative":
                total_score -= confidence
            elif sentiment == "positive":
                total_score += confidence
            count += 1
        
        for s in journal_sentiments:
            sentiment = s.sentiment.lower() if s.sentiment else "neutral"
            confidence = float(s.confidence) if s.confidence else 0.5
            
            if sentiment == "negative":
                total_score -= confidence * 1.5  # Journals weighted higher
            elif sentiment == "positive":
                total_score += confidence * 1.5
            count += 1
        
        if count == 0:
            return None
        
        avg_score = total_score / count
        
        if avg_score <= SENTIMENT_SCORE_THRESHOLD:
            # Check for existing alert
            existing = db.scalars(
                select(Alert)
                .where(
                    Alert.user_id == user_id,
                    Alert.status != AlertStatus.RESOLVED,
                    Alert.created_at >= cutoff
                )
            ).first()
            
            if existing:
                return None
            
            severity = AlertSeverity.HIGH if avg_score <= -0.8 else AlertSeverity.MEDIUM
            
            return {
                "user_id": user_id,
                "severity": severity,
                "reason": f"Negative sentiment pattern detected (score: {avg_score:.2f})",
                "sentiment_score": avg_score,
                "trigger_type": "sentiment_threshold"
            }
        
        return None

    @staticmethod
    def create_smart_alert(
        db: Session,
        alert_data: Dict[str, Any],
        *,
        commit: bool = True
    ) -> Alert:
        """Create an alert from smart detection data."""
        alert = Alert(
            user_id=alert_data["user_id"],
            severity=alert_data["severity"],
            reason=alert_data["reason"],
            status=AlertStatus.OPEN
        )
        db.add(alert)
        if commit:
            db.commit()
            db.refresh(alert)
        else:
            db.flush()
        
        logger.info(f"Created smart alert {alert.alert_id} for user {alert_data['user_id']}: {alert_data['reason']}")
        return alert

    @staticmethod
    def resolve_alert_on_notification(
        db: Session,
        alert_id: int,
        *,
        commit: bool = True
    ) -> bool:
        """
        Mark alert as resolved when notification is successfully sent.
        """
        alert = db.get(Alert, alert_id)
        if not alert:
            return False
        
        if alert.status == AlertStatus.RESOLVED:
            return True
        
        alert.status = AlertStatus.RESOLVED
        alert.resolved_at = datetime.utcnow()
        db.add(alert)
        
        if commit:
            db.commit()
        
        logger.info(f"Alert {alert_id} resolved via notification")
        return True

    @staticmethod
    def check_conversation_for_resolution(
        db: Session,
        conversation_id: int,
        *,
        commit: bool = True
    ) -> Tuple[bool, Optional[int]]:
        """
        Check if a conversation indicates positive resolution.
        Returns (resolved, alert_id) if an alert was resolved.
        """
        conversation = db.get(Conversation, conversation_id)
        if not conversation:
            return False, None
        
        # Get the student's user_id
        student_id = conversation.initiator_user_id
        
        # Find any open alerts for this student
        open_alert = db.scalars(
            select(Alert)
            .where(
                Alert.user_id == student_id,
                Alert.status != AlertStatus.RESOLVED
            )
            .order_by(Alert.created_at.desc())
        ).first()
        
        if not open_alert:
            return False, None
        
        # Get recent messages in conversation
        messages = list(db.scalars(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.timestamp.desc())
            .limit(10)
        ))
        
        if len(messages) < 3:
            return False, None
        
        # Simple heuristic: if conversation has 3+ messages and is ended,
        # or has positive keywords, consider it resolved
        positive_keywords = ["thank", "better", "helped", "appreciate", "okay now", "feeling better"]
        
        has_positive_response = any(
            any(kw in (m.content or "").lower() for kw in positive_keywords)
            for m in messages
        )
        
        conversation_ended = conversation.status == ConversationStatus.ended
        
        if has_positive_response or (conversation_ended and len(messages) >= 5):
            open_alert.status = AlertStatus.RESOLVED
            open_alert.resolved_at = datetime.utcnow()
            db.add(open_alert)
            
            if commit:
                db.commit()
            
            logger.info(f"Alert {open_alert.alert_id} resolved via positive conversation {conversation_id}")
            return True, open_alert.alert_id
        
        return False, None

    @staticmethod
    def run_alert_check_for_all_users(
        db: Session,
        *,
        commit: bool = True
    ) -> List[Alert]:
        """
        Run alert checks for all users with recent activity.
        Returns list of newly created alerts.
        """
        cutoff = datetime.utcnow() - timedelta(days=7)
        
        # Get users with recent check-ins
        user_ids = list(db.scalars(
            select(EmotionalCheckin.user_id)
            .where(EmotionalCheckin.created_at >= cutoff)
            .distinct()
        ))
        
        new_alerts = []
        
        for user_id in user_ids:
            # Priority 1: Check for CRISIS LANGUAGE (highest priority - always HIGH severity)
            alert_data = SmartAlertService.check_crisis_language(db, user_id)
            if alert_data:
                alert = SmartAlertService.create_smart_alert(db, alert_data, commit=commit)
                new_alerts.append(alert)
                continue
            
            # Priority 2: Check consecutive negative check-ins
            alert_data = SmartAlertService.check_user_for_alert(db, user_id)
            if alert_data:
                alert = SmartAlertService.create_smart_alert(db, alert_data, commit=commit)
                new_alerts.append(alert)
                continue
            
            # Priority 3: Check sentiment threshold
            alert_data = SmartAlertService.check_sentiment_threshold(db, user_id)
            if alert_data:
                alert = SmartAlertService.create_smart_alert(db, alert_data, commit=commit)
                new_alerts.append(alert)
                continue
            
            # Priority 4: Check escalation risk (predictive flagging)
            alert_data = SmartAlertService.check_escalation_risk(db, user_id)
            if alert_data:
                alert = SmartAlertService.create_smart_alert(db, alert_data, commit=commit)
                new_alerts.append(alert)
        
        logger.info(f"Alert check complete: {len(new_alerts)} new alerts created")
        return new_alerts
