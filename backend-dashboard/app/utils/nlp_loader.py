from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Dict, Optional, List, Tuple

from .text_cleaning import clean_text, tokenize
from .mental_health_analyzer import (
    analyze_with_context,
    analyze_text_simple,
    SentimentOutput as MHSentimentOutput,
)

try:  # Optional heavy deps
    import torch
    from transformers import AutoTokenizer, AutoModelForMaskedLM
    _HAS_TRANSFORMERS = True
except Exception:  # pragma: no cover - runtime optional
    _HAS_TRANSFORMERS = False
    torch = None  # type: ignore
    AutoTokenizer = AutoModelForMaskedLM = None  # type: ignore


@dataclass(slots=True)
class SentimentOutput:
    sentiment: str
    emotions: str
    confidence: float
    model_version: str


class _XLMRWrapper:
    def __init__(self, tok, mdl) -> None:
        self.tok = tok
        self.mdl = mdl
        # Primary label tokens across languages (single-token where possible)
        self.labels: Dict[str, List[str]] = {
            "positive": ["positive", "positibo"],
            "negative": ["negative", "negatibo"],
            "neutral": ["neutral"],
        }
        # Prompts in different languages to bias MLM towards label words
        mt = tok.mask_token
        self.prompts: List[str] = [
            f"overall sentiment: {mt}.",
            f"the mood is {mt}.",
            f"ang damdamin ay {mt}.",
        ]

    def _score_prompt(self, prompt: str) -> Dict[str, float]:
        enc = self.tok(prompt, return_tensors="pt")
        input_ids = enc["input_ids"]
        mask_idx = (input_ids == self.tok.mask_token_id).nonzero(as_tuple=False)
        if mask_idx.numel() == 0:  # pragma: no cover - defensive
            return {"positive": 0.0, "negative": 0.0, "neutral": 0.0}
        with torch.no_grad():
            logits = self.mdl(**enc).logits
        # Use first mask in case tokenizer produced multiple (should be one)
        mi = mask_idx[0, 1]
        probs = torch.softmax(logits[0, mi], dim=-1)
        out: Dict[str, float] = {}
        for lab, words in self.labels.items():
            p = 0.0
            for w in words:
                wid = self.tok.convert_tokens_to_ids(self.tok.tokenize(w))
                if not wid:
                    continue
                # Only consider the first subword for masked token
                p += float(probs[wid[0]])
            out[lab] = p
        return out

    def predict(self, text: str) -> SentimentOutput:
        t = clean_text(text)
        if not t:
            return SentimentOutput("neutral", "neutral", 0.5, "xlm-roberta-mlm-v1")
        # Concatenate text with prompt to provide context
        agg: Dict[str, float] = {"positive": 0.0, "negative": 0.0, "neutral": 0.0}
        for p in self.prompts:
            s = self._score_prompt(t + "\n" + p)
            for k, v in s.items():
                agg[k] += v
        # Normalize and pick top
        total = sum(agg.values()) or 1.0
        for k in list(agg.keys()):
            agg[k] = agg[k] / total
        label = max(agg.items(), key=lambda kv: kv[1])[0]
        conf = max(agg.values())
        return SentimentOutput(label, label, round(float(conf), 3), "xlm-roberta-mlm-v1")


class SimpleSentimentModel:
    """Heuristic fallback when transformers are unavailable."""

    _positive_keywords: Dict[str, float] = {
        "happy": 0.9,
        "joy": 0.85,
        "great": 0.8,
        "good": 0.75,
        "excited": 0.82,
        "love": 0.88,
        "grateful": 0.83,
        "positibo": 0.8,
        "maayo": 0.78,
        "malipay": 0.8,
        "masaya": 0.82,
    }
    _negative_keywords: Dict[str, float] = {
        "sad": 0.9,
        "angry": 0.85,
        "bad": 0.75,
        "anxious": 0.82,
        "worried": 0.8,
        "stress": 0.78,
        "depressed": 0.9,
        "negatibo": 0.82,
        "bati": 0.78,
        "malungkot": 0.83,
        "galit": 0.82,
    }

    def predict(self, text: str) -> SentimentOutput:
        cleaned = clean_text(text)
        tokens = [t for t in tokenize(cleaned) if len(t) > 2]

        score = 0.0
        for token in tokens:
            if token in self._positive_keywords:
                score += self._positive_keywords[token]
            elif token in self._negative_keywords:
                score -= self._negative_keywords[token]

        magnitude = abs(score)
        if magnitude >= 0.6:
            label = "positive" if score > 0 else "negative"
        elif magnitude >= 0.15:
            label = "neutral"  # avoid "mixed" to keep 3-way
        else:
            label = "neutral"
        conf = min(1.0, 0.5 + magnitude)
        return SentimentOutput(label, label, round(conf, 2), "heuristic-1.0")


class _FineTunedWrapper:
    """Wrapper for fine-tuned sequence classification model."""
    
    def __init__(self, tok, mdl) -> None:
        self.tok = tok
        self.mdl = mdl
        self.id2label = mdl.config.id2label
    
    def predict(self, text: str) -> SentimentOutput:
        t = clean_text(text)
        if not t:
            return SentimentOutput("neutral", "neutral", 0.5, "finetuned-xlmr-v1")
        
        enc = self.tok(t, return_tensors="pt", truncation=True, max_length=256)
        with torch.no_grad():
            logits = self.mdl(**enc).logits
        
        probs = torch.softmax(logits[0], dim=-1)
        pred_id = torch.argmax(probs).item()
        conf = probs[pred_id].item()
        label = self.id2label.get(pred_id, "neutral")
        
        return SentimentOutput(label, label, round(float(conf), 3), "finetuned-xlmr-v1")


# Path to fine-tuned model (local or downloaded from HuggingFace)
import os as _os
_FINETUNED_MODEL_PATH = _os.path.join(
    _os.path.dirname(_os.path.dirname(_os.path.dirname(__file__))), "models", "bisaya-sentiment"
)
_HF_MODEL_REPO = "OfflineAu/sentisphere-bisaya-sentiment"


def _ensure_model_downloaded() -> str:
    """Download model from HuggingFace if not present locally.
    
    Returns the model path (local path or HuggingFace repo ID for direct loading).
    """
    # Check if local model exists
    if _os.path.exists(_FINETUNED_MODEL_PATH) and _os.path.exists(
        _os.path.join(_FINETUNED_MODEL_PATH, "model.safetensors")
    ):
        print(f"[NLP] Using local model at {_FINETUNED_MODEL_PATH}")
        return _FINETUNED_MODEL_PATH
    
    # For Railway/production: just return HF repo ID (transformers can load directly)
    # This avoids downloading to local disk which may not persist
    print(f"[NLP] Will load model directly from HuggingFace: {_HF_MODEL_REPO}")
    return _HF_MODEL_REPO


@lru_cache(maxsize=1)
def get_sentiment_model():
    """Lazy-load and cache the preferred sentiment model instance.
    
    Priority:
    1. Fine-tuned model (local or downloaded from HuggingFace)
    2. Zero-shot XLM-RoBERTa MLM
    3. Heuristic fallback
    """
    if _HAS_TRANSFORMERS:
        # Try fine-tuned model first (local or from HuggingFace)
        model_source = _ensure_model_downloaded()
        try:
            from transformers import AutoModelForSequenceClassification
            tok = AutoTokenizer.from_pretrained(model_source)
            mdl = AutoModelForSequenceClassification.from_pretrained(model_source)
            print(f"[NLP] Loaded fine-tuned model from {model_source}")
            return _FineTunedWrapper(tok, mdl)
        except Exception as e:
            print(f"[NLP] Failed to load fine-tuned model: {e}")
        
        # Fall back to zero-shot MLM
        try:
            tok = AutoTokenizer.from_pretrained("xlm-roberta-base")
            mdl = AutoModelForMaskedLM.from_pretrained("xlm-roberta-base")
            print("[NLP] Using zero-shot XLM-RoBERTa MLM")
            return _XLMRWrapper(tok, mdl)
        except Exception:
            pass
    
    print("[NLP] Using heuristic fallback")
    return SimpleSentimentModel()


def analyze_text(text: str) -> SentimentOutput:
    """
    Analyze text for sentiment (backward compatible, no user context).
    
    For better results with mental health check-ins, use analyze_checkin_text()
    which accepts user-reported mood/stress/energy.
    """
    # Use the new mental health analyzer
    result = analyze_text_simple(text)
    return SentimentOutput(
        sentiment=result.sentiment,
        emotions=result.emotions,
        confidence=result.confidence,
        model_version=result.model_version,
    )


def analyze_checkin_text(
    text: str,
    mood_level: Optional[str] = None,
    energy_level: Optional[str] = None,
    stress_level: Optional[str] = None,
    feel_better: Optional[str] = None,
) -> SentimentOutput:
    """
    Analyze check-in text with user context for accurate sentiment.
    
    This function integrates user-reported emotional state to prevent
    contradictory outputs (e.g., "positive" when user reports high stress).
    
    Args:
        text: The check-in comment
        mood_level: User's reported mood (Awesome, Great, Okay, Meh, Anxious, Bad, etc.)
        energy_level: User's reported energy (Low, Moderate, High)
        stress_level: User's reported stress (No Stress, Low Stress, Moderate, High Stress, Very High Stress)
        feel_better: Whether user feels better (Yes, No, Same)
    
    Returns:
        SentimentOutput with context-aware sentiment and emotions
    """
    result = analyze_with_context(
        text,
        mood_level=mood_level,
        energy_level=energy_level,
        stress_level=stress_level,
        feel_better=feel_better,
    )
    return SentimentOutput(
        sentiment=result.sentiment,
        emotions=result.emotions,
        confidence=result.confidence,
        model_version=result.model_version,
    )


def get_legacy_model():
    """
    Get the legacy XLM-RoBERTa or heuristic model.
    Kept for backward compatibility and comparison testing.
    """
    return get_sentiment_model()
