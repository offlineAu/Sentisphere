"""
Ensemble Sentiment Pipeline for Sentisphere
=============================================
A multi-stage hybrid sentiment analysis system combining:
1. XLM-RoBERTa (multilingual base model)
2. Twitter-RoBERTa-Emotion (multi-emotion detection)
3. Fine-tuned Bisaya model (Cebuano-specialized)
4. MentalHealth lexicon analyzer

Architecture:
- Stage 1: Global Understanding (XLM-RoBERTa base + Twitter-Emotion)
- Stage 2: Bisaya Refinement (triggered by low confidence or Bisaya markers)
- Stage 3: Hybrid Merge with weighted confidence
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime

try:
    import torch
    from transformers import (
        AutoTokenizer,
        AutoModelForSequenceClassification,
        pipeline,
    )
    _HAS_TRANSFORMERS = True
except ImportError:
    _HAS_TRANSFORMERS = False
    torch = None

from app.utils.bisaya_detector import detect_bisaya, should_use_bisaya_model
from app.utils.text_cleaning import clean_text
from app.utils.mental_health_analyzer import (
    MentalHealthAnalyzer,
    AnalysisResult as MHAnalysisResult,
    UserContext,
)
from app.utils.crisis_detector import (
    CrisisDetector,
    CrisisDetectionOutput,
    get_crisis_detector,
    CrisisLevel,
)

logger = logging.getLogger(__name__)


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class ModelOutput:
    """Output from a single model."""
    sentiment: str
    confidence: float
    interpretation: str
    emotions: List[str] = field(default_factory=list)
    raw_scores: Dict[str, float] = field(default_factory=dict)
    model_name: str = ""


@dataclass
class XLMRobertaOutput:
    """Stage 1: XLM-RoBERTa analysis output."""
    sentiment: str
    confidence: float
    interpretation: str
    detected_language: str
    emotions: List[str] = field(default_factory=list)
    raw_scores: Dict[str, float] = field(default_factory=dict)


@dataclass
class BisayaModelOutput:
    """Stage 2: Bisaya refinement output."""
    sentiment: str
    confidence: float
    correction: str  # Explanation if XLM interpretation was wrong
    analysis: str  # Detailed Bisaya-aware analysis
    emotions: List[str] = field(default_factory=list)
    raw_scores: Dict[str, float] = field(default_factory=dict)


@dataclass
class EmotionOutput:
    """Twitter-RoBERTa emotion detection output."""
    emotions: List[str]  # Top emotions detected
    scores: Dict[str, float]  # All emotion scores
    dominant_emotion: str


@dataclass
class EnsembleResult:
    """Final ensemble pipeline output."""
    xlm_roberta: XLMRobertaOutput
    bisaya_model: Optional[BisayaModelOutput]
    emotion_detection: EmotionOutput
    final_result: Dict[str, Any]
    crisis_detection: Optional[CrisisDetectionOutput] = None
    processing_time_ms: float = 0.0
    
    def to_dict(self) -> Dict:
        """Convert to JSON-serializable dictionary."""
        return {
            "xlm_roberta": {
                "sentiment": self.xlm_roberta.sentiment,
                "confidence": self.xlm_roberta.confidence,
                "interpretation": self.xlm_roberta.interpretation,
                "detected_language": self.xlm_roberta.detected_language,
                "emotions": self.xlm_roberta.emotions,
            },
            "bisaya_model": {
                "sentiment": self.bisaya_model.sentiment if self.bisaya_model else None,
                "confidence": self.bisaya_model.confidence if self.bisaya_model else None,
                "correction": self.bisaya_model.correction if self.bisaya_model else "",
                "analysis": self.bisaya_model.analysis if self.bisaya_model else "",
            } if self.bisaya_model else None,
            "emotion_detection": {
                "emotions": self.emotion_detection.emotions,
                "scores": self.emotion_detection.scores,
                "dominant_emotion": self.emotion_detection.dominant_emotion,
            },
            "final_result": self.final_result,
            "crisis_detection": {
                "mental_bert": {
                    "category": self.crisis_detection.mental_bert.category.value if self.crisis_detection and self.crisis_detection.mental_bert else None,
                    "confidence": self.crisis_detection.mental_bert.confidence if self.crisis_detection and self.crisis_detection.mental_bert else None,
                    "is_crisis": self.crisis_detection.mental_bert.is_crisis if self.crisis_detection and self.crisis_detection.mental_bert else False,
                } if self.crisis_detection else None,
                "contextual": {
                    "risk_score": self.crisis_detection.contextual.risk_score if self.crisis_detection else 0,
                    "flags": self.crisis_detection.contextual.flags if self.crisis_detection else [],
                    "protective_factors": self.crisis_detection.contextual.protective_factors if self.crisis_detection else [],
                    "coping_strength": self.crisis_detection.contextual.coping_strength if self.crisis_detection else 0,
                } if self.crisis_detection else None,
                "final_crisis_level": self.crisis_detection.final_crisis_level.value if self.crisis_detection else "none",
                "combined_risk_score": self.crisis_detection.combined_risk_score if self.crisis_detection else 0,
                "requires_alert": self.crisis_detection.requires_alert if self.crisis_detection else False,
                "alert_severity": self.crisis_detection.alert_severity if self.crisis_detection else "LOW",
                "reasoning": self.crisis_detection.reasoning if self.crisis_detection else "",
                "recommendations": self.crisis_detection.recommendations if self.crisis_detection else [],
            } if self.crisis_detection else None,
            "processing_time_ms": self.processing_time_ms,
        }


# =============================================================================
# MODEL LOADERS (Singleton Pattern)
# =============================================================================

class ModelCache:
    """Singleton cache for loaded models to avoid repeated loading."""
    
    _instance = None
    _models: Dict[str, Any] = {}
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._models = {}
        return cls._instance
    
    def get_or_load(self, model_name: str, loader_fn) -> Any:
        """Get cached model or load it."""
        if model_name not in self._models:
            logger.info(f"[Ensemble] Loading model: {model_name}")
            self._models[model_name] = loader_fn()
            logger.info(f"[Ensemble] Model loaded: {model_name}")
        return self._models[model_name]
    
    def clear(self):
        """Clear all cached models."""
        self._models.clear()


_model_cache = ModelCache()


# =============================================================================
# ENSEMBLE PIPELINE
# =============================================================================

class EnsembleSentimentPipeline:
    """
    Multi-stage ensemble sentiment analysis pipeline.
    
    Models used:
    1. XLM-RoBERTa-base (multilingual sentiment)
    2. cardiffnlp/twitter-roberta-base-emotion (multi-emotion)
    3. Fine-tuned Bisaya model (OfflineAu/sentisphere-bisaya-sentiment)
    4. MentalHealth lexicon analyzer (local)
    
    Pipeline stages:
    - Stage 1: Global Understanding (XLM-R + Twitter-Emotion)
    - Stage 2: Bisaya Refinement (conditional)
    - Stage 3: Hybrid Merge
    """
    
    # Model identifiers
    XLM_ROBERTA_MODEL = "cardiffnlp/twitter-xlm-roberta-base-sentiment"
    EMOTION_MODEL = "cardiffnlp/twitter-roberta-base-emotion"
    MENTAL_BERT_MODEL = "mental/mental-bert-base-uncased"  # Mental health BERT
    BISAYA_MODEL = "OfflineAu/sentisphere-bisaya-sentiment"
    
    # Confidence thresholds
    LOW_CONFIDENCE_THRESHOLD = 0.70
    HIGH_CONFIDENCE_THRESHOLD = 0.85
    
    # Merge weights
    XLM_WEIGHT = 0.35
    EMOTION_WEIGHT = 0.25
    BISAYA_WEIGHT = 0.40  # Higher weight for Bisaya when used
    
    def __init__(self, use_mental_bert: bool = False):
        """
        Initialize the ensemble pipeline.
        
        Args:
            use_mental_bert: Whether to include MentalBERT in the ensemble
        """
        self.use_mental_bert = use_mental_bert
        self.mental_health_analyzer = MentalHealthAnalyzer()
        self._pipelines: Dict[str, Any] = {}
        
        if _HAS_TRANSFORMERS:
            self._initialize_models()
        else:
            logger.warning("[Ensemble] Transformers not available, using fallback")
    
    def _initialize_models(self):
        """Lazy-load models on first use."""
        pass  # Models are loaded on demand via _get_pipeline
    
    def _get_pipeline(self, model_name: str, task: str = "sentiment-analysis"):
        """Get or create a HuggingFace pipeline."""
        cache_key = f"{model_name}_{task}"
        
        def loader():
            try:
                return pipeline(
                    task,
                    model=model_name,
                    tokenizer=model_name,
                    device=-1,  # CPU
                    top_k=None if task == "text-classification" else 5,
                )
            except Exception as e:
                logger.error(f"[Ensemble] Failed to load {model_name}: {e}")
                return None
        
        return _model_cache.get_or_load(cache_key, loader)
    
    def analyze(
        self,
        text: str,
        mood_level: Optional[str] = None,
        energy_level: Optional[str] = None,
        stress_level: Optional[str] = None,
        feel_better: Optional[str] = None,
    ) -> EnsembleResult:
        """
        Run the full ensemble pipeline on input text.
        
        Args:
            text: Input text to analyze
            mood_level: Optional user-reported mood
            energy_level: Optional user-reported energy
            stress_level: Optional user-reported stress
            feel_better: Optional user feeling better indicator
            
        Returns:
            EnsembleResult with all model outputs and merged result
        """
        import time
        start_time = time.time()
        
        cleaned_text = clean_text(text)
        
        # If no text, derive sentiment from user context (mood/energy/stress)
        if not cleaned_text:
            if any([mood_level, energy_level, stress_level, feel_better]):
                return self._derive_from_context(mood_level, energy_level, stress_level, feel_better)
            return self._empty_result()
        
        # Detect language composition
        lang_detection = detect_bisaya(text)
        
        # Stage 1: Global Understanding
        xlm_output = self._stage1_xlm_roberta(cleaned_text, lang_detection)
        emotion_output = self._stage1_emotion_detection(cleaned_text)
        
        # Stage 2: Bisaya Refinement (conditional)
        bisaya_output = None
        use_bisaya, bisaya_reason = should_use_bisaya_model(
            text, xlm_output.confidence
        )
        
        if use_bisaya:
            bisaya_output = self._stage2_bisaya_refinement(
                cleaned_text, xlm_output, lang_detection
            )
        
        # Get mental health analysis for additional context
        user_context = None
        if any([mood_level, energy_level, stress_level, feel_better]):
            user_context = UserContext(
                mood_level=mood_level,
                energy_level=energy_level,
                stress_level=stress_level,
                feel_better=feel_better,
            )
        mh_result = self.mental_health_analyzer.analyze(cleaned_text, user_context)
        
        # Stage 3: Hybrid Merge
        final_result = self._stage3_merge(
            xlm_output,
            emotion_output,
            bisaya_output,
            mh_result,
            lang_detection,
            use_bisaya,
            bisaya_reason,
        )
        
        # Stage 4: Crisis Detection (MentalBERT + Contextual NLP)
        crisis_result = None
        try:
            crisis_detector = get_crisis_detector()
            crisis_result = crisis_detector.analyze(cleaned_text)
            
            # Override sentiment if crisis detected
            if crisis_result.requires_alert:
                final_result["sentiment"] = "strongly_negative"
                final_result["crisis_level"] = crisis_result.final_crisis_level.value
                final_result["crisis_flags"] = crisis_result.contextual.flags
                final_result["reasoning"] += f"; Crisis: {crisis_result.reasoning}"
                
                # Add mental health category if available
                if crisis_result.mental_bert:
                    final_result["mental_health_category"] = crisis_result.mental_bert.category.value
            
            # Add protective factors to output
            if crisis_result.contextual.protective_factors:
                final_result["protective_factors"] = crisis_result.contextual.protective_factors
                final_result["coping_strength"] = crisis_result.contextual.coping_strength
                
        except Exception as e:
            logger.warning(f"[Ensemble] Crisis detection failed: {e}")
        
        processing_time = (time.time() - start_time) * 1000
        
        return EnsembleResult(
            xlm_roberta=xlm_output,
            bisaya_model=bisaya_output,
            emotion_detection=emotion_output,
            final_result=final_result,
            crisis_detection=crisis_result,
            processing_time_ms=round(processing_time, 2),
        )
    
    def _stage1_xlm_roberta(
        self, text: str, lang_detection: Dict
    ) -> XLMRobertaOutput:
        """
        Stage 1: XLM-RoBERTa base sentiment analysis.
        """
        if not _HAS_TRANSFORMERS:
            return self._fallback_xlm_output(text, lang_detection)
        
        pipe = self._get_pipeline(self.XLM_ROBERTA_MODEL)
        if pipe is None:
            return self._fallback_xlm_output(text, lang_detection)
        
        try:
            results = pipe(text[:512])  # Truncate to model max length
            
            # Parse results (format varies by model)
            if isinstance(results, list) and len(results) > 0:
                if isinstance(results[0], list):
                    results = results[0]
                
                # Get top prediction
                top_result = max(results, key=lambda x: x.get("score", 0))
                label = top_result.get("label", "neutral").lower()
                score = top_result.get("score", 0.5)
                
                # Map label to standard format
                sentiment = self._map_xlm_label(label)
                
                # Get all scores
                raw_scores = {r.get("label", "").lower(): r.get("score", 0) for r in results}
            else:
                sentiment = "neutral"
                score = 0.5
                raw_scores = {}
            
            # Generate interpretation
            interpretation = self._generate_interpretation(text, sentiment, score)
            
            return XLMRobertaOutput(
                sentiment=sentiment,
                confidence=round(score, 3),
                interpretation=interpretation,
                detected_language=lang_detection.get("dominant_language", "unknown"),
                emotions=[],  # XLM-R doesn't output emotions
                raw_scores=raw_scores,
            )
            
        except Exception as e:
            logger.error(f"[Ensemble] XLM-RoBERTa error: {e}")
            return self._fallback_xlm_output(text, lang_detection)
    
    def _stage1_emotion_detection(self, text: str) -> EmotionOutput:
        """
        Stage 1b: Twitter-RoBERTa emotion detection.
        """
        if not _HAS_TRANSFORMERS:
            return self._fallback_emotion_output()
        
        pipe = self._get_pipeline(self.EMOTION_MODEL, task="text-classification")
        if pipe is None:
            return self._fallback_emotion_output()
        
        try:
            results = pipe(text[:512], top_k=None)
            
            if isinstance(results, list):
                if isinstance(results[0], list):
                    results = results[0]
                
                # Sort by score
                sorted_results = sorted(results, key=lambda x: x.get("score", 0), reverse=True)
                
                # Get top emotions (score > 0.1)
                emotions = [
                    r.get("label", "").lower()
                    for r in sorted_results[:4]
                    if r.get("score", 0) > 0.1
                ]
                
                # All scores
                scores = {r.get("label", "").lower(): round(r.get("score", 0), 3) for r in results}
                
                dominant = sorted_results[0].get("label", "neutral").lower() if sorted_results else "neutral"
                
                return EmotionOutput(
                    emotions=emotions if emotions else ["neutral"],
                    scores=scores,
                    dominant_emotion=dominant,
                )
            
        except Exception as e:
            logger.error(f"[Ensemble] Emotion detection error: {e}")
        
        return self._fallback_emotion_output()
    
    def _stage2_bisaya_refinement(
        self,
        text: str,
        xlm_output: XLMRobertaOutput,
        lang_detection: Dict,
    ) -> BisayaModelOutput:
        """
        Stage 2: Bisaya-specialized refinement.
        
        Triggered when:
        - XLM-RoBERTa confidence < 0.70
        - Text contains significant Bisaya markers
        """
        if not _HAS_TRANSFORMERS:
            return self._fallback_bisaya_output(xlm_output)
        
        pipe = self._get_pipeline(self.BISAYA_MODEL)
        if pipe is None:
            return self._fallback_bisaya_output(xlm_output)
        
        try:
            results = pipe(text[:512])
            
            if isinstance(results, list) and len(results) > 0:
                if isinstance(results[0], list):
                    results = results[0]
                
                top_result = max(results, key=lambda x: x.get("score", 0))
                label = top_result.get("label", "neutral").lower()
                score = top_result.get("score", 0.5)
                
                sentiment = self._map_bisaya_label(label)
                raw_scores = {r.get("label", "").lower(): r.get("score", 0) for r in results}
            else:
                sentiment = xlm_output.sentiment
                score = xlm_output.confidence
                raw_scores = {}
            
            # Generate correction/analysis
            correction = ""
            if sentiment != xlm_output.sentiment:
                correction = (
                    f"XLM-RoBERTa classified as '{xlm_output.sentiment}' "
                    f"(conf: {xlm_output.confidence:.2f}), but Bisaya model "
                    f"detected '{sentiment}' with higher confidence for Cebuano text."
                )
            
            # Detailed analysis
            bisaya_markers = lang_detection.get("bisaya_markers_found", [])
            analysis = self._generate_bisaya_analysis(
                text, sentiment, score, bisaya_markers
            )
            
            return BisayaModelOutput(
                sentiment=sentiment,
                confidence=round(score, 3),
                correction=correction,
                analysis=analysis,
                emotions=[],
                raw_scores=raw_scores,
            )
            
        except Exception as e:
            logger.error(f"[Ensemble] Bisaya model error: {e}")
            return self._fallback_bisaya_output(xlm_output)
    
    def _stage3_merge(
        self,
        xlm_output: XLMRobertaOutput,
        emotion_output: EmotionOutput,
        bisaya_output: Optional[BisayaModelOutput],
        mh_result: MHAnalysisResult,
        lang_detection: Dict,
        use_bisaya: bool,
        bisaya_reason: str,
    ) -> Dict[str, Any]:
        """
        Stage 3: Hybrid merge of all model outputs.
        
        Merge logic:
        - If both models agree → increase confidence
        - If they disagree → prefer Bisaya model for heavily Bisaya text
        - Consider emotion detection for positive sentiment correction
        - Otherwise → weighted average
        """
        # Collect all sentiments
        xlm_sentiment = xlm_output.sentiment
        xlm_conf = xlm_output.confidence
        
        bisaya_sentiment = bisaya_output.sentiment if bisaya_output else None
        bisaya_conf = bisaya_output.confidence if bisaya_output else 0.0
        
        mh_sentiment = mh_result.sentiment
        mh_conf = mh_result.confidence
        
        # Determine if heavily Bisaya
        is_heavily_bisaya = lang_detection.get("is_heavily_bisaya", False)
        bisaya_ratio = lang_detection.get("bisaya_ratio", 0.0)
        
        # Check emotion detection for positive indicators
        positive_emotions = {"joy", "love", "optimism", "admiration", "happiness", "excitement", "pride", "gratitude"}
        negative_emotions = {"sadness", "anger", "fear", "disgust", "annoyance", "disappointment", "grief", "nervousness"}
        
        emotion_positive_score = sum(
            emotion_output.scores.get(e, 0) for e in positive_emotions
        )
        emotion_negative_score = sum(
            emotion_output.scores.get(e, 0) for e in negative_emotions
        )
        
        # Determine if emotion detection strongly suggests positive
        emotion_suggests_positive = emotion_positive_score > emotion_negative_score + 0.1
        emotion_suggests_negative = emotion_negative_score > emotion_positive_score + 0.1
        
        # Merge sentiment
        if bisaya_output and bisaya_sentiment == xlm_sentiment:
            # Agreement: boost confidence
            final_sentiment = xlm_sentiment
            combined_conf = min(1.0, (xlm_conf + bisaya_conf) / 2 + 0.15)
            reasoning = f"Agreement between XLM-RoBERTa and Bisaya model on '{final_sentiment}'"
            
        elif bisaya_output and is_heavily_bisaya:
            # Heavily Bisaya: prefer Bisaya model, but check emotions
            final_sentiment = bisaya_sentiment
            combined_conf = bisaya_conf
            
            # If Bisaya says negative but emotions are clearly positive, reconsider
            if bisaya_sentiment in ["negative", "neutral"] and emotion_suggests_positive:
                # Check if MH result also has positive indicators
                if mh_result.raw_scores.get("positive", 0) > mh_result.raw_scores.get("negative", 0):
                    final_sentiment = "positive"
                    combined_conf = (bisaya_conf + emotion_positive_score) / 2
                    reasoning = f"Corrected to positive based on emotion detection (joy/happiness indicators)"
                else:
                    reasoning = f"Bisaya model preferred due to {bisaya_ratio:.0%} Cebuano content"
            else:
                reasoning = f"Bisaya model preferred due to {bisaya_ratio:.0%} Cebuano content"
            
        elif bisaya_output:
            # Disagreement, not heavily Bisaya: weighted merge with emotion consideration
            sentiments = [xlm_sentiment, bisaya_sentiment, mh_sentiment]
            
            # Override with emotions if strongly positive
            if emotion_suggests_positive and not emotion_suggests_negative:
                # Emotions strongly suggest positive
                positive_votes = sum(1 for s in sentiments if s == "positive")
                if positive_votes >= 1 or emotion_positive_score > 0.5:
                    final_sentiment = "positive"
                    combined_conf = max(xlm_conf, bisaya_conf, emotion_positive_score)
                    reasoning = f"Positive sentiment from emotion detection (score: {emotion_positive_score:.2f})"
                else:
                    from collections import Counter
                    sentiment_counts = Counter(sentiments)
                    final_sentiment = sentiment_counts.most_common(1)[0][0]
                    combined_conf = (xlm_conf * 0.4 + bisaya_conf * 0.35 + mh_conf * 0.25)
                    reasoning = f"Weighted merge with positive emotion influence"
            else:
                from collections import Counter
                sentiment_counts = Counter(sentiments)
                final_sentiment = sentiment_counts.most_common(1)[0][0]
                combined_conf = (xlm_conf * 0.4 + bisaya_conf * 0.35 + mh_conf * 0.25)
                reasoning = (
                    f"Weighted merge: XLM({xlm_sentiment}:{xlm_conf:.2f}), "
                    f"Bisaya({bisaya_sentiment}:{bisaya_conf:.2f}), "
                    f"MH({mh_sentiment}:{mh_conf:.2f})"
                )
            
        else:
            # No Bisaya refinement used
            # Consider emotions for positive override
            if emotion_suggests_positive and xlm_sentiment != "positive":
                # Emotions suggest positive, check if we should override
                if emotion_positive_score > 0.4:
                    final_sentiment = "positive"
                    combined_conf = max(xlm_conf, emotion_positive_score)
                    reasoning = f"Positive sentiment from emotion detection (score: {emotion_positive_score:.2f})"
                else:
                    if xlm_sentiment == mh_sentiment:
                        final_sentiment = xlm_sentiment
                        combined_conf = min(1.0, (xlm_conf + mh_conf) / 2 + 0.1)
                    else:
                        final_sentiment = mh_sentiment
                        combined_conf = mh_conf
                    reasoning = f"XLM-RoBERTa primary ({xlm_sentiment}) with MH context ({mh_sentiment})"
            else:
                # Standard merge
                if xlm_sentiment == mh_sentiment:
                    final_sentiment = xlm_sentiment
                    combined_conf = min(1.0, (xlm_conf + mh_conf) / 2 + 0.1)
                else:
                    # Prefer XLM for non-distress cases, MH for distress
                    if mh_sentiment in ["strongly_negative", "negative"] and "masked_distress" in mh_result.flags:
                        final_sentiment = mh_sentiment
                        combined_conf = mh_conf
                    else:
                        final_sentiment = xlm_sentiment
                        combined_conf = xlm_conf
                reasoning = f"XLM-RoBERTa primary ({xlm_sentiment}) with MH context ({mh_sentiment})"
        
        # Handle strongly_negative from MH analysis ONLY for true distress cases
        if mh_sentiment == "strongly_negative" and final_sentiment in ["negative", "mixed"]:
            # Verify there are actual distress markers
            distress_flags = {"resignation", "spiritual_plea", "plea_phrase", "user_distress_override"}
            if any(f in mh_result.flags for f in distress_flags):
                final_sentiment = "strongly_negative"
                reasoning += " | Elevated to strongly_negative due to distress markers"
        
        # Merge emotions
        all_emotions = set(emotion_output.emotions)
        all_emotions.update(mh_result.emotions)
        if bisaya_output and bisaya_output.emotions:
            all_emotions.update(bisaya_output.emotions)
        
        # Get dominant emotion - prefer positive emotions for positive sentiment
        dominant_emotion = emotion_output.dominant_emotion
        if final_sentiment == "positive" and dominant_emotion in negative_emotions:
            # Find a positive emotion
            for e in emotion_output.emotions:
                if e in positive_emotions:
                    dominant_emotion = e
                    break
        elif mh_result.dominant_emotion and mh_result.dominant_emotion != "neutral":
            # Prefer MH dominant emotion for mental health context on negative
            if final_sentiment in ["negative", "strongly_negative"]:
                dominant_emotion = mh_result.dominant_emotion
        
        # Compile flags
        flags = list(mh_result.flags)
        if use_bisaya:
            flags.append(f"bisaya_refinement: {bisaya_reason}")
        if is_heavily_bisaya:
            flags.append(f"heavily_bisaya: {bisaya_ratio:.0%}")
        if emotion_suggests_positive:
            flags.append(f"emotion_positive: {emotion_positive_score:.2f}")
        
        # Check for crisis language in original text
        crisis_keywords = {"hikog", "mamatay", "suicide", "patay", "end it", "kill myself"}
        text_lower = xlm_output.interpretation.lower()
        if any(kw in text_lower for kw in crisis_keywords):
            flags.append("crisis_language")
            if final_sentiment != "strongly_negative":
                final_sentiment = "strongly_negative"
                reasoning += " | CRISIS: Suicidal ideation detected"
        
        return {
            "sentiment": final_sentiment,
            "combined_confidence": round(combined_conf, 3),
            "reasoning": reasoning,
            "emotions": list(all_emotions)[:6],  # Cap at 6
            "dominant_emotion": dominant_emotion,
            "flags": flags,
            "language_detection": {
                "dominant": lang_detection.get("dominant_language", "unknown"),
                "bisaya_ratio": lang_detection.get("bisaya_ratio", 0.0),
                "tagalog_ratio": lang_detection.get("tagalog_ratio", 0.0),
                "english_ratio": lang_detection.get("english_ratio", 0.0),
            },
        }
    
    # =========================================================================
    # HELPER METHODS
    # =========================================================================
    
    def _map_xlm_label(self, label: str) -> str:
        """Map XLM-RoBERTa labels to standard format."""
        label_map = {
            "positive": "positive",
            "negative": "negative",
            "neutral": "neutral",
            "label_0": "negative",
            "label_1": "neutral",
            "label_2": "positive",
        }
        return label_map.get(label.lower(), "neutral")
    
    def _map_bisaya_label(self, label: str) -> str:
        """Map Bisaya model labels to standard format."""
        label_map = {
            "positive": "positive",
            "negative": "negative",
            "neutral": "neutral",
            "strongly_negative": "strongly_negative",
        }
        return label_map.get(label.lower(), "neutral")
    
    def _generate_interpretation(self, text: str, sentiment: str, confidence: float) -> str:
        """Generate a text interpretation."""
        # Simple interpretation based on sentiment
        if sentiment == "positive":
            return f"Text expresses positive emotional content (confidence: {confidence:.0%})"
        elif sentiment == "negative":
            return f"Text indicates negative emotional state (confidence: {confidence:.0%})"
        elif sentiment == "strongly_negative":
            return f"Text shows severe distress signals (confidence: {confidence:.0%})"
        else:
            return f"Text is emotionally neutral or ambiguous (confidence: {confidence:.0%})"
    
    def _generate_bisaya_analysis(
        self, text: str, sentiment: str, confidence: float, markers: List[str]
    ) -> str:
        """Generate Bisaya-aware analysis."""
        markers_str = ", ".join(markers[:5]) if markers else "none detected"
        return (
            f"Bisaya analysis: '{sentiment}' sentiment with {confidence:.0%} confidence. "
            f"Key markers: {markers_str}. "
            f"Text processed with Cebuano-specialized tokenization."
        )
    
    def _empty_result(self) -> EnsembleResult:
        """Return empty result for empty input."""
        return EnsembleResult(
            xlm_roberta=XLMRobertaOutput(
                sentiment="neutral",
                confidence=0.5,
                interpretation="No text provided",
                detected_language="unknown",
            ),
            bisaya_model=None,
            emotion_detection=EmotionOutput(
                emotions=["neutral"],
                scores={"neutral": 1.0},
                dominant_emotion="neutral",
            ),
            final_result={
                "sentiment": "neutral",
                "combined_confidence": 0.5,
                "reasoning": "No text provided for analysis",
                "emotions": ["neutral"],
                "dominant_emotion": "neutral",
                "flags": [],
                "language_detection": {
                    "dominant": "unknown",
                    "bisaya_ratio": 0.0,
                    "tagalog_ratio": 0.0,
                    "english_ratio": 0.0,
                },
            },
        )
    
    def _derive_from_context(
        self,
        mood_level: Optional[str],
        energy_level: Optional[str], 
        stress_level: Optional[str],
        feel_better: Optional[str],
    ) -> EnsembleResult:
        """
        Derive sentiment from user-reported context when no text is provided.
        
        Maps mood_level to sentiment with high confidence since this is
        explicit user input rather than NLP inference.
        """
        # Mood to sentiment mapping
        MOOD_SENTIMENT_MAP = {
            # Positive moods
            "Awesome": ("positive", "joy", 0.95),
            "Loved": ("positive", "love", 0.95),
            "Great": ("positive", "happiness", 0.90),
            "Okay": ("neutral", "calm", 0.85),
            # Neutral
            "Meh": ("neutral", "neutral", 0.80),
            # Negative moods
            "Anxious": ("negative", "anxiety", 0.85),
            "Upset": ("negative", "sadness", 0.85),
            "Bad": ("negative", "sadness", 0.90),
            "Terrible": ("strongly_negative", "distress", 0.95),
            # Alternative labels
            "Happy": ("positive", "happiness", 0.90),
            "Very Happy": ("positive", "joy", 0.95),
            "Sad": ("negative", "sadness", 0.85),
            "Very Sad": ("strongly_negative", "distress", 0.90),
            "Neutral": ("neutral", "neutral", 0.80),
            "Good": ("positive", "happiness", 0.85),
            "Excellent": ("positive", "joy", 0.95),
        }
        
        sentiment = "neutral"
        emotion = "neutral"
        confidence = 0.7
        reasoning_parts = []
        
        # Primary: Use mood_level
        if mood_level and mood_level in MOOD_SENTIMENT_MAP:
            sentiment, emotion, confidence = MOOD_SENTIMENT_MAP[mood_level]
            reasoning_parts.append(f"Mood: {mood_level}")
        
        # Adjust based on stress_level
        if stress_level:
            stress_lower = stress_level.lower()
            if "high" in stress_lower or "very high" in stress_lower:
                # High stress can push sentiment negative
                if sentiment == "positive":
                    sentiment = "mixed"
                    confidence = min(confidence, 0.75)
                elif sentiment == "neutral":
                    sentiment = "negative"
                    confidence = min(confidence, 0.80)
                reasoning_parts.append(f"High stress detected")
            elif "low" in stress_lower:
                reasoning_parts.append(f"Low stress")
        
        # Adjust based on energy_level
        if energy_level:
            energy_lower = energy_level.lower()
            if energy_lower == "low" and sentiment in ("neutral", "negative"):
                # Low energy + neutral/negative = more negative
                if sentiment == "neutral":
                    sentiment = "negative"
                    emotion = "fatigue"
                reasoning_parts.append(f"Low energy")
            elif energy_lower == "high" and sentiment in ("positive", "neutral"):
                reasoning_parts.append(f"High energy")
        
        # Check feel_better
        if feel_better:
            if feel_better.lower() in ("no", "false"):
                if sentiment == "positive":
                    sentiment = "mixed"
                reasoning_parts.append("Feel better: No")
            else:
                reasoning_parts.append("Feel better: Yes")
        
        reasoning = f"Derived from user context: {'; '.join(reasoning_parts)}"
        
        return EnsembleResult(
            xlm_roberta=XLMRobertaOutput(
                sentiment=sentiment,
                confidence=confidence,
                interpretation=reasoning,
                detected_language="context",
            ),
            bisaya_model=None,
            emotion_detection=EmotionOutput(
                emotions=[emotion],
                scores={emotion: confidence},
                dominant_emotion=emotion,
            ),
            final_result={
                "sentiment": sentiment,
                "combined_confidence": confidence,
                "reasoning": reasoning,
                "emotions": [emotion],
                "dominant_emotion": emotion,
                "flags": ["context_derived"],
                "language_detection": {
                    "dominant": "context",
                    "bisaya_ratio": 0.0,
                    "tagalog_ratio": 0.0,
                    "english_ratio": 0.0,
                },
            },
        )
    
    def _fallback_xlm_output(self, text: str, lang_detection: Dict) -> XLMRobertaOutput:
        """Fallback XLM output using mental health analyzer."""
        mh_result = self.mental_health_analyzer.analyze(text)
        return XLMRobertaOutput(
            sentiment=mh_result.sentiment,
            confidence=mh_result.confidence,
            interpretation=mh_result.reasoning,
            detected_language=lang_detection.get("dominant_language", "unknown"),
            emotions=mh_result.emotions,
            raw_scores=mh_result.raw_scores,
        )
    
    def _fallback_emotion_output(self) -> EmotionOutput:
        """Fallback emotion output."""
        return EmotionOutput(
            emotions=["neutral"],
            scores={"neutral": 1.0},
            dominant_emotion="neutral",
        )
    
    def _fallback_bisaya_output(self, xlm_output: XLMRobertaOutput) -> BisayaModelOutput:
        """Fallback Bisaya output using mental health analyzer."""
        return BisayaModelOutput(
            sentiment=xlm_output.sentiment,
            confidence=xlm_output.confidence,
            correction="",
            analysis="Fallback: Using XLM-RoBERTa output (Bisaya model unavailable)",
            emotions=xlm_output.emotions,
            raw_scores=xlm_output.raw_scores,
        )


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

_ensemble_pipeline: Optional[EnsembleSentimentPipeline] = None


def get_ensemble_pipeline() -> EnsembleSentimentPipeline:
    """Get singleton ensemble pipeline instance."""
    global _ensemble_pipeline
    if _ensemble_pipeline is None:
        _ensemble_pipeline = EnsembleSentimentPipeline()
    return _ensemble_pipeline


def analyze_ensemble(
    text: str,
    mood_level: Optional[str] = None,
    energy_level: Optional[str] = None,
    stress_level: Optional[str] = None,
    feel_better: Optional[str] = None,
) -> Dict:
    """
    Analyze text using the ensemble pipeline.
    
    Convenience function that returns JSON-serializable dict.
    """
    pipeline = get_ensemble_pipeline()
    result = pipeline.analyze(
        text,
        mood_level=mood_level,
        energy_level=energy_level,
        stress_level=stress_level,
        feel_better=feel_better,
    )
    return result.to_dict()
