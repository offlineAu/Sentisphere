from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Dict, Optional, List, Tuple

from .text_cleaning import clean_text, tokenize

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


@lru_cache(maxsize=1)
def get_sentiment_model():
    """Lazy-load and cache the preferred sentiment model instance."""
    if _HAS_TRANSFORMERS:
        try:
            tok = AutoTokenizer.from_pretrained("xlm-roberta-base")
            mdl = AutoModelForMaskedLM.from_pretrained("xlm-roberta-base")
            return _XLMRWrapper(tok, mdl)
        except Exception:
            pass
    return SimpleSentimentModel()


def analyze_text(text: str) -> SentimentOutput:
    model = get_sentiment_model()
    return model.predict(text)
