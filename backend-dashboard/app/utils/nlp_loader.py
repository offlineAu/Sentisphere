from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Dict

from .text_cleaning import clean_text, tokenize


@dataclass(slots=True)
class SentimentOutput:
    sentiment: str
    emotions: str
    confidence: float
    model_version: str


class SimpleSentimentModel:
    """Lightweight heuristic sentiment model.

    This avoids heavyweight dependencies while still providing
    deterministic outputs suitable for dashboards and tests.
    """

    _positive_keywords: Dict[str, float] = {
        "happy": 0.9,
        "joy": 0.85,
        "great": 0.8,
        "good": 0.75,
        "excited": 0.82,
        "love": 0.88,
        "grateful": 0.83,
    }
    _negative_keywords: Dict[str, float] = {
        "sad": 0.9,
        "angry": 0.85,
        "bad": 0.75,
        "anxious": 0.82,
        "worried": 0.8,
        "stress": 0.78,
        "depressed": 0.9,
    }

    def predict(self, text: str) -> SentimentOutput:
        cleaned = clean_text(text)
        tokens = [t for t in tokenize(cleaned) if len(t) > 2]

        score = 0.0
        positive_hits = []
        negative_hits = []

        for token in tokens:
            if token in self._positive_keywords:
                weight = self._positive_keywords[token]
                score += weight
                positive_hits.append((token, weight))
            elif token in self._negative_keywords:
                weight = self._negative_keywords[token]
                score -= weight
                negative_hits.append((token, weight))

        magnitude = abs(score)
        if magnitude >= 0.6:
            sentiment = "positive" if score > 0 else "negative"
        elif magnitude >= 0.15:
            sentiment = "mixed"
        else:
            sentiment = "neutral"

        if positive_hits and negative_hits:
            top_pos = max(positive_hits, key=lambda item: item[1])[0]
            top_neg = max(negative_hits, key=lambda item: item[1])[0]
            emotions = f"{top_pos}, {top_neg}"
        elif positive_hits:
            top_pos = max(positive_hits, key=lambda item: item[1])[0]
            emotions = top_pos
        elif negative_hits:
            top_neg = max(negative_hits, key=lambda item: item[1])[0]
            emotions = top_neg
        else:
            emotions = "neutral"

        confidence = min(1.0, 0.5 + magnitude)
        return SentimentOutput(
            sentiment=sentiment,
            emotions=emotions,
            confidence=round(confidence, 2),
            model_version="heuristic-1.0",
        )


@lru_cache(maxsize=1)
def get_sentiment_model() -> SimpleSentimentModel:
    """Lazy-load and cache the sentiment model instance."""
    return SimpleSentimentModel()


def analyze_text(text: str) -> SentimentOutput:
    model = get_sentiment_model()
    return model.predict(text)
