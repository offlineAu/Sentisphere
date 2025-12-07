"""
Bisaya/Cebuano Language Detection Utilities for Sentisphere
============================================================
Detect Bisaya/Cebuano language markers to determine when to route
to the specialized Bisaya sentiment model.
"""

from __future__ import annotations

import re
from typing import Dict, List, Tuple, Set
from functools import lru_cache


# =============================================================================
# BISAYA MORPHOLOGY MARKERS
# =============================================================================

# Common Cebuano/Bisaya affixes and particles
BISAYA_PARTICLES: Set[str] = {
    # Intensifiers
    "kaayo", "gyud", "jud", "gid", "guid", "man", "lang", "ra", "bitaw",
    "diay", "daw", "ba", "gani", "pod", "pud", "sab", "usab", "pa",
    # Pronouns/determiners
    "ko", "nako", "ako", "ka", "nimo", "imo", "siya", "niya", "iya",
    "kita", "nato", "ato", "mo", "ninyo", "inyo", "sila", "nila", "ila",
    "kini", "kana", "kadto", "asa", "kinsa", "unsa", "ngano", "kanus-a",
    # Linkers
    "nga", "sa", "ug", "og", "ang", "si", "ni", "kay", "kung", "kon",
    # Time/aspect markers
    "na", "pa", "nag", "naga", "mag", "maga", "mi", "mo", "gi", "gina",
    # Negation
    "dili", "wala", "ayaw", "walay",
    # Common verbs/expressions unique to Cebuano
    "mao", "unya", "dayon", "usahay", "kanunay", "pirmi", "permi",
}

# Bisaya-specific words that indicate Cebuano text
BISAYA_VOCABULARY: Set[str] = {
    # Emotions/states
    "kapoy", "kakapoy", "gikapoy", "hago", "gahago", "lipay", "malipay",
    "nalipay", "malipayon", "subo", "kasubo", "nasubo", "hadlok", "nahadlok",
    "lagot", "kalagot", "nasuko", "sapot",
    # Common words
    "maayo", "maayong", "nindot", "gwapa", "gwapo", "ganahan", "nalingaw",
    "lisod", "kalisod", "malisod", "hasol", "samok", "gubot", "libog",
    "kulba", "kabalaka", "ulaw", "luoy", "hilakon", "sakit", "labad",
    "bughat", "luya", "maluya", "grabe", "grabeng",
    # Relationship terms
    "uyab", "tropa", "barkada", "higala", "amigo", "kauban", "uban",
    # Actions
    "padayon", "keri", "pwede", "mahimo", "mangita", "motan-aw", "maminaw",
    "naay", "wala", "dunay", "adunay",
    # Places/directions
    "diri", "didto", "ari", "adto", "taas", "ubos", "kilid",
    # Question words
    "ambot", "ambut", "basin", "tingali",
}

# Tagalog words to distinguish from Bisaya
TAGALOG_MARKERS: Set[str] = {
    "ako", "ikaw", "siya", "kami", "tayo", "sila",  # pronouns (some overlap)
    "ang", "ng", "mga", "na", "pa",  # particles
    "hindi", "wala", "ayaw",  # negation
    "masaya", "malungkot", "galit", "takot", "pagod",  # emotions
    "sobra", "sobrang", "napaka", "grabe",  # intensifiers
    "kaya", "kakayanin", "laban", "tuloy", "sige",  # coping
}

# English stopwords to filter out
ENGLISH_STOPWORDS: Set[str] = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "shall", "can", "need", "dare",
    "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
    "into", "through", "during", "before", "after", "above", "below",
    "between", "under", "again", "further", "then", "once", "here",
    "there", "when", "where", "why", "how", "all", "each", "few",
    "more", "most", "other", "some", "such", "no", "nor", "not", "only",
    "own", "same", "so", "than", "too", "very", "just", "also",
    "and", "but", "or", "if", "because", "until", "while",
    "i", "me", "my", "myself", "we", "our", "ours", "ourselves",
    "you", "your", "yours", "yourself", "yourselves", "he", "him",
    "his", "himself", "she", "her", "hers", "herself", "it", "its",
    "itself", "they", "them", "their", "theirs", "themselves",
    "what", "which", "who", "whom", "this", "that", "these", "those",
}


class BisayaDetector:
    """
    Detect Bisaya/Cebuano language presence in text.
    
    Used to determine when to route to the specialized Bisaya sentiment model
    in the ensemble pipeline.
    """
    
    # Threshold for considering text as "heavily Bisaya"
    HEAVY_BISAYA_THRESHOLD = 0.4  # 40% Bisaya tokens
    MODERATE_BISAYA_THRESHOLD = 0.2  # 20% Bisaya tokens
    
    def __init__(self):
        self._word_pattern = re.compile(r'\b\w+\b')
        # Compile Bisaya morphological patterns
        self._affix_patterns = self._compile_affix_patterns()
    
    def _compile_affix_patterns(self) -> List[re.Pattern]:
        """Compile regex patterns for Bisaya affixes."""
        patterns = [
            # Verbal affixes
            re.compile(r'^(nag|naga|mag|maga|mi|mo|gi|gina|na|pa|ma|i|ka)'),  # prefixes
            re.compile(r'(on|an|hon|han|ay|i)$'),  # suffixes
            # Cebuano reduplication (e.g., kapoy-kapoy, hinay-hinay)
            re.compile(r'^(\w{3,})-\1$'),
            # "ka-" intensifier prefix (kakapoy, kasubo, etc.)
            re.compile(r'^ka[a-z]{4,}$'),
        ]
        return patterns
    
    @lru_cache(maxsize=1000)
    def detect(self, text: str) -> Dict:
        """
        Detect language composition in text.
        
        Returns:
            Dict with keys:
            - bisaya_ratio: float (0.0 to 1.0)
            - tagalog_ratio: float (0.0 to 1.0)
            - english_ratio: float (0.0 to 1.0)
            - dominant_language: str ("bisaya", "tagalog", "english", "mixed")
            - is_heavily_bisaya: bool
            - bisaya_markers_found: List[str]
        """
        if not text or not text.strip():
            return self._empty_result()
        
        # Tokenize
        tokens = [t.lower() for t in self._word_pattern.findall(text)]
        if not tokens:
            return self._empty_result()
        
        # Count language markers
        bisaya_tokens = []
        tagalog_tokens = []
        english_tokens = []
        other_tokens = []
        
        for token in tokens:
            if token in BISAYA_PARTICLES or token in BISAYA_VOCABULARY:
                bisaya_tokens.append(token)
            elif token in TAGALOG_MARKERS:
                tagalog_tokens.append(token)
            elif token in ENGLISH_STOPWORDS or self._is_english_word(token):
                english_tokens.append(token)
            elif self._has_bisaya_morphology(token):
                bisaya_tokens.append(token)
            else:
                other_tokens.append(token)
        
        total = len(tokens)
        bisaya_ratio = len(bisaya_tokens) / total
        tagalog_ratio = len(tagalog_tokens) / total
        english_ratio = len(english_tokens) / total
        
        # Determine dominant language
        if bisaya_ratio >= self.HEAVY_BISAYA_THRESHOLD:
            dominant = "bisaya"
        elif tagalog_ratio > bisaya_ratio and tagalog_ratio > english_ratio:
            dominant = "tagalog"
        elif english_ratio > 0.5:
            dominant = "english"
        else:
            dominant = "mixed"
        
        return {
            "bisaya_ratio": round(bisaya_ratio, 3),
            "tagalog_ratio": round(tagalog_ratio, 3),
            "english_ratio": round(english_ratio, 3),
            "dominant_language": dominant,
            "is_heavily_bisaya": bisaya_ratio >= self.HEAVY_BISAYA_THRESHOLD,
            "is_moderately_bisaya": bisaya_ratio >= self.MODERATE_BISAYA_THRESHOLD,
            "bisaya_markers_found": list(set(bisaya_tokens)),
            "total_tokens": total,
        }
    
    def _empty_result(self) -> Dict:
        """Return empty detection result."""
        return {
            "bisaya_ratio": 0.0,
            "tagalog_ratio": 0.0,
            "english_ratio": 0.0,
            "dominant_language": "unknown",
            "is_heavily_bisaya": False,
            "is_moderately_bisaya": False,
            "bisaya_markers_found": [],
            "total_tokens": 0,
        }
    
    def _is_english_word(self, token: str) -> bool:
        """
        Simple heuristic for English words.
        
        Returns True if token looks like common English.
        """
        # Common English patterns (simplified)
        english_endings = {"ing", "tion", "ness", "ment", "able", "ible", "ful", "less", "ly"}
        for ending in english_endings:
            if token.endswith(ending) and len(token) > len(ending) + 2:
                return True
        return False
    
    def _has_bisaya_morphology(self, token: str) -> bool:
        """
        Check if token has Bisaya morphological patterns.
        """
        for pattern in self._affix_patterns:
            if pattern.search(token):
                return True
        return False
    
    def should_use_bisaya_model(self, text: str, base_confidence: float) -> Tuple[bool, str]:
        """
        Determine if Bisaya model should be used for refinement.
        
        Args:
            text: Input text
            base_confidence: Confidence from base XLM-RoBERTa model
            
        Returns:
            Tuple of (should_use: bool, reason: str)
        """
        detection = self.detect(text)
        
        # Low confidence triggers refinement
        if base_confidence < 0.70:
            return True, f"Low base confidence ({base_confidence:.2f} < 0.70)"
        
        # Heavy Bisaya triggers refinement
        if detection["is_heavily_bisaya"]:
            markers = ", ".join(detection["bisaya_markers_found"][:5])
            return True, f"Heavy Bisaya content ({detection['bisaya_ratio']:.0%}): {markers}"
        
        # Moderate Bisaya with medium confidence triggers refinement
        if detection["is_moderately_bisaya"] and base_confidence < 0.80:
            return True, f"Moderate Bisaya ({detection['bisaya_ratio']:.0%}) with medium confidence ({base_confidence:.2f})"
        
        return False, "Base model confidence sufficient for non-Bisaya text"


# Singleton instance
_detector = BisayaDetector()


def detect_bisaya(text: str) -> Dict:
    """Detect Bisaya language presence in text."""
    return _detector.detect(text)


def should_use_bisaya_model(text: str, base_confidence: float) -> Tuple[bool, str]:
    """Determine if Bisaya refinement model should be used."""
    return _detector.should_use_bisaya_model(text, base_confidence)
