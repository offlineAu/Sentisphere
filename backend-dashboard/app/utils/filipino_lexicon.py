"""
Filipino/Cebuano Mental Health Lexicon for Sentisphere
=======================================================
Comprehensive lexicon for detecting emotional states in Filipino,
Cebuano, Tagalog, and code-switched text.

Each entry has:
- word/phrase
- emotion category
- intensity (0.0-1.0)
- is_negation_sensitive (bool)
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, List, Set


@dataclass(frozen=True, slots=True)
class LexiconEntry:
    emotion: str  # Primary emotion category
    intensity: float  # 0.0-1.0
    is_stress_indicator: bool = False
    is_coping_phrase: bool = False  # Resilience that masks distress
    is_plea: bool = False  # Requests for help/relief


# =============================================================================
# STRESS & EXHAUSTION INDICATORS
# =============================================================================
STRESS_EXHAUSTION: Dict[str, LexiconEntry] = {
    # Cebuano
    "hago": LexiconEntry("exhaustion", 0.85, is_stress_indicator=True),
    "kapoy": LexiconEntry("exhaustion", 0.80, is_stress_indicator=True),
    "kakapoy": LexiconEntry("exhaustion", 0.85, is_stress_indicator=True),
    "gikapoy": LexiconEntry("exhaustion", 0.80, is_stress_indicator=True),
    "haggard": LexiconEntry("exhaustion", 0.75, is_stress_indicator=True),
    "bughat": LexiconEntry("exhaustion", 0.70, is_stress_indicator=True),
    "luya": LexiconEntry("exhaustion", 0.75, is_stress_indicator=True),
    "maluya": LexiconEntry("exhaustion", 0.75, is_stress_indicator=True),
    "grabe": LexiconEntry("intensity", 0.70, is_stress_indicator=True),  # Intensifier for negative
    "grabeng": LexiconEntry("intensity", 0.75, is_stress_indicator=True),
    "labad": LexiconEntry("pain", 0.70, is_stress_indicator=True),  # Headache
    "sakit": LexiconEntry("pain", 0.75, is_stress_indicator=True),
    "lisod": LexiconEntry("difficulty", 0.70, is_stress_indicator=True),
    "kalisod": LexiconEntry("difficulty", 0.75, is_stress_indicator=True),
    "malisod": LexiconEntry("difficulty", 0.70, is_stress_indicator=True),
    "hasol": LexiconEntry("difficulty", 0.65, is_stress_indicator=True),
    "samok": LexiconEntry("frustration", 0.70, is_stress_indicator=True),
    "kasamok": LexiconEntry("frustration", 0.75, is_stress_indicator=True),
    "lagot": LexiconEntry("frustration", 0.80, is_stress_indicator=True),
    "bwisit": LexiconEntry("frustration", 0.75, is_stress_indicator=True),
    
    # Tagalog
    "pagod": LexiconEntry("exhaustion", 0.80, is_stress_indicator=True),
    "napapagod": LexiconEntry("exhaustion", 0.80, is_stress_indicator=True),
    "pagod na pagod": LexiconEntry("exhaustion", 0.95, is_stress_indicator=True),
    "stressed": LexiconEntry("stress", 0.85, is_stress_indicator=True),
    "stress": LexiconEntry("stress", 0.80, is_stress_indicator=True),
    "hirap": LexiconEntry("difficulty", 0.75, is_stress_indicator=True),
    "nahihirapan": LexiconEntry("difficulty", 0.80, is_stress_indicator=True),
    "bigat": LexiconEntry("burden", 0.75, is_stress_indicator=True),
    "mabigat": LexiconEntry("burden", 0.80, is_stress_indicator=True),
    "overwhelmed": LexiconEntry("overwhelm", 0.85, is_stress_indicator=True),
    "burnout": LexiconEntry("burnout", 0.90, is_stress_indicator=True),
    "burned out": LexiconEntry("burnout", 0.90, is_stress_indicator=True),
    "drained": LexiconEntry("exhaustion", 0.85, is_stress_indicator=True),
    "ubos": LexiconEntry("exhaustion", 0.75, is_stress_indicator=True),  # "empty/used up"
    "ubos na": LexiconEntry("exhaustion", 0.85, is_stress_indicator=True),
    "wala ng lakas": LexiconEntry("exhaustion", 0.90, is_stress_indicator=True),
    "sobra": LexiconEntry("intensity", 0.65, is_stress_indicator=True),  # "too much"
    "sobrang": LexiconEntry("intensity", 0.65, is_stress_indicator=True),
    "ang dami": LexiconEntry("overwhelm", 0.60, is_stress_indicator=True),
    "ang hirap": LexiconEntry("difficulty", 0.75, is_stress_indicator=True),
    "nakakapagod": LexiconEntry("exhaustion", 0.80, is_stress_indicator=True),
    "nakakastress": LexiconEntry("stress", 0.85, is_stress_indicator=True),
    "nakakainis": LexiconEntry("frustration", 0.70, is_stress_indicator=True),
    "inis": LexiconEntry("frustration", 0.65, is_stress_indicator=True),
    "badtrip": LexiconEntry("frustration", 0.80, is_stress_indicator=True),
    "lungkot": LexiconEntry("sadness", 0.80, is_stress_indicator=True),
    "malungkot": LexiconEntry("sadness", 0.80, is_stress_indicator=True),
    "nalulungkot": LexiconEntry("sadness", 0.80, is_stress_indicator=True),
    "takot": LexiconEntry("fear", 0.75, is_stress_indicator=True),
    "natatakot": LexiconEntry("fear", 0.80, is_stress_indicator=True),
    "kinakabahan": LexiconEntry("anxiety", 0.80, is_stress_indicator=True),
    "kabado": LexiconEntry("anxiety", 0.75, is_stress_indicator=True),
    "anxious": LexiconEntry("anxiety", 0.80, is_stress_indicator=True),
    "anxiety": LexiconEntry("anxiety", 0.85, is_stress_indicator=True),
    "worried": LexiconEntry("anxiety", 0.75, is_stress_indicator=True),
    "worry": LexiconEntry("anxiety", 0.70, is_stress_indicator=True),
    "nag aalala": LexiconEntry("anxiety", 0.75, is_stress_indicator=True),
    "nababahala": LexiconEntry("anxiety", 0.80, is_stress_indicator=True),

    # Cebuano Expanded
    "hago": LexiconEntry("exhaustion", 0.85, is_stress_indicator=True),
    "kapoy": LexiconEntry("exhaustion", 0.80, is_stress_indicator=True),
    "kakapoy": LexiconEntry("exhaustion", 0.85, is_stress_indicator=True),
    "gikapoy": LexiconEntry("exhaustion", 0.80, is_stress_indicator=True),
    "haggard": LexiconEntry("exhaustion", 0.75, is_stress_indicator=True),
    "bughat": LexiconEntry("exhaustion", 0.70, is_stress_indicator=True),
    "luya": LexiconEntry("exhaustion", 0.75, is_stress_indicator=True),
    "maluya": LexiconEntry("exhaustion", 0.75, is_stress_indicator=True),
    "grabe": LexiconEntry("intensity", 0.70, is_stress_indicator=True),
    "grabeng": LexiconEntry("intensity", 0.75, is_stress_indicator=True),
    "labad": LexiconEntry("pain", 0.70, is_stress_indicator=True),
    "sakit": LexiconEntry("pain", 0.75, is_stress_indicator=True),
    "lisod": LexiconEntry("difficulty", 0.70, is_stress_indicator=True),
    "kalisod": LexiconEntry("difficulty", 0.75, is_stress_indicator=True),
    "malisod": LexiconEntry("difficulty", 0.70, is_stress_indicator=True),
    "hasol": LexiconEntry("difficulty", 0.65, is_stress_indicator=True),
    "samok": LexiconEntry("frustration", 0.70, is_stress_indicator=True),
    "kasamok": LexiconEntry("frustration", 0.75, is_stress_indicator=True),
    "lagot": LexiconEntry("frustration", 0.80, is_stress_indicator=True),
    "bwisit": LexiconEntry("frustration", 0.75, is_stress_indicator=True),

    # Cebuano – deeper emotional vocabulary
    "bug-at": LexiconEntry("emotional_burden", 0.80, is_stress_indicator=True),
    "natabunan": LexiconEntry("overwhelm", 0.85, is_stress_indicator=True),
    "naglibog": LexiconEntry("confusion", 0.70, is_stress_indicator=True),
    "libog": LexiconEntry("confusion", 0.75, is_stress_indicator=True),
    "gubot": LexiconEntry("mental_noise", 0.75, is_stress_indicator=True),
    "wala koy gana": LexiconEntry("apathy", 0.80, is_stress_indicator=True),
    "wala nay gana": LexiconEntry("apathy", 0.85, is_stress_indicator=True),
    "gikapoy og tao": LexiconEntry("social_exhaustion", 0.85, is_stress_indicator=True),
    "huot akong dughan": LexiconEntry("anxiety", 0.90, is_stress_indicator=True),
    "kulba": LexiconEntry("anxiety", 0.75, is_stress_indicator=True),
    "kabalaka": LexiconEntry("anxiety", 0.75, is_stress_indicator=True),
    "naguol": LexiconEntry("sadness", 0.70, is_stress_indicator=True),
    "ulaw": LexiconEntry("shame", 0.60, is_stress_indicator=False),
    "way klaro": LexiconEntry("lostness", 0.70, is_stress_indicator=True),
    "wa koy padulngan": LexiconEntry("hopelessness", 0.85, is_stress_indicator=True),
    "di ko okay": LexiconEntry("distress", 0.90, is_stress_indicator=True),

    # Tagalog Expanded
    "pagod": LexiconEntry("exhaustion", 0.80, is_stress_indicator=True),
    "nakakapagod": LexiconEntry("exhaustion", 0.85, is_stress_indicator=True),
    "sawang-sawa": LexiconEntry("hopelessness", 0.85, is_stress_indicator=True),
    "nakakasawa": LexiconEntry("frustration", 0.75, is_stress_indicator=True),
    "nahihirapan": LexiconEntry("difficulty", 0.80, is_stress_indicator=True),
    "hirap": LexiconEntry("difficulty", 0.70, is_stress_indicator=True),
    "sobrang hirap": LexiconEntry("difficulty", 0.85, is_stress_indicator=True),
    "masakit": LexiconEntry("pain", 0.75, is_stress_indicator=True),
    "masama loob": LexiconEntry("resentment", 0.75, is_stress_indicator=True),
    "kinakabahan": LexiconEntry("anxiety", 0.75, is_stress_indicator=True),
    "nasasaktan": LexiconEntry("emotional_pain", 0.80, is_stress_indicator=True),
    "lungkot": LexiconEntry("sadness", 0.70, is_stress_indicator=True),
    "malungkot": LexiconEntry("sadness", 0.75, is_stress_indicator=True),
    "iyak": LexiconEntry("crying", 0.80, is_stress_indicator=True),
    "naiiyak": LexiconEntry("crying", 0.75, is_stress_indicator=True),
    "naiinis": LexiconEntry("annoyed", 0.70, is_stress_indicator=True),
    "insecure": LexiconEntry("low_self_esteem", 0.80, is_stress_indicator=True),
    "walang gana": LexiconEntry("apathy", 0.80, is_stress_indicator=True),
    "ayoko na": LexiconEntry("breakpoint", 0.90, is_stress_indicator=True),
    "susuko na ako": LexiconEntry("hopelessness", 0.95, is_stress_indicator=True),

    # English Expanded
    "tired": LexiconEntry("exhaustion", 0.75, is_stress_indicator=True),
    "exhausted": LexiconEntry("exhaustion", 0.85, is_stress_indicator=True),
    "drained": LexiconEntry("exhaustion", 0.85, is_stress_indicator=True),
    "burned out": LexiconEntry("burnout", 0.90, is_stress_indicator=True),
    "overwhelmed": LexiconEntry("overwhelm", 0.90, is_stress_indicator=True),
    "stressed": LexiconEntry("stress", 0.80, is_stress_indicator=True),
    "pressure": LexiconEntry("pressure", 0.75, is_stress_indicator=True),
    "anxious": LexiconEntry("anxiety", 0.80, is_stress_indicator=True),
    "panicking": LexiconEntry("panic", 0.85, is_stress_indicator=True),
    "sad": LexiconEntry("sadness", 0.70, is_stress_indicator=True),
    "depressed": LexiconEntry("depression", 0.95, is_stress_indicator=True),
    "empty": LexiconEntry("emptiness", 0.85, is_stress_indicator=True),
    "numb": LexiconEntry("emotional_numbness", 0.85, is_stress_indicator=True),
    "lost": LexiconEntry("lostness", 0.80, is_stress_indicator=True),
    "hopeless": LexiconEntry("hopelessness", 0.90, is_stress_indicator=True),
    "worthless": LexiconEntry("self_worth", 0.90, is_stress_indicator=True),
    "angry": LexiconEntry("anger", 0.75, is_stress_indicator=True),
    "pissed": LexiconEntry("anger", 0.80, is_stress_indicator=True),
    "annoyed": LexiconEntry("annoyance", 0.70, is_stress_indicator=True),
    "frustrated": LexiconEntry("frustration", 0.80, is_stress_indicator=True),
    "can't handle this": LexiconEntry("overwhelm", 0.90, is_stress_indicator=True),
    "i give up": LexiconEntry("hopelessness", 0.95, is_stress_indicator=True),

    # Mixed Bisaya-Tagalog-English (very common in youth texts)
    "kapoy kaayo life": LexiconEntry("exhaustion", 0.90, is_stress_indicator=True),
    "sakit kaayo heart": LexiconEntry("emotional_pain", 0.85, is_stress_indicator=True),
    "stress kaayo": LexiconEntry("stress", 0.85, is_stress_indicator=True),
    "grabe pressure": LexiconEntry("pressure", 0.85, is_stress_indicator=True),
    "di ko okay fr": LexiconEntry("distress", 0.90, is_stress_indicator=True),
    "lowkey kapoy": LexiconEntry("exhaustion", 0.80, is_stress_indicator=True),
    "highkey sad": LexiconEntry("sadness", 0.80, is_stress_indicator=True),
    "idk anymore": LexiconEntry("hopelessness", 0.90, is_stress_indicator=True),
    "mentally tired": LexiconEntry("mental_fatigue", 0.85, is_stress_indicator=True),
    "emotionally drained": LexiconEntry("emotional_fatigue", 0.90, is_stress_indicator=True),

    # Relationship Conflict / Relational Distress (high weight to override positive relationship mentions)
    "nag aaway": LexiconEntry("relational_conflict", 0.90, is_stress_indicator=True),
    "nag-aaway": LexiconEntry("relational_conflict", 0.90, is_stress_indicator=True),
    "nagaaway": LexiconEntry("relational_conflict", 0.90, is_stress_indicator=True),
    "away": LexiconEntry("relational_conflict", 0.80, is_stress_indicator=True),
    "nag away": LexiconEntry("relational_conflict", 0.90, is_stress_indicator=True),
    "nag-away": LexiconEntry("relational_conflict", 0.90, is_stress_indicator=True),
    "nag away mi": LexiconEntry("relational_conflict", 0.92, is_stress_indicator=True),
    "nag aaway pajud": LexiconEntry("relational_conflict", 0.95, is_stress_indicator=True),
    "nag aaway mi": LexiconEntry("relational_conflict", 0.92, is_stress_indicator=True),
    "break up": LexiconEntry("relational_conflict", 0.90, is_stress_indicator=True),
    "breakup": LexiconEntry("relational_conflict", 0.90, is_stress_indicator=True),
    "naghiwalay": LexiconEntry("relational_conflict", 0.90, is_stress_indicator=True),
    "hiwalay": LexiconEntry("relational_conflict", 0.85, is_stress_indicator=True),
    "nakipag break": LexiconEntry("relational_conflict", 0.90, is_stress_indicator=True),
    "sinaktan": LexiconEntry("emotional_pain", 0.85, is_stress_indicator=True),
    "gisakitan": LexiconEntry("emotional_pain", 0.85, is_stress_indicator=True),
    "nasaktan": LexiconEntry("emotional_pain", 0.85, is_stress_indicator=True),
    "ghosted": LexiconEntry("relational_conflict", 0.80, is_stress_indicator=True),
    "gi-ghost": LexiconEntry("relational_conflict", 0.80, is_stress_indicator=True),
    "na-ghost": LexiconEntry("relational_conflict", 0.80, is_stress_indicator=True),
    "cold treatment": LexiconEntry("relational_conflict", 0.75, is_stress_indicator=True),
    "di na siya nagrereply": LexiconEntry("relational_conflict", 0.75, is_stress_indicator=True),
    "wala nami": LexiconEntry("sadness", 0.80, is_stress_indicator=True),
    "wala na mi": LexiconEntry("sadness", 0.85, is_stress_indicator=True),
    "wala nami ka": LexiconEntry("sadness", 0.80, is_stress_indicator=True),
    "ldr problems": LexiconEntry("relational_conflict", 0.70, is_stress_indicator=True),
    "tampuhan": LexiconEntry("relational_conflict", 0.70, is_stress_indicator=True),
    "tampo": LexiconEntry("relational_conflict", 0.65, is_stress_indicator=True),
    "nagtatampo": LexiconEntry("relational_conflict", 0.70, is_stress_indicator=True),
    "selos": LexiconEntry("relational_conflict", 0.70, is_stress_indicator=True),
    "nagseselos": LexiconEntry("relational_conflict", 0.75, is_stress_indicator=True),
    "cheated": LexiconEntry("relational_conflict", 0.95, is_stress_indicator=True),
    "niloko": LexiconEntry("relational_conflict", 0.90, is_stress_indicator=True),
    "gi-cheat": LexiconEntry("relational_conflict", 0.95, is_stress_indicator=True),
    "toxic relationship": LexiconEntry("relational_conflict", 0.90, is_stress_indicator=True),
    "toxic na": LexiconEntry("relational_conflict", 0.85, is_stress_indicator=True),

    # Humor masking (VERY IMPORTANT for Filipino youth sentiment)
    "HAHAHA pero sakit": LexiconEntry("masked_pain", 0.85, is_stress_indicator=True),
    "HAHA char lang": LexiconEntry("masking", 0.50, is_stress_indicator=False),
    "ok ra lagi pero dili diay": LexiconEntry("masked_distress", 0.90, is_stress_indicator=True),
    "i'm fine lol": LexiconEntry("masked_distress", 0.85, is_stress_indicator=True),

        # Exhaustion / Burnout
    "kapoy": LexiconEntry("exhaustion", 0.80, is_stress_indicator=True),
    "kakapoy": LexiconEntry("exhaustion", 0.85, is_stress_indicator=True),
    "gikapoy": LexiconEntry("exhaustion", 0.85, is_stress_indicator=True),
    "grabe kapoy": LexiconEntry("exhaustion", 0.90, is_stress_indicator=True),
    "gahago": LexiconEntry("exhaustion", 0.85, is_stress_indicator=True),
    "hago": LexiconEntry("exhaustion", 0.85, is_stress_indicator=True),
    "hingkapoy": LexiconEntry("exhaustion", 0.80, is_stress_indicator=True),
    "walay gana": LexiconEntry("exhaustion", 0.80, is_stress_indicator=True),
    "walay kusog": LexiconEntry("exhaustion", 0.80, is_stress_indicator=True),
    "kulang ug tulog": LexiconEntry("exhaustion", 0.90, is_stress_indicator=True),
    "kapoy kaayo": LexiconEntry("exhaustion", 0.90, is_stress_indicator=True),

    # Stress / Pressure
    "stres": LexiconEntry("stress", 0.85, is_stress_indicator=True),
    "stress": LexiconEntry("stress", 0.85, is_stress_indicator=True),
    "na-stress": LexiconEntry("stress", 0.90, is_stress_indicator=True),
    "nakastress": LexiconEntry("stress", 0.85, is_stress_indicator=True),
    "pressure": LexiconEntry("stress", 0.80, is_stress_indicator=True),
    "grabe pressure": LexiconEntry("stress", 0.90, is_stress_indicator=True),
    "bug-at kaayo": LexiconEntry("stress", 0.80, is_stress_indicator=True),
    "dako'g problema": LexiconEntry("stress", 0.90, is_stress_indicator=True),

    # Anxiety / Worry
    "kabalaka": LexiconEntry("anxiety", 0.80, is_stress_indicator=True),
    "nagkabalaaka": LexiconEntry("anxiety", 0.85, is_stress_indicator=True),
    "nabalaka": LexiconEntry("anxiety", 0.85, is_stress_indicator=True),
    "kulba": LexiconEntry("anxiety", 0.85, is_stress_indicator=True),
    "nahadlok": LexiconEntry("anxiety", 0.75, is_stress_indicator=True),
    "kabahan": LexiconEntry("anxiety", 0.80, is_stress_indicator=True),
    "naguol": LexiconEntry("sadness", 0.85, is_stress_indicator=True),
    "nag worries": LexiconEntry("anxiety", 0.90, is_stress_indicator=True),

    # Sadness
    "luoy kaayo": LexiconEntry("sadness", 0.85, is_stress_indicator=True),
    "kasubo": LexiconEntry("sadness", 0.85, is_stress_indicator=True),
    "nasubo": LexiconEntry("sadness", 0.80, is_stress_indicator=True),
    "hilakon": LexiconEntry("sadness", 0.85, is_stress_indicator=True),
    "bagsak ang mood": LexiconEntry("sadness", 0.85, is_stress_indicator=True),
    "low kaayo": LexiconEntry("sadness", 0.80, is_stress_indicator=True),

    # Overwhelm
    "overwhelm": LexiconEntry("overwhelm", 0.85, is_stress_indicator=True),
    "na-overwhelm": LexiconEntry("overwhelm", 0.90, is_stress_indicator=True),
    "naglibog": LexiconEntry("overwhelm", 0.75, is_stress_indicator=True),
    "kalibog": LexiconEntry("overwhelm", 0.80, is_stress_indicator=True),
    "di kabalo unsay buhaton": LexiconEntry("overwhelm", 0.90, is_stress_indicator=True),

    # Difficulty / Hardship
    "lisod": LexiconEntry("difficulty", 0.70, is_stress_indicator=True),
    "lisod kaayo": LexiconEntry("difficulty", 0.85, is_stress_indicator=True),
    "kalisod": LexiconEntry("difficulty", 0.80, is_stress_indicator=True),
    "malisod": LexiconEntry("difficulty", 0.75, is_stress_indicator=True),
    "hasol": LexiconEntry("difficulty", 0.70, is_stress_indicator=True),
    "samok": LexiconEntry("difficulty", 0.70, is_stress_indicator=True),
    "gubot": LexiconEntry("difficulty", 0.75, is_stress_indicator=True),

    # Pain / Discomfort
    "sakit": LexiconEntry("pain", 0.80, is_stress_indicator=True),
    "labad": LexiconEntry("pain", 0.75, is_stress_indicator=True),
    "sakit akong ulo": LexiconEntry("pain", 0.85, is_stress_indicator=True),
    "bughat": LexiconEntry("pain", 0.75, is_stress_indicator=True),
    "lawas sakit": LexiconEntry("pain", 0.85, is_stress_indicator=True),

    # Frustration / Anger
    "lagot": LexiconEntry("anger", 0.85, is_stress_indicator=True),
    "kalagot": LexiconEntry("anger", 0.90, is_stress_indicator=True),
    "nasuko": LexiconEntry("anger", 0.85, is_stress_indicator=True),
    "sapot": LexiconEntry("anger", 0.80, is_stress_indicator=True),
    "terrado": LexiconEntry("anger", 0.75, is_stress_indicator=True),
    "bwisit": LexiconEntry("frustration", 0.80, is_stress_indicator=True),
    "makalagot": LexiconEntry("frustration", 0.85, is_stress_indicator=True),

    # Intensifiers (negative)
    "grabe": LexiconEntry("intensity", 0.70, is_stress_indicator=True),
    "grabeng": LexiconEntry("intensity", 0.75, is_stress_indicator=True),
    "kaayo kaayo": LexiconEntry("intensity", 0.80, is_stress_indicator=True),
    "tungod kaayo": LexiconEntry("intensity", 0.85, is_stress_indicator=True),
    "dako kaayo": LexiconEntry("intensity", 0.80, is_stress_indicator=True),

    # Expressions with emotional weight
    "di nako kaya": LexiconEntry("overwhelm", 0.95, is_stress_indicator=True),
    "murag di nako": LexiconEntry("overwhelm", 0.95, is_stress_indicator=True),
    "kapoy na kaayo": LexiconEntry("exhaustion", 0.95, is_stress_indicator=True),
    "ginakaya ra": LexiconEntry("exhaustion", 0.85, is_stress_indicator=True),
    "pugong nalang": LexiconEntry("sadness", 0.85, is_stress_indicator=True),
    "hilak nalang": LexiconEntry("sadness", 0.90, is_stress_indicator=True),

}

# =============================================================================
# COPING PHRASES (Resilience that MASKS distress, NOT positivity)
# =============================================================================
COPING_PHRASES: Dict[str, LexiconEntry] = {
    # Cebuano
    "keri": LexiconEntry("coping", 0.50, is_coping_phrase=True),
    "keri ra": LexiconEntry("coping", 0.55, is_coping_phrase=True),
    "keri lang": LexiconEntry("coping", 0.55, is_coping_phrase=True),
    "pwede ra": LexiconEntry("coping", 0.50, is_coping_phrase=True),
    "sige lang": LexiconEntry("coping", 0.50, is_coping_phrase=True),
    "padayon": LexiconEntry("coping", 0.55, is_coping_phrase=True),  # "continue/persist"
    "padayon lang": LexiconEntry("coping", 0.55, is_coping_phrase=True),
    "maabot ra": LexiconEntry("coping", 0.50, is_coping_phrase=True),  # "we'll get there"
    
    # Tagalog
    "kaya": LexiconEntry("coping", 0.50, is_coping_phrase=True),
    "kakayanin": LexiconEntry("coping", 0.55, is_coping_phrase=True),  # "I'll endure it"
    "kaya ko": LexiconEntry("coping", 0.55, is_coping_phrase=True),
    "kaya ko to": LexiconEntry("coping", 0.55, is_coping_phrase=True),
    "kaya natin": LexiconEntry("coping", 0.55, is_coping_phrase=True),
    "kaya natin to": LexiconEntry("coping", 0.55, is_coping_phrase=True),
    "laban": LexiconEntry("coping", 0.55, is_coping_phrase=True),  # "fight on"
    "laban lang": LexiconEntry("coping", 0.55, is_coping_phrase=True),
    "kapit": LexiconEntry("coping", 0.60, is_coping_phrase=True),  # "hold on"
    "kapit lang": LexiconEntry("coping", 0.60, is_coping_phrase=True),
    "tiis": LexiconEntry("coping", 0.65, is_coping_phrase=True),  # "endure"
    "tiisin": LexiconEntry("coping", 0.65, is_coping_phrase=True),
    "tiis tiis": LexiconEntry("coping", 0.70, is_coping_phrase=True),
    "okay lang": LexiconEntry("coping", 0.50, is_coping_phrase=True),
    "ayos lang": LexiconEntry("coping", 0.50, is_coping_phrase=True),
    "sige lang": LexiconEntry("coping", 0.50, is_coping_phrase=True),
    "tuloy lang": LexiconEntry("coping", 0.50, is_coping_phrase=True),
    "go lang": LexiconEntry("coping", 0.45, is_coping_phrase=True),
    "push": LexiconEntry("coping", 0.50, is_coping_phrase=True),
    "push lang": LexiconEntry("coping", 0.55, is_coping_phrase=True),
    "konting tiis": LexiconEntry("coping", 0.65, is_coping_phrase=True),
    "konting kembot": LexiconEntry("coping", 0.55, is_coping_phrase=True),
    "para sa kinabukasan": LexiconEntry("coping", 0.60, is_coping_phrase=True),  # "for the future"

    "kapoy pero laban": LexiconEntry("mixed", 0.70, is_stress_indicator=True),
    "kapoy pero worth it": LexiconEntry("mixed", 0.65, is_stress_indicator=True),
    "puhon": LexiconEntry("hope", 0.60, is_stress_indicator=False),
    "soon ra": LexiconEntry("hope", 0.55, is_stress_indicator=False),
    "tiwala lang": LexiconEntry("hope", 0.55, is_stress_indicator=False),
    "trust the process": LexiconEntry("hope", 0.60, is_stress_indicator=False),
    "ayos lang kahit kapoy": LexiconEntry("mixed", 0.65, is_stress_indicator=True),
    "okay lang gihapon": LexiconEntry("neutral", 0.60, is_stress_indicator=False),

}

# =============================================================================
# PLEA / HELP-SEEKING PHRASES
# =============================================================================
PLEA_PHRASES: Dict[str, LexiconEntry] = {
    # Religious pleas (often indicate desperation, not gratitude)
    "lord": LexiconEntry("plea", 0.60, is_plea=True),
    "lord help": LexiconEntry("plea", 0.80, is_plea=True),
    "lord please": LexiconEntry("plea", 0.80, is_plea=True),
    "baka naman": LexiconEntry("plea", 0.70, is_plea=True),  # "maybe please"
    "sana": LexiconEntry("plea", 0.60, is_plea=True),  # "hopefully"
    "sana naman": LexiconEntry("plea", 0.70, is_plea=True),
    "give me a break": LexiconEntry("plea", 0.75, is_plea=True),
    "pahinga": LexiconEntry("plea", 0.65, is_plea=True),  # "rest"
    "need pahinga": LexiconEntry("plea", 0.80, is_plea=True),
    "break muna": LexiconEntry("plea", 0.70, is_plea=True),
    "help": LexiconEntry("plea", 0.75, is_plea=True),
    "tulong": LexiconEntry("plea", 0.80, is_plea=True),
    "i cant": LexiconEntry("plea", 0.75, is_plea=True),
    "di ko na kaya": LexiconEntry("plea", 0.90, is_plea=True),
    "ayoko na": LexiconEntry("plea", 0.85, is_plea=True),  # "I don't want anymore"
    "give up": LexiconEntry("plea", 0.80, is_plea=True),
    "parang ayaw ko na": LexiconEntry("plea", 0.85, is_plea=True),
    "gusto ko na huminto": LexiconEntry("plea", 0.80, is_plea=True),
}

# =============================================================================
# COPING LAUGHTER PATTERNS
# =============================================================================
COPING_LAUGHTER_PATTERNS: Set[str] = {
    "haha",
    "hahaha",
    "hahahaha",
    "hahahahaha",
    "hehe",
    "hehehe",
    "hihi",
    "huhu",
    "huhuhu",
    "hahahuhu",  # Laughing while crying
    "charot",  # "just kidding" - often masks real feelings
    "char",
    "chos",
    "chz",
    "jk",
    "joke",
    "joke lang",
    "biro",
    "biro lang",
    "lol",
    "lmao",
    "rofl",
    "sksksk",
    "😂",
    "🤣",
    "😭",  # Often used as laughing-crying
    "haiss",
    "haysss",
    "lmao kapoy",
    "lol pero ok lang",
    "char lang",
    "charrr",

}

# =============================================================================
# GENUINE POSITIVE INDICATORS
# =============================================================================
GENUINE_POSITIVE: Dict[str, LexiconEntry] = {
    # Cebuano
    "lipay": LexiconEntry("joy", 0.85),
    "malipay": LexiconEntry("joy", 0.85),
    "nalipay": LexiconEntry("joy", 0.85),
    "malipayon": LexiconEntry("joy", 0.85),
    "maayo": LexiconEntry("contentment", 0.70),
    "maayong": LexiconEntry("contentment", 0.70),
    "nindot": LexiconEntry("appreciation", 0.75),
    "gwapa": LexiconEntry("appreciation", 0.60),
    "gwapo": LexiconEntry("appreciation", 0.60),
    "ganahan": LexiconEntry("interest", 0.70),
    "nalingaw": LexiconEntry("enjoyment", 0.75),
    
    # Tagalog
    "masaya": LexiconEntry("joy", 0.85),
    "natutuwa": LexiconEntry("joy", 0.80),
    "maligaya": LexiconEntry("joy", 0.85),
    "saya": LexiconEntry("joy", 0.80),
    "happy": LexiconEntry("joy", 0.80),
    "excited": LexiconEntry("excitement", 0.80),
    "thankful": LexiconEntry("gratitude", 0.80),
    "grateful": LexiconEntry("gratitude", 0.85),
    "blessed": LexiconEntry("gratitude", 0.80),
    "salamat": LexiconEntry("gratitude", 0.75),
    "maraming salamat": LexiconEntry("gratitude", 0.85),
    "proud": LexiconEntry("pride", 0.80),
    "nagtagumpay": LexiconEntry("achievement", 0.85),
    "achieved": LexiconEntry("achievement", 0.80),
    "naabot": LexiconEntry("achievement", 0.75),
    "success": LexiconEntry("achievement", 0.85),
    "love": LexiconEntry("love", 0.85),
    "mahal": LexiconEntry("love", 0.80),
    "loved": LexiconEntry("love", 0.85),
    "hopeful": LexiconEntry("hope", 0.75),
    "pag-asa": LexiconEntry("hope", 0.75),
    "better": LexiconEntry("improvement", 0.70),
    "gumanda": LexiconEntry("improvement", 0.75),
    "bumuti": LexiconEntry("improvement", 0.75),
    "peaceful": LexiconEntry("peace", 0.80),
    "payapa": LexiconEntry("peace", 0.80),
    "calm": LexiconEntry("peace", 0.75),
    "relaxed": LexiconEntry("peace", 0.75),
    "chill": LexiconEntry("peace", 0.65),

    # Relationship / Social Support (positive reframing)
    "uyab": LexiconEntry("relationship_support", 0.70),
    "akong uyab": LexiconEntry("relationship_support", 0.75),
    "sakong uyab": LexiconEntry("relationship_support", 0.75),
    "bf": LexiconEntry("relationship_support", 0.65),
    "gf": LexiconEntry("relationship_support", 0.65),
    "jowa": LexiconEntry("relationship_support", 0.70),
    "babe": LexiconEntry("relationship_support", 0.65),
    "beh": LexiconEntry("relationship_support", 0.60),
    "spend time": LexiconEntry("relationship_support", 0.70),
    "quality time": LexiconEntry("relationship_support", 0.75),
    "bonding": LexiconEntry("relationship_support", 0.70),
    "kasama": LexiconEntry("connection", 0.65),
    "uban": LexiconEntry("connection", 0.65),
    "kauban": LexiconEntry("connection", 0.70),
    "friends": LexiconEntry("connection", 0.70),
    "barkada": LexiconEntry("connection", 0.70),
    "tropa": LexiconEntry("connection", 0.70),
    
    # Worth it / Value expressions (positive reframing, but can be mixed)
    "worth it": LexiconEntry("gratitude", 0.70),
    "worth it ra": LexiconEntry("gratitude", 0.65),
    "worth it ra japun": LexiconEntry("gratitude", 0.70),
    "sulit": LexiconEntry("appreciation", 0.70),
    "sulit kaayo": LexiconEntry("appreciation", 0.75),
    "paid off": LexiconEntry("achievement", 0.75),
    "nakuha ko": LexiconEntry("achievement", 0.70),
    "natapos": LexiconEntry("achievement", 0.70),
    "nagawa": LexiconEntry("achievement", 0.65),

    "winstreak": LexiconEntry("excitement", 0.80, is_stress_indicator=False),
    "yeess": LexiconEntry("excitement", 0.85, is_stress_indicator=False),
    "yessss": LexiconEntry("excitement", 0.90, is_stress_indicator=False),
    "yey": LexiconEntry("joy", 0.70, is_stress_indicator=False),
    "yeyyy": LexiconEntry("joy", 0.80, is_stress_indicator=False),
    "let's go": LexiconEntry("excitement", 0.75, is_stress_indicator=False),
    "go lang": LexiconEntry("motivation", 0.70, is_stress_indicator=False),
    "boom": LexiconEntry("excitement", 0.70, is_stress_indicator=False),
    "booooom": LexiconEntry("excitement", 0.85, is_stress_indicator=False),
    "solid": LexiconEntry("appreciation", 0.75, is_stress_indicator=False),
    "angas": LexiconEntry("pride", 0.70, is_stress_indicator=False),
    "nindot kaayo": LexiconEntry("joy", 0.80, is_stress_indicator=False),
    "kalami": LexiconEntry("appreciation", 0.75, is_stress_indicator=False),
    "payter": LexiconEntry("motivation", 0.75, is_stress_indicator=False),
    "nice kaayo": LexiconEntry("joy", 0.80, is_stress_indicator=False),
    "nice one": LexiconEntry("approval", 0.70, is_stress_indicator=False),
    "lit": LexiconEntry("excitement", 0.75, is_stress_indicator=False),
    "fire": LexiconEntry("excitement", 0.80, is_stress_indicator=False),
    "swerte": LexiconEntry("gratitude", 0.65, is_stress_indicator=False),
    "swerte kaayo": LexiconEntry("gratitude", 0.75, is_stress_indicator=False),

    # Happiness / Cheerfulness
    "malipay": LexiconEntry("happiness", 0.80, is_stress_indicator=False),
    "nalipay": LexiconEntry("happiness", 0.85, is_stress_indicator=False),
    "lipay kaayo": LexiconEntry("happiness", 0.90, is_stress_indicator=False),
    "happy kaayo": LexiconEntry("happiness", 0.85, is_stress_indicator=False),
    "lig-on kaayo": LexiconEntry("happiness", 0.80, is_stress_indicator=False),
    "ok ra kaayo": LexiconEntry("happiness", 0.70, is_stress_indicator=False),
    "ayos ra": LexiconEntry("happiness", 0.65, is_stress_indicator=False),

    # Calm / Peace / Stability
    "kalma ra": LexiconEntry("calm", 0.75, is_stress_indicator=False),
    "kalma kaayo": LexiconEntry("calm", 0.85, is_stress_indicator=False),
    "hupay na": LexiconEntry("calm", 0.80, is_stress_indicator=False),
    "okay ra": LexiconEntry("calm", 0.70, is_stress_indicator=False),
    "relax ra": LexiconEntry("calm", 0.75, is_stress_indicator=False),
    "narelax": LexiconEntry("calm", 0.80, is_stress_indicator=False),

    # Motivation / Hope
    "kaya ra": LexiconEntry("motivation", 0.85, is_stress_indicator=False),
    "makaya ra": LexiconEntry("motivation", 0.85, is_stress_indicator=False),
    "laban lang": LexiconEntry("motivation", 0.90, is_stress_indicator=False),
    "kaya pa": LexiconEntry("motivation", 0.80, is_stress_indicator=False),
    "padayon lang": LexiconEntry("motivation", 0.85, is_stress_indicator=False),
    "go lang": LexiconEntry("motivation", 0.80, is_stress_indicator=False),

    # Gratitude
    "salamat": LexiconEntry("gratitude", 0.70, is_stress_indicator=False),
    "thank you kaayo": LexiconEntry("gratitude", 0.80, is_stress_indicator=False),
    "dako kaayong pasalamat": LexiconEntry("gratitude", 0.85, is_stress_indicator=False),
    "grateful kaayo": LexiconEntry("gratitude", 0.90, is_stress_indicator=False),

    # Confidence / Strength
    "confident": LexiconEntry("confidence", 0.80, is_stress_indicator=False),
    "kampante": LexiconEntry("confidence", 0.75, is_stress_indicator=False),
    "kampante kaayo": LexiconEntry("confidence", 0.85, is_stress_indicator=False),
    "kusgan": LexiconEntry("confidence", 0.80, is_stress_indicator=False),
    "lig-on": LexiconEntry("confidence", 0.80, is_stress_indicator=False),
    "strong kaayo": LexiconEntry("confidence", 0.85, is_stress_indicator=False),

    # Love / Affection
    "gihigugma": LexiconEntry("affection", 0.85, is_stress_indicator=False),
    "gi-love kaayo": LexiconEntry("affection", 0.90, is_stress_indicator=False),
    "love kaayo": LexiconEntry("affection", 0.85, is_stress_indicator=False),

    # Humor / Lightheartedness
    "HAHAHA": LexiconEntry("humor", 0.70, is_stress_indicator=False),
    "lol": LexiconEntry("humor", 0.65, is_stress_indicator=False),
    "lingaw kaayo": LexiconEntry("humor", 0.80, is_stress_indicator=False),
    "lingaw": LexiconEntry("humor", 0.70, is_stress_indicator=False),
    "katawa kaayo": LexiconEntry("humor", 0.85, is_stress_indicator=False),

    # Excitement / Enthusiasm
    "ganahan kaayo": LexiconEntry("excitement", 0.85, is_stress_indicator=False),
    "ganahan ko": LexiconEntry("excitement", 0.80, is_stress_indicator=False),
    "excited kaayo": LexiconEntry("excitement", 0.90, is_stress_indicator=False),
    "nindot kaayo": LexiconEntry("excitement", 0.80, is_stress_indicator=False),
    "ayos kaayo": LexiconEntry("excitement", 0.75, is_stress_indicator=False),

    # Neutral-to-positive stability
    "normal ra": LexiconEntry("neutral", 0.50, is_stress_indicator=False),
    "okay lang": LexiconEntry("neutral", 0.55, is_stress_indicator=False),
    "sakto ra": LexiconEntry("neutral", 0.50, is_stress_indicator=False),
    "wala ra": LexiconEntry("neutral", 0.45, is_stress_indicator=False),
    "smooth ra": LexiconEntry("neutral", 0.60, is_stress_indicator=False),

    # Joy / Light Happiness
    "hinayahay": LexiconEntry("joy", 0.70, is_stress_indicator=False),
    "hayahay kaayo": LexiconEntry("joy", 0.80, is_stress_indicator=False),
    "mingaw ug nindot": LexiconEntry("joy", 0.75, is_stress_indicator=False),
    "ganahan kaayo": LexiconEntry("joy", 0.80, is_stress_indicator=False),
    "lingaw kaayo": LexiconEntry("enjoyment", 0.80, is_stress_indicator=False),
    "nalipay ko gamay": LexiconEntry("joy", 0.60, is_stress_indicator=False),
    "happy ko gamay": LexiconEntry("joy", 0.65, is_stress_indicator=False),
    "kalipay ra": LexiconEntry("joy", 0.65, is_stress_indicator=False),

    # Peace / Calmness
    "kalma ra kaayo": LexiconEntry("peace", 0.75, is_stress_indicator=False),
    "relax ra": LexiconEntry("peace", 0.60, is_stress_indicator=False),
    "chill ra kaayo": LexiconEntry("peace", 0.70, is_stress_indicator=False),
    "cool ra kaayo": LexiconEntry("peace", 0.70, is_stress_indicator=False),
    "hinay-hinay lang": LexiconEntry("peace", 0.55, is_stress_indicator=False),
    "wala koy daghan hunahuna": LexiconEntry("peace", 0.65, is_stress_indicator=False),

    # Contentment / Gratitude
    "maayo ra kaayo": LexiconEntry("contentment", 0.75, is_stress_indicator=False),
    "nindot ra akong paminaw": LexiconEntry("contentment", 0.75, is_stress_indicator=False),
    "nindot kaayo ang adlaw": LexiconEntry("contentment", 0.80, is_stress_indicator=False),
    "salamat kaayo": LexiconEntry("gratitude", 0.80, is_stress_indicator=False),
    "grateful ko karon": LexiconEntry("gratitude", 0.85, is_stress_indicator=False),
    "daghan kaayong salamat": LexiconEntry("gratitude", 0.90, is_stress_indicator=False),

    # Appreciation / Connection
    "nindot kaayo sila": LexiconEntry("connection", 0.70, is_stress_indicator=False),
    "ganahan ko sa mga tao diri": LexiconEntry("connection", 0.75, is_stress_indicator=False),
    "nice kaayo ilang energy": LexiconEntry("connection", 0.70, is_stress_indicator=False),
    "feel nako supported ko": LexiconEntry("connection", 0.80, is_stress_indicator=False),

    # Motivation / Hopefulness
    "padayon ko": LexiconEntry("hope", 0.70, is_stress_indicator=False),
    "naka move forward ko": LexiconEntry("improvement", 0.75, is_stress_indicator=False),
    "okay na ko karon": LexiconEntry("improvement", 0.65, is_stress_indicator=False),
    "mas nindot akong mindset": LexiconEntry("improvement", 0.75, is_stress_indicator=False),
    "naa koy paglaum": LexiconEntry("hope", 0.75, is_stress_indicator=False),
    "mura'g maayo akong ugma": LexiconEntry("hope", 0.80, is_stress_indicator=False),

    # Pride / Achievement
    "proud ko karon": LexiconEntry("pride", 0.80, is_stress_indicator=False),
    "nakaya ra nako": LexiconEntry("achievement", 0.70, is_stress_indicator=False),
    "natapos ra nako": LexiconEntry("achievement", 0.75, is_stress_indicator=False),
    "nindot akong progress": LexiconEntry("achievement", 0.80, is_stress_indicator=False),
    "lampos ko karon": LexiconEntry("achievement", 0.85, is_stress_indicator=False),

    "chill ra": LexiconEntry("neutral", 0.55, is_stress_indicator=False),
    "chill lang": LexiconEntry("neutral", 0.50, is_stress_indicator=False),
    "okay kaayo": LexiconEntry("neutral", 0.60, is_stress_indicator=False),
    "okay raman": LexiconEntry("neutral", 0.55, is_stress_indicator=False),
    "all good": LexiconEntry("neutral", 0.50, is_stress_indicator=False),
    "vibes lang": LexiconEntry("neutral", 0.45, is_stress_indicator=False),
    "steady ra": LexiconEntry("neutral", 0.50, is_stress_indicator=False),
    "relax ra": LexiconEntry("neutral", 0.55, is_stress_indicator=False),
    "relaxed na": LexiconEntry("neutral", 0.60, is_stress_indicator=False),
    "kompyansa ra": LexiconEntry("neutral", 0.55, is_stress_indicator=False),

    "clutch": LexiconEntry("excitement", 0.75, is_stress_indicator=False),
    "na clutch nako": LexiconEntry("pride", 0.78, is_stress_indicator=False),
    "gahi": LexiconEntry("pride", 0.70, is_stress_indicator=False),
    "bangga": LexiconEntry("motivation", 0.70, is_stress_indicator=False),
    "gg easy": LexiconEntry("pride", 0.75, is_stress_indicator=False),
    "nice game": LexiconEntry("appreciation", 0.65, is_stress_indicator=False),
    "pahinga lang after grind": LexiconEntry("neutral", 0.55, is_stress_indicator=False),
    "grind mode": LexiconEntry("focus", 0.70, is_stress_indicator=False),
    "focus mode": LexiconEntry("focus", 0.70, is_stress_indicator=False),

}

# =============================================================================
# INTENSITY MODIFIERS
# =============================================================================
INTENSIFIERS: Dict[str, float] = {
    # Cebuano
    "grabe": 1.5,
    "grabeng": 1.5,
    "kaayo": 1.4,
    "gyud": 1.3,
    "jud": 1.3,
    "gid": 1.3,
    
    # Tagalog
    "sobra": 1.5,
    "sobrang": 1.5,
    "grabe": 1.5,
    "todo": 1.4,
    "super": 1.4,
    "very": 1.3,
    "really": 1.3,
    "ang": 1.2,  # "ang hirap" = "how difficult"
    "napaka": 1.5,
    "extremely": 1.5,
    "totally": 1.3,
    "completely": 1.4,
}

DIMINISHERS: Dict[str, float] = {
    "medyo": 0.7,  # "somewhat"
    "konti": 0.6,
    "slight": 0.6,
    "slightly": 0.6,
    "a bit": 0.7,
    "kinda": 0.7,
    "parang": 0.8,  # "like/seems"
}


def get_all_stress_words() -> Set[str]:
    """Return all stress indicator words."""
    return set(STRESS_EXHAUSTION.keys())


def get_all_coping_words() -> Set[str]:
    """Return all coping phrase words."""
    return set(COPING_PHRASES.keys())


def get_all_plea_words() -> Set[str]:
    """Return all plea/help-seeking words."""
    return set(PLEA_PHRASES.keys())


def get_all_positive_words() -> Set[str]:
    """Return all genuine positive words."""
    return set(GENUINE_POSITIVE.keys())


def is_coping_laughter(text: str) -> bool:
    """Check if text contains coping laughter patterns."""
    text_lower = text.lower()
    for pattern in COPING_LAUGHTER_PATTERNS:
        if pattern in text_lower:
            return True
    # Also check for extended laughter (ha repeated 4+ times)
    import re
    if re.search(r'(ha){4,}', text_lower) or re.search(r'(he){4,}', text_lower):
        return True
    return False
