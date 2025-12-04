"""Automated insight generation service.

Monitors data accumulation and generates insights when sufficient data exists.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.models.ai_insight import AIInsight
from app.models.checkin_sentiment import CheckinSentiment
from app.models.emotional_checkin import EmotionalCheckin
from app.models.journal import Journal
from app.models.journal_sentiment import JournalSentiment
from app.models.user import User, UserRole


class AutoInsightService:
    """Automatically generate insights when enough data is available."""
    
    # Minimum data requirements for insight generation
    MIN_CHECKINS = 3
    MIN_JOURNALS = 2
    MIN_TOTAL_ENTRIES = 5  # Combined check-ins + journals
    
    @classmethod
    def check_and_generate_weekly_insights(cls, db: Session) -> int:
        """Check all students and generate weekly insights if enough data exists.
        
        Returns:
            Number of insights generated
        """
        generated_count = 0
        
        # Get current ISO week bounds (Monday to Sunday)
        today = datetime.utcnow().date()
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)
        
        week_start_dt = datetime.combine(week_start, datetime.min.time())
        week_end_dt = datetime.combine(week_end, datetime.max.time())
        
        # Get all active students
        students = db.scalars(
            select(User).where(
                User.role == UserRole.student,
                User.is_active.is_(True)
            )
        ).all()
        
        for student in students:
            try:
                # Check if insight already exists for this week
                existing = db.scalar(
                    select(AIInsight).where(
                        AIInsight.user_id == student.user_id,
                        AIInsight.type == 'weekly',
                        AIInsight.timeframe_start == week_start,
                        AIInsight.timeframe_end == week_end
                    )
                )
                
                if existing:
                    continue  # Already generated
                
                # Check data availability
                if cls._has_sufficient_data(db, student.user_id, week_start_dt, week_end_dt):
                    # Generate insight
                    insight_data = cls._generate_weekly_insight_data(
                        db, student.user_id, week_start_dt, week_end_dt
                    )
                    
                    if insight_data:
                        # Create AI insight record
                        new_insight = AIInsight(
                            user_id=student.user_id,
                            type='weekly',
                            timeframe_start=week_start,
                            timeframe_end=week_end,
                            data=insight_data['data'],
                            risk_level=insight_data['risk_level'],
                            generated_by='auto_insight_service'
                        )
                        db.add(new_insight)
                        db.commit()
                        generated_count += 1
                        logging.info(
                            f"[AutoInsight] Generated weekly insight for user {student.user_id} "
                            f"({week_start} to {week_end})"
                        )
            except Exception as e:
                logging.error(f"[AutoInsight] Error generating insight for user {student.user_id}: {e}")
                db.rollback()
                continue
        
        return generated_count
    
    @classmethod
    def _has_sufficient_data(
        cls,
        db: Session,
        user_id: int,
        start_dt: datetime,
        end_dt: datetime
    ) -> bool:
        """Check if user has enough data for insight generation."""
        
        # Count check-ins
        checkin_count = db.scalar(
            select(func.count(EmotionalCheckin.checkin_id)).where(
                and_(
                    EmotionalCheckin.user_id == user_id,
                    EmotionalCheckin.created_at >= start_dt,
                    EmotionalCheckin.created_at <= end_dt
                )
            )
        ) or 0
        
        # Count journals
        journal_count = db.scalar(
            select(func.count(Journal.journal_id)).where(
                and_(
                    Journal.user_id == user_id,
                    Journal.created_at >= start_dt,
                    Journal.created_at <= end_dt,
                    Journal.deleted_at.is_(None)
                )
            )
        ) or 0
        
        # Check minimum requirements
        has_min_checkins = checkin_count >= cls.MIN_CHECKINS
        has_min_journals = journal_count >= cls.MIN_JOURNALS
        has_min_total = (checkin_count + journal_count) >= cls.MIN_TOTAL_ENTRIES
        
        # Need either minimum check-ins OR minimum journals, AND minimum total
        return (has_min_checkins or has_min_journals) and has_min_total
    
    @classmethod
    def _generate_weekly_insight_data(
        cls,
        db: Session,
        user_id: int,
        start_dt: datetime,
        end_dt: datetime
    ) -> Optional[dict]:
        """Generate insight data for a user's week.
        
        Returns:
            Dict with 'data' and 'risk_level' keys, or None if generation fails
        """
        try:
            # Gather check-in data
            checkins = db.scalars(
                select(EmotionalCheckin).where(
                    and_(
                        EmotionalCheckin.user_id == user_id,
                        EmotionalCheckin.created_at >= start_dt,
                        EmotionalCheckin.created_at <= end_dt
                    )
                )
            ).all()
            
            # Gather journal data
            journals = db.scalars(
                select(Journal).where(
                    and_(
                        Journal.user_id == user_id,
                        Journal.created_at >= start_dt,
                        Journal.created_at <= end_dt,
                        Journal.deleted_at.is_(None)
                    )
                )
            ).all()
            
            # Get sentiment data
            checkin_sentiments = db.scalars(
                select(CheckinSentiment).join(
                    EmotionalCheckin,
                    CheckinSentiment.checkin_id == EmotionalCheckin.checkin_id
                ).where(
                    and_(
                        EmotionalCheckin.user_id == user_id,
                        EmotionalCheckin.created_at >= start_dt,
                        EmotionalCheckin.created_at <= end_dt
                    )
                )
            ).all()
            
            journal_sentiments = db.scalars(
                select(JournalSentiment).join(
                    Journal,
                    JournalSentiment.journal_id == Journal.journal_id
                ).where(
                    and_(
                        Journal.user_id == user_id,
                        Journal.created_at >= start_dt,
                        Journal.created_at <= end_dt,
                        Journal.deleted_at.is_(None)
                    )
                )
            ).all()
            
            # Calculate metrics
            mood_scores = []
            stress_levels = []
            energy_levels = []
            
            for checkin in checkins:
                if checkin.mood_level:
                    mood_scores.append(cls._mood_to_score(str(checkin.mood_level)))
                if checkin.stress_level:
                    stress_levels.append(str(checkin.stress_level))
                if checkin.energy_level:
                    energy_levels.append(str(checkin.energy_level))
            
            # Sentiment breakdown
            sentiment_counts = {'positive': 0, 'neutral': 0, 'negative': 0}
            for sent in list(checkin_sentiments) + list(journal_sentiments):
                sentiment = str(sent.sentiment).lower()
                if sentiment in sentiment_counts:
                    sentiment_counts[sentiment] += 1
            
            total_sentiments = sum(sentiment_counts.values())
            sentiment_breakdown = {
                k: round((v / total_sentiments * 100), 1) if total_sentiments > 0 else 0
                for k, v in sentiment_counts.items()
            }
            
            # Calculate average mood
            avg_mood = round(sum(mood_scores) / len(mood_scores), 1) if mood_scores else 50
            
            # Determine risk level
            risk_level = cls._calculate_risk_level(
                avg_mood,
                sentiment_breakdown,
                stress_levels,
                len(checkins),
                len(journals)
            )
            
            # Build insight data
            insight_data = {
                'summary': cls._generate_summary(avg_mood, sentiment_breakdown, risk_level),
                'mood_trends': {
                    'average_mood': avg_mood,
                    'trend': cls._determine_trend(mood_scores)
                },
                'sentiment_breakdown': sentiment_breakdown,
                'stress_patterns': {
                    'high_stress_count': sum(1 for s in stress_levels if 'High' in s),
                    'total_checkins': len(stress_levels)
                },
                'metadata': {
                    'checkin_count': len(checkins),
                    'journal_count': len(journals),
                    'risk_level': risk_level,
                    'generated_at': datetime.utcnow().isoformat()
                }
            }
            
            return {
                'data': insight_data,
                'risk_level': risk_level
            }
            
        except Exception as e:
            logging.error(f"[AutoInsight] Error generating insight data: {e}")
            return None
    
    @staticmethod
    def _mood_to_score(mood: str) -> int:
        """Convert mood level to numeric score."""
        mood_map = {
            'Terrible': 11, 'Bad': 22, 'Upset': 33, 'Anxious': 44,
            'Meh': 55, 'Okay': 66, 'Great': 77, 'Loved': 88, 'Awesome': 100
        }
        return mood_map.get(mood, 50)
    
    @staticmethod
    def _calculate_risk_level(
        avg_mood: float,
        sentiment_breakdown: dict,
        stress_levels: list,
        checkin_count: int,
        journal_count: int
    ) -> str:
        """Calculate risk level based on metrics."""
        risk_score = 0
        
        # Low mood increases risk
        if avg_mood < 40:
            risk_score += 3
        elif avg_mood < 55:
            risk_score += 1
        
        # High negative sentiment increases risk
        if sentiment_breakdown.get('negative', 0) > 50:
            risk_score += 3
        elif sentiment_breakdown.get('negative', 0) > 30:
            risk_score += 1
        
        # High stress increases risk
        high_stress_ratio = sum(1 for s in stress_levels if 'High' in s) / max(len(stress_levels), 1)
        if high_stress_ratio > 0.5:
            risk_score += 2
        
        # Determine level
        if risk_score >= 5:
            return 'critical'
        elif risk_score >= 3:
            return 'high'
        elif risk_score >= 1:
            return 'medium'
        else:
            return 'low'
    
    @staticmethod
    def _determine_trend(mood_scores: list) -> str:
        """Determine if mood is improving, worsening, or stable."""
        if len(mood_scores) < 2:
            return 'stable'
        
        first_half = mood_scores[:len(mood_scores)//2]
        second_half = mood_scores[len(mood_scores)//2:]
        
        avg_first = sum(first_half) / len(first_half)
        avg_second = sum(second_half) / len(second_half)
        
        diff = avg_second - avg_first
        
        if diff > 10:
            return 'improving'
        elif diff < -10:
            return 'worsening'
        else:
            return 'stable'
    
    @staticmethod
    def _generate_summary(avg_mood: float, sentiment_breakdown: dict, risk_level: str) -> str:
        """Generate a text summary of the week."""
        mood_desc = "positive" if avg_mood >= 66 else "neutral" if avg_mood >= 45 else "concerning"
        dominant_sentiment = max(sentiment_breakdown.items(), key=lambda x: x[1])[0]
        
        return (
            f"This week showed {mood_desc} mood patterns with predominantly {dominant_sentiment} sentiment. "
            f"Risk level: {risk_level}."
        )
    
    @classmethod
    def cleanup_old_insights(cls, db: Session, weeks_old: int = 3) -> int:
        """Delete insights older than specified weeks.
        
        Returns:
            Number of insights deleted
        """
        cutoff_date = datetime.utcnow() - timedelta(weeks=weeks_old)
        
        try:
            deleted = db.query(AIInsight).filter(
                AIInsight.generated_at < cutoff_date
            ).delete(synchronize_session=False)
            db.commit()
            
            if deleted > 0:
                logging.info(f"[AutoInsight] Deleted {deleted} old insights (older than {weeks_old} weeks)")
            
            return deleted
        except Exception as e:
            logging.error(f"[AutoInsight] Error cleaning up old insights: {e}")
            db.rollback()
            return 0
