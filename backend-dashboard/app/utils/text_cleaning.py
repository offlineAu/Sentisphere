from __future__ import annotations

import re
import unicodedata
from typing import Iterable

_WHITESPACE_RE = re.compile(r"\s+")
_URL_RE = re.compile(r"https?://\S+")
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_PUNCT_RE = re.compile(r"[\u201c\u201d\u2019\u2018]")


def strip_accents(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def remove_urls(text: str) -> str:
    return _URL_RE.sub(" ", text)


def remove_html(text: str) -> str:
    return _HTML_TAG_RE.sub(" ", text)


def normalize_whitespace(text: str) -> str:
    return _WHITESPACE_RE.sub(" ", text).strip()


def normalize_punctuation(text: str) -> str:
    return _PUNCT_RE.sub("'", text)


def clean_text(text: str | None) -> str:
    if not text:
        return ""
    cleaned = text.lower()
    cleaned = strip_accents(cleaned)
    cleaned = normalize_punctuation(cleaned)
    cleaned = remove_html(cleaned)
    cleaned = remove_urls(cleaned)
    cleaned = re.sub(r"[^a-z0-9\s\.\,\!\?']", " ", cleaned)
    cleaned = normalize_whitespace(cleaned)
    return cleaned


def tokenize(text: str) -> list[str]:
    t = clean_text(text)
    return t.split()


def redact_pii(text_value: str) -> str:
    """Redact email addresses, phone numbers, and proper names."""
    if not text_value:
        return text_value
    s = text_value
    # Emails
    s = re.sub(r"[A-Za-z0-9_.+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+", "[REDACTED]", s)
    # Phones
    s = re.sub(r"\b\+?\d[\d\s-]{7,}\b", "[REDACTED]", s)
    # Proper names/capitalized phrases (simplified)
    s = re.sub(r"\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b", "[REDACTED]", s)
    return s
