"""
Mental Health Sentiment & Emotion Analyzer for Sentisphere
============================================================
A context-aware, multilingual (Filipino/Cebuano/English) analyzer
designed specifically for mental health check-in text.

Key Features:
1. Lexicon-based Filipino/Cebuano stress detection
2. Coping humor detection (HAHAHA != genuine positivity)
3. User metadata integration (mood/stress/energy override)
4. Multi-label emotion detection
5. Post-processing contradiction prevention
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

from .filipino_lexicon import (
    STRESS_EXHAUSTION,
    COPING_PHRASES,
    PLEA_PHRASES,
    GENUINE_POSITIVE,
    INTENSIFIERS,
    DIMINISHERS,
    COPING_LAUGHTER_PATTERNS,
    is_coping_laughter,
    LexiconEntry,
)


@dataclass(slots=True)
class EmotionScore:
    """Individual emotion with score."""
    emotion: str
    score: float
    source: str  # "lexicon", "pattern", "metadata", "inference"


@dataclass(slots=True)
class AnalysisResult:
    """Complete analysis output matching Sentisphere spec."""
    sentiment: str  # "positive", "negative", "neutral", "mixed", "strongly_negative"
    dominant_emotion: str  # Main emotion detected
    emotions: List[str]  # List of detected emotion labels
    confidence: float
    model_version: str
    reasoning: str  # Explanation of classification logic
    emotion_scores: List[EmotionScore] = field(default_factory=list)  # Detailed scores
    flags: List[str] = field(default_factory=list)  # Special flags like "coping_humor"
    raw_scores: Dict[str, float] = field(default_factory=dict)


@dataclass(slots=True)
class UserContext:
    """User-reported emotional state from check-in."""
    mood_level: Optional[str] = None
    energy_level: Optional[str] = None
    stress_level: Optional[str] = None
    feel_better: Optional[str] = None


# =============================================================================
# MOOD/STRESS/ENERGY MAPPINGS
# =============================================================================

MOOD_TO_VALENCE: Dict[str, float] = {
    # Negative moods
    "Terrible": -1.0,
    "Bad": -0.8,
    "Upset": -0.7,
    "Anxious": -0.6,
    "Meh": -0.2,
    # Neutral
    "Okay": 0.0,
    # Positive moods
    "Great": 0.6,
    "Loved": 0.8,
    "Awesome": 1.0,
}

STRESS_TO_SCORE: Dict[str, float] = {
    "No Stress": 0.0,
    "Low Stress": 0.25,
    "Moderate": 0.5,
    "High Stress": 0.75,
    "Very High Stress": 1.0,
}

ENERGY_TO_SCORE: Dict[str, float] = {
    "Low": 0.0,
    "Moderate": 0.5,
    "High": 1.0,
}

FEEL_BETTER_TO_SCORE: Dict[str, float] = {
    "Yes": 1.0,
    "Same": 0.0,
    "No": -1.0,
}


class MentalHealthAnalyzer:
    """
    Context-aware sentiment and emotion analyzer for mental health text.
    
    This analyzer is specifically designed for Filipino mental health contexts
    and handles:
    - Cebuano/Tagalog/English code-switching
    - Coping humor vs genuine positivity
    - Stress masking through resilience phrases
    - User metadata integration
    """
    
    MODEL_VERSION = "sentisphere-mh-v2.0"
    
    def __init__(self):
        self._compile_patterns()
    
    def _compile_patterns(self):
        """Pre-compile regex patterns for efficiency."""
        # Extended laughter pattern
        self._laughter_pattern = re.compile(
            r'(ha){3,}|(he){3,}|(hu){3,}|hahaha+|hehehe+|huhuhu+',
            re.IGNORECASE
        )
        # Emoji patterns
        self._crying_emoji = re.compile(r'😭|😢|😿|🥺')
        self._laughing_emoji = re.compile(r'😂|🤣|😆')
        # Word boundary for lexicon matching
        self._word_boundary = re.compile(r'\b')
    
    def analyze(
        self,
        text: str,
        user_context: Optional[UserContext] = None,
    ) -> AnalysisResult:
        """
        Analyze text for sentiment and emotions.
        
        Args:
            text: The check-in comment or journal text
            user_context: Optional user-reported mood/stress/energy
            
        Returns:
            AnalysisResult with sentiment, emotions, and explanation
        """
        if not text or not text.strip():
            return self._empty_result()
        
        # Normalize text for matching (keep original for reference)
        normalized = self._normalize_text(text)
        tokens = self._tokenize(normalized)
        
        # Phase 1: Lexicon-based emotion detection
        emotion_scores = self._score_emotions_from_lexicon(normalized, tokens)
        
        # Phase 2: Pattern-based detection (coping humor, pleas, etc.)
        flags = self._detect_patterns(text, normalized)
        
        # Phase 3: Calculate raw sentiment scores
        raw_scores = self._calculate_raw_scores(emotion_scores, flags)
        
        # Phase 4: Apply user context override
        if user_context:
            raw_scores, flags = self._apply_user_context(raw_scores, flags, user_context)
        
        # Phase 5: Determine final sentiment (now considers emotion_scores for severity)
        sentiment, confidence = self._determine_sentiment(raw_scores, flags, emotion_scores)
        
        # Phase 6: Select dominant emotion
        dominant_emotion = self._select_primary_emotion(emotion_scores, sentiment)
        
        # Phase 7: Compile emotion labels list (top emotions, unique)
        sorted_emotions = sorted(emotion_scores, key=lambda e: e.score, reverse=True)
        emotions_list = []
        seen = set()
        for es in sorted_emotions:
            if es.emotion not in seen and es.score >= 0.3:
                emotions_list.append(es.emotion)
                seen.add(es.emotion)
            if len(emotions_list) >= 6:  # Cap at 6 emotions
                break
        if not emotions_list:
            emotions_list = [dominant_emotion]
        
        # Phase 8: Generate reasoning
        reasoning = self._generate_reasoning(
            text, sentiment, dominant_emotion, emotion_scores, flags, user_context
        )
        
        return AnalysisResult(
            sentiment=sentiment,
            dominant_emotion=dominant_emotion,
            emotions=emotions_list,
            confidence=round(confidence, 3),
            model_version=self.MODEL_VERSION,
            reasoning=reasoning,
            emotion_scores=sorted_emotions,
            flags=flags,
            raw_scores=raw_scores,
        )
    
    def _empty_result(self) -> AnalysisResult:
        """Return neutral result for empty text."""
        return AnalysisResult(
            sentiment="neutral",
            dominant_emotion="neutral",
            emotions=["neutral"],
            confidence=0.5,
            model_version=self.MODEL_VERSION,
            reasoning="No text provided for analysis.",
            emotion_scores=[EmotionScore("neutral", 0.5, "default")],
            flags=[],
            raw_scores={"positive": 0.0, "negative": 0.0, "neutral": 1.0},
        )
    
    def _normalize_text(self, text: str) -> str:
        """Normalize text for lexicon matching."""
        # Lowercase
        normalized = text.lower()
        # Normalize common variations
        normalized = normalized.replace("'", "'").replace("'", "'")
        # Keep punctuation for sentence structure but normalize spacing
        normalized = re.sub(r'\s+', ' ', normalized).strip()
        return normalized
    
    def _tokenize(self, text: str) -> List[str]:
        """Tokenize text into words."""
        # Split on whitespace and punctuation, keep meaningful tokens
        tokens = re.findall(r'\b\w+\b', text.lower())
        return tokens
    
    def _score_emotions_from_lexicon(
        self,
        text: str,
        tokens: List[str],
    ) -> List[EmotionScore]:
        """
        Score emotions based on lexicon matches.
        
        Handles:
        - Multi-word phrases
        - Intensity modifiers
        - Different emotion categories
        """
        emotion_scores: Dict[str, float] = {}
        detected_sources: Dict[str, str] = {}
        
        # Check for phrase matches first (higher priority)
        all_lexicons = [
            (STRESS_EXHAUSTION, "stress_lexicon"),
            (COPING_PHRASES, "coping_lexicon"),
            (PLEA_PHRASES, "plea_lexicon"),
            (GENUINE_POSITIVE, "positive_lexicon"),
        ]
        
        for lexicon, source in all_lexicons:
            for phrase, entry in lexicon.items():
                if phrase in text:
                    # Check for intensity modifiers before the phrase
                    intensity_mult = self._get_intensity_multiplier(text, phrase)
                    score = entry.intensity * intensity_mult
                    
                    emotion = entry.emotion
                    if emotion not in emotion_scores or score > emotion_scores[emotion]:
                        emotion_scores[emotion] = score
                        detected_sources[emotion] = source
        
        # Convert to EmotionScore list
        result = [
            EmotionScore(emotion=em, score=sc, source=detected_sources.get(em, "lexicon"))
            for em, sc in emotion_scores.items()
        ]
        
        # If nothing detected, add neutral baseline
        if not result:
            result.append(EmotionScore("neutral", 0.5, "default"))
        
        return result
    
    def _get_intensity_multiplier(self, text: str, phrase: str) -> float:
        """Check for intensity modifiers before a phrase."""
        # Find position of phrase
        idx = text.find(phrase)
        if idx <= 0:
            return 1.0
        
        # Get text before phrase (up to 20 chars)
        before_text = text[max(0, idx - 20):idx].strip()
        words_before = before_text.split()
        
        # Check last 2 words for modifiers
        for word in words_before[-2:]:
            if word in INTENSIFIERS:
                return INTENSIFIERS[word]
            if word in DIMINISHERS:
                return DIMINISHERS[word]
        
        return 1.0
    
    def _detect_patterns(self, original_text: str, normalized_text: str) -> List[str]:
        """Detect special patterns in text."""
        flags = []
        
        # Coping laughter
        if is_coping_laughter(original_text) or self._laughter_pattern.search(original_text):
            flags.append("coping_laughter")
        
        # Crying emoji (often indicates distress even with laughter)
        if self._crying_emoji.search(original_text):
            flags.append("crying_indicator")
        
        # Religious/spiritual plea pattern
        if re.search(r'\b(lord|god|diyos)\b.*\b(help|please|sana|baka)\b', normalized_text):
            flags.append("spiritual_plea")
        if re.search(r'\bbaka\s+naman\b', normalized_text):
            flags.append("plea_phrase")
        
        # "Give me a break" type phrases
        if re.search(r'give\s+(me|us)\s+a?\s*break', normalized_text):
            flags.append("break_plea")
        
        # Resignation/giving up
        if re.search(r'\b(ayoko|ayaw)\s+na\b', normalized_text):
            flags.append("resignation")
        if re.search(r'\bdi\s+(ko|na|na ko)\s+kaya\b', normalized_text):
            flags.append("resignation")
        
        # Stress + coping combo (indicates masked distress)
        has_stress = any(word in normalized_text for word in STRESS_EXHAUSTION.keys())
        has_coping = any(phrase in normalized_text for phrase in COPING_PHRASES.keys())
        if has_stress and has_coping:
            flags.append("masked_distress")
        
        return flags
    
    def _calculate_raw_scores(
        self,
        emotion_scores: List[EmotionScore],
        flags: List[str],
    ) -> Dict[str, float]:
        """Calculate raw positive/negative/neutral scores."""
        positive_score = 0.0
        negative_score = 0.0
        neutral_score = 0.0
        
        # Emotion to valence mapping (expanded for new lexicon entries)
        negative_emotions = {
            # Core negative emotions
            "exhaustion", "stress", "anxiety", "sadness", "fear", "frustration",
            "difficulty", "pain", "overwhelm", "burnout", "burden", "intensity",
            "plea",
            # Expanded negative emotions from lexicon
            "emotional_burden", "confusion", "mental_noise", "apathy",
            "social_exhaustion", "shame", "lostness", "hopelessness", "distress",
            "resentment", "emotional_pain", "crying", "annoyed", "low_self_esteem",
            "breakpoint", "depression", "emptiness", "emotional_numbness",
            "self_worth", "anger", "annoyance", "pressure", "panic",
            "masked_pain", "masking", "masked_distress", "mental_fatigue",
            "emotional_fatigue", "overwork",
            # Relational distress (high weight negative)
            "relational_conflict",
        }
        positive_emotions = {
            # Core positive emotions
            "joy", "gratitude", "love", "pride", "achievement", "hope",
            "peace", "contentment", "excitement", "appreciation", "interest",
            "improvement", "enjoyment",
            # Expanded positive emotions from lexicon
            "happiness", "calm", "motivation", "confidence", "affection",
            "humor", "connection", "relationship_support", "approval", "focus",
        }
        neutral_emotions = {
            "neutral", "coping",  # Coping alone is neutral (resilience, not positive)
        }
        # Mixed emotions contribute to BOTH positive and negative
        mixed_emotions = {"mixed"}
        
        for es in emotion_scores:
            if es.emotion in negative_emotions:
                negative_score += es.score
            elif es.emotion in positive_emotions:
                positive_score += es.score
            elif es.emotion in mixed_emotions:
                # Mixed emotions contribute to BOTH sides (triggers mixed sentiment)
                negative_score += es.score * 0.5
                positive_score += es.score * 0.5
            elif es.emotion in neutral_emotions:
                neutral_score += es.score
            else:
                # Unknown emotion - check if source indicates stress
                if es.source in ("stress_lexicon", "plea_lexicon"):
                    negative_score += es.score * 0.5
                else:
                    neutral_score += es.score * 0.5
        
        # Apply flag adjustments
        if "coping_laughter" in flags:
            # Laughter in distress context is NOT positive
            positive_score *= 0.3  # Heavily discount
            negative_score *= 1.2  # Boost negative interpretation
        
        if "masked_distress" in flags:
            # Coping phrases with stress indicators = negative
            positive_score *= 0.4
            negative_score *= 1.3
        
        if "spiritual_plea" in flags or "plea_phrase" in flags or "break_plea" in flags:
            negative_score += 0.5
        
        if "resignation" in flags:
            negative_score += 0.7
        
        if "crying_indicator" in flags:
            negative_score += 0.3
        
        # Normalize
        total = positive_score + negative_score + neutral_score
        if total > 0:
            positive_score /= total
            negative_score /= total
            neutral_score /= total
        else:
            neutral_score = 1.0
        
        return {
            "positive": round(positive_score, 3),
            "negative": round(negative_score, 3),
            "neutral": round(neutral_score, 3),
        }
    
    def _apply_user_context(
        self,
        raw_scores: Dict[str, float],
        flags: List[str],
        ctx: UserContext,
    ) -> Tuple[Dict[str, float], List[str]]:
        """
        Apply user-reported context to adjust scores.
        
        CRITICAL: User's self-reported mood/stress is ground truth.
        If user says they're anxious and stressed, model CANNOT say positive.
        """
        adjusted = raw_scores.copy()
        new_flags = flags.copy()
        
        # Calculate user context negativity
        user_negativity = 0.0
        user_signals = []
        
        if ctx.mood_level:
            valence = MOOD_TO_VALENCE.get(ctx.mood_level, 0.0)
            if valence < 0:
                user_negativity += abs(valence) * 0.4
                user_signals.append(f"mood={ctx.mood_level}")
        
        if ctx.stress_level:
            stress = STRESS_TO_SCORE.get(ctx.stress_level, 0.0)
            if stress >= 0.5:  # Moderate or higher
                user_negativity += stress * 0.3
                user_signals.append(f"stress={ctx.stress_level}")
        
        if ctx.energy_level:
            energy = ENERGY_TO_SCORE.get(ctx.energy_level, 0.5)
            if energy < 0.3:  # Low energy
                user_negativity += 0.2
                user_signals.append(f"energy={ctx.energy_level}")
        
        if ctx.feel_better:
            feel = FEEL_BETTER_TO_SCORE.get(ctx.feel_better, 0.0)
            if feel < 0:  # "No"
                user_negativity += 0.3
                user_signals.append(f"feel_better={ctx.feel_better}")
        
        # OVERRIDE RULE: If user reports significant distress, model MUST NOT be positive
        if user_negativity >= 0.5:
            new_flags.append("user_distress_override")
            new_flags.append(f"user_signals: {', '.join(user_signals)}")
            
            # Cap positive score and boost negative
            adjusted["positive"] = min(adjusted["positive"], 0.2)
            adjusted["negative"] = max(adjusted["negative"], 0.5)
            
            # Renormalize
            total = adjusted["positive"] + adjusted["negative"] + adjusted["neutral"]
            if total > 0:
                for k in adjusted:
                    adjusted[k] = round(adjusted[k] / total, 3)
        
        return adjusted, new_flags
    
    def _determine_sentiment(
        self,
        raw_scores: Dict[str, float],
        flags: List[str],
        emotion_scores: List[EmotionScore],
    ) -> Tuple[str, float]:
        """
        Determine final sentiment label and confidence.
        
        Labels: positive, neutral, mixed, negative, strongly_negative
        
        Key rules:
        - Coping phrases do NOT count as positive
        - Mixed = both positive AND negative elements present
        - strongly_negative = severe distress indicators (pleas, resignation, high stress)
        """
        pos = raw_scores.get("positive", 0)
        neg = raw_scores.get("negative", 0)
        neu = raw_scores.get("neutral", 0)
        
        # Calculate confidence as the margin between top 2 scores
        scores = sorted([pos, neg, neu], reverse=True)
        confidence = scores[0]
        if len(scores) > 1:
            confidence = 0.5 + (scores[0] - scores[1]) * 0.5
        
        # Check for severe distress markers
        severe_flags = {"resignation", "spiritual_plea", "plea_phrase", "break_plea", "user_distress_override"}
        has_severe = any(f in flags for f in severe_flags)
        
        # Check for severe emotions
        severe_emotions = {"hopelessness", "breakpoint", "depression", "resignation"}
        has_severe_emotion = any(es.emotion in severe_emotions and es.score >= 0.8 for es in emotion_scores)
        
        # STRONGLY_NEGATIVE: high negative score + severe markers
        if neg >= 0.6 and (has_severe or has_severe_emotion):
            return "strongly_negative", max(confidence, 0.85)
        
        # User distress override -> at least negative
        if "user_distress_override" in flags:
            return "negative", max(confidence, 0.7)
        
        # MIXED: significant positive AND negative (both > 0.25)
        # This handles cases like "kapoy pero worth it" or "stressed pero happy sa uyab"
        if pos >= 0.25 and neg >= 0.25:
            # Determine which is dominant for the "mixed" nuance
            return "mixed", confidence
        
        # POSITIVE: positive clearly wins
        if pos > neg and pos > neu and pos >= 0.4:
            return "positive", confidence
        
        # NEGATIVE: negative clearly wins
        if neg > pos and neg > neu:
            return "negative", confidence
        
        # NEUTRAL: nothing strong
        return "neutral", confidence
    
    def _select_primary_emotion(
        self,
        emotion_scores: List[EmotionScore],
        sentiment: str,
    ) -> str:
        """Select the most relevant primary emotion."""
        if not emotion_scores:
            return "neutral"
        
        # Sort by score descending
        sorted_emotions = sorted(emotion_scores, key=lambda e: e.score, reverse=True)
        
        # Expanded emotion sets for filtering
        negative_emotion_set = {
            "exhaustion", "stress", "anxiety", "sadness", "fear",
            "frustration", "difficulty", "pain", "overwhelm", "burnout",
            "burden", "plea", "coping", "emotional_burden", "confusion",
            "mental_noise", "apathy", "social_exhaustion", "shame",
            "lostness", "hopelessness", "distress", "resentment",
            "emotional_pain", "crying", "annoyed", "low_self_esteem",
            "breakpoint", "depression", "emptiness", "emotional_numbness",
            "self_worth", "anger", "annoyance", "pressure", "panic",
            "masked_pain", "masking", "masked_distress", "mental_fatigue",
            "emotional_fatigue", "intensity",
        }
        positive_emotion_set = {
            "joy", "gratitude", "love", "pride", "achievement",
            "hope", "peace", "contentment", "excitement", "happiness",
            "calm", "motivation", "confidence", "affection", "humor",
            "connection", "appreciation", "interest", "improvement", "enjoyment",
        }
        
        # Filter to match sentiment direction if possible
        if sentiment == "negative":
            negative_emotions = [
                e for e in sorted_emotions
                if e.emotion in negative_emotion_set
            ]
            if negative_emotions:
                return negative_emotions[0].emotion
        
        elif sentiment == "positive":
            positive_emotions = [
                e for e in sorted_emotions
                if e.emotion in positive_emotion_set
            ]
            if positive_emotions:
                return positive_emotions[0].emotion
        
        # Default to highest scoring emotion
        return sorted_emotions[0].emotion
    
    def _generate_reasoning(
        self,
        text: str,
        sentiment: str,
        dominant_emotion: str,
        emotion_scores: List[EmotionScore],
        flags: List[str],
        user_context: Optional[UserContext],
    ) -> str:
        """
        Generate human-readable reasoning for the classification.
        
        This explains WHY the sentiment was assigned based on:
        - Lexicon triggers (stress words, coping phrases, positive words)
        - Pattern flags (coping humor, pleas, masked distress)
        - User context (if check-in with mood/stress/energy)
        """
        reasoning_parts = []
        
        # Collect negative indicators found
        negative_triggers = []
        positive_triggers = []
        coping_triggers = []
        
        for es in emotion_scores:
            if es.score >= 0.5:
                if es.emotion in {
                    "exhaustion", "stress", "anxiety", "sadness", "overwhelm",
                    "frustration", "pain", "burnout", "hopelessness", "distress",
                    "anger", "depression", "fear", "difficulty", "pressure",
                    "relational_conflict",
                }:
                    negative_triggers.append(es.emotion)
                elif es.emotion in {
                    "joy", "gratitude", "happiness", "excitement", "pride",
                    "achievement", "love", "hope", "motivation", "appreciation",
                }:
                    positive_triggers.append(es.emotion)
                elif es.emotion in {"coping", "mixed"}:
                    coping_triggers.append(es.emotion)
        
        # Build reasoning narrative
        if negative_triggers:
            reasoning_parts.append(
                f"Negative indicators detected: {', '.join(set(negative_triggers))}."
            )
        
        if positive_triggers:
            reasoning_parts.append(
                f"Positive indicators detected: {', '.join(set(positive_triggers))}."
            )
        
        if coping_triggers or "masked_distress" in flags:
            reasoning_parts.append(
                "Coping/reframing phrases detected (e.g., 'worth it ra', 'kaya pa') — "
                "these indicate resilience but do NOT remove underlying stress."
            )
        
        if "coping_laughter" in flags:
            reasoning_parts.append(
                "Coping humor detected (e.g., 'HAHAHA', 'LOL') — in Filipino youth culture, "
                "laughter often masks distress rather than indicating genuine positivity."
            )
        
        if "spiritual_plea" in flags or "plea_phrase" in flags or "break_plea" in flags:
            reasoning_parts.append(
                "Plea/help-seeking language detected — indicates elevated emotional severity."
            )
        
        if "user_distress_override" in flags:
            reasoning_parts.append(
                "User-reported metadata (mood/stress/energy/feel_better) indicates distress — "
                "overriding text-only analysis to align with user's self-report."
            )
        
        # Explain final sentiment decision
        if sentiment == "mixed":
            reasoning_parts.append(
                f"Both positive and negative elements are present. "
                f"Dominant emotional state is {dominant_emotion}."
            )
        elif sentiment == "strongly_negative":
            reasoning_parts.append(
                f"Severe distress markers combined with high negative emotion intensity. "
                f"Dominant emotion: {dominant_emotion}."
            )
        elif sentiment == "negative":
            reasoning_parts.append(
                f"Negative emotional weight outweighs positive/neutral. "
                f"Dominant emotion: {dominant_emotion}."
            )
        elif sentiment == "positive":
            reasoning_parts.append(
                f"Genuine positive emotional content detected. "
                f"Dominant emotion: {dominant_emotion}."
            )
        else:  # neutral
            reasoning_parts.append(
                f"No strong emotional signals detected. Classified as neutral."
            )
        
        # Add user context summary if present
        if user_context:
            ctx_parts = []
            if user_context.mood_level:
                ctx_parts.append(f"mood={user_context.mood_level}")
            if user_context.stress_level:
                ctx_parts.append(f"stress={user_context.stress_level}")
            if user_context.energy_level:
                ctx_parts.append(f"energy={user_context.energy_level}")
            if user_context.feel_better:
                ctx_parts.append(f"feel_better={user_context.feel_better}")
            if ctx_parts:
                reasoning_parts.append(f"User context: {', '.join(ctx_parts)}.")
        
        return " ".join(reasoning_parts) if reasoning_parts else "Analysis complete."


# =============================================================================
# SIMPLIFIED OUTPUT FOR BACKWARD COMPATIBILITY
# =============================================================================

@dataclass(slots=True)
class SentimentOutput:
    """
    Output format for sentiment analysis.
    
    For backward compatibility, `emotions` is a comma-separated string.
    Use `analyze_with_context_detailed()` for full JSON output.
    """
    sentiment: str  # positive, neutral, mixed, negative, strongly_negative
    emotions: str  # Comma-separated emotion labels
    confidence: float
    model_version: str
    dominant_emotion: str = "neutral"  # Primary emotion
    reasoning: str = ""  # Explanation of classification


def analyze_with_context(
    text: str,
    mood_level: Optional[str] = None,
    energy_level: Optional[str] = None,
    stress_level: Optional[str] = None,
    feel_better: Optional[str] = None,
) -> SentimentOutput:
    """
    Analyze text with optional user context.
    
    This is the main entry point for sentiment analysis.
    """
    analyzer = MentalHealthAnalyzer()
    
    user_context = None
    if any([mood_level, energy_level, stress_level, feel_better]):
        user_context = UserContext(
            mood_level=mood_level,
            energy_level=energy_level,
            stress_level=stress_level,
            feel_better=feel_better,
        )
    
    result = analyzer.analyze(text, user_context)
    
    # Convert to simple output format
    # Emotions is now already a list of strings, just join them
    emotions_str = ",".join(result.emotions) if result.emotions else result.dominant_emotion
    
    return SentimentOutput(
        sentiment=result.sentiment,
        emotions=emotions_str,
        confidence=result.confidence,
        model_version=result.model_version,
        dominant_emotion=result.dominant_emotion,
        reasoning=result.reasoning,
    )


def analyze_with_context_detailed(
    text: str,
    mood_level: Optional[str] = None,
    energy_level: Optional[str] = None,
    stress_level: Optional[str] = None,
    feel_better: Optional[str] = None,
) -> Dict:
    """
    Analyze text and return full detailed JSON output.
    
    Returns the complete analysis result as a dictionary matching
    the Sentisphere spec:
    {
        "sentiment": "negative | mixed | positive | strongly_negative | neutral",
        "emotions": ["exhaustion", "stress", "gratitude", ...],
        "dominant_emotion": "exhaustion",
        "confidence": 0.0-1.0,
        "reasoning": "Explanation of classification..."
    }
    """
    analyzer = MentalHealthAnalyzer()
    
    user_context = None
    if any([mood_level, energy_level, stress_level, feel_better]):
        user_context = UserContext(
            mood_level=mood_level,
            energy_level=energy_level,
            stress_level=stress_level,
            feel_better=feel_better,
        )
    
    result = analyzer.analyze(text, user_context)
    
    return {
        "sentiment": result.sentiment,
        "emotions": result.emotions,
        "dominant_emotion": result.dominant_emotion,
        "confidence": result.confidence,
        "reasoning": result.reasoning,
        "model_version": result.model_version,
    }


def analyze_text_simple(text: str) -> SentimentOutput:
    """Simple analysis without user context (backward compatible)."""
    return analyze_with_context(text)


# =============================================================================
# TESTING / DEMO
# =============================================================================

if __name__ == "__main__":
    # Test with the problematic example
    test_text = (
        "Grabe ka hago nga adlaw kay daghan practices and all pero keri ra japon, "
        "kakayanin para sa kinabukasan. baka naman lord give me a break HAHAHAHA"
    )
    
    print("=" * 70)
    print("TEST: Mental Health Analyzer")
    print("=" * 70)
    print(f"\nInput text:\n{test_text}\n")
    
    # Without context
    print("-" * 40)
    print("Without user context:")
    result1 = analyze_text_simple(test_text)
    print(f"  Sentiment: {result1.sentiment}")
    print(f"  Emotions: {result1.emotions}")
    print(f"  Confidence: {result1.confidence}")
    
    # With context (user-reported state)
    print("-" * 40)
    print("With user context (Anxious, Low, High Stress, No):")
    result2 = analyze_with_context(
        test_text,
        mood_level="Anxious",
        energy_level="Low",
        stress_level="High Stress",
        feel_better="No",
    )
    print(f"  Sentiment: {result2.sentiment}")
    print(f"  Emotions: {result2.emotions}")
    print(f"  Confidence: {result2.confidence}")
    
    # Full analysis for debugging
    print("-" * 40)
    print("Full analysis result:")
    analyzer = MentalHealthAnalyzer()
    full_result = analyzer.analyze(
        test_text,
        UserContext(
            mood_level="Anxious",
            energy_level="Low",
            stress_level="High Stress",
            feel_better="No",
        ),
    )
    print(f"  Explanation: {full_result.explanation}")
    print(f"  Flags: {full_result.flags}")
    print(f"  Raw scores: {full_result.raw_scores}")
