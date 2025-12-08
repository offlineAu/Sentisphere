"""
Crisis Detection Module
========================

Contextual NLP-based crisis detection for implicit suicidal ideation,
hopelessness, worthlessness, and mental health risk assessment.

Features:
- MentalBERT integration for classification (Anxiety/Depression/Suicidal/Normal)
- Contextual pattern matching for implicit crisis indicators
- Filipino/Bisaya-specific crisis patterns  
- Protective factor detection (support systems, goals, coping)
- Risk trend analysis

Author: Sentisphere AI Team
Version: 1.0.0
"""

from __future__ import annotations

import re
import logging
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any, Tuple
from enum import Enum

logger = logging.getLogger(__name__)


# =============================================================================
# DATA CLASSES
# =============================================================================

class CrisisLevel(Enum):
    """Crisis severity levels."""
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class MentalHealthCategory(Enum):
    """Mental health classification categories."""
    NORMAL = "Normal"
    ANXIETY = "Anxiety"
    DEPRESSION = "Depression"
    SUICIDAL = "Suicidal"
    STRESS = "Stress"


@dataclass
class CrisisResult:
    """Result of crisis detection analysis."""
    risk_score: float  # 0.0 to 1.0
    crisis_level: CrisisLevel
    flags: List[str] = field(default_factory=list)
    patterns_matched: List[str] = field(default_factory=list)
    is_crisis: bool = False
    requires_escalation: bool = False
    protective_factors: List[str] = field(default_factory=list)
    coping_strength: float = 0.0  # 0.0 to 1.0


@dataclass
class MentalBertResult:
    """Result from MentalBERT classification."""
    category: MentalHealthCategory
    confidence: float
    all_scores: Dict[str, float] = field(default_factory=dict)
    is_crisis: bool = False


@dataclass
class CrisisDetectionOutput:
    """Combined output from all crisis detection methods."""
    mental_bert: Optional[MentalBertResult]
    contextual: CrisisResult
    final_crisis_level: CrisisLevel
    combined_risk_score: float
    requires_alert: bool
    alert_severity: str  # "LOW", "MEDIUM", "HIGH"
    reasoning: str
    recommendations: List[str] = field(default_factory=list)


# =============================================================================
# CRISIS PATTERNS - ENGLISH
# =============================================================================

# Hopelessness patterns (English)
HOPELESSNESS_EN = [
    r"no\s*(point|purpose|reason|hope)",
    r"what'?s\s*the\s*point",
    r"nothing\s*(matters|helps|works)",
    r"(can'?t|cannot)\s*go\s*on",
    r"(can'?t|cannot)\s*see\s*(a\s*)?(future|way\s*out)",
    r"(feel|feeling|felt)\s*(so\s*)?(trapped|stuck|hopeless)",
    r"(no|never)\s*(way\s*)?(out|escape)",
    r"(life|everything)\s*(is\s*)?(meaningless|pointless|empty)",
    r"(given|giving)\s*up",
    r"(don'?t|doesn'?t)\s*see\s*the\s*point",
]

# Worthlessness patterns (English)
WORTHLESSNESS_EN = [
    r"(i'?m|am)\s*(so\s*)?(worthless|useless|pathetic)",
    r"(i'?m|am)\s*(a\s*)?(burden|failure|waste)",
    r"everyone('?s)?\s*(better\s*off|happier)\s*(without\s*me)?",
    r"(nobody|no\s*one)\s*(cares|loves|needs)\s*(about\s*)?(me)?",
    r"(don'?t|doesn'?t)\s*deserve\s*(to\s*)?(live|be\s*happy|love)",
    r"(world|family|everyone)\s*(would\s*be)?\s*better\s*without\s*me",
    r"(i\s*)?(shouldn'?t|don'?t\s*deserve\s*to)\s*be\s*(here|alive)",
    r"(hate|despise)\s*(myself|my\s*life)",
]

# Passive suicidal ideation (English)
PASSIVE_IDEATION_EN = [
    r"(wish|want)\s*(i\s*)?(was|were)\s*(dead|gone|never\s*born)",
    r"(wish|want)\s*to\s*(disappear|vanish|not\s*exist)",
    r"(don'?t|doesn'?t)\s*want\s*to\s*(wake\s*up|be\s*here|exist)",
    r"(want|need)\s*(it|everything)\s*to\s*(end|stop|be\s*over)",
    r"(just|want\s*to)\s*(go\s*to\s*)?(sleep|rest)\s*forever",
    r"(tired|exhausted)\s*of\s*(living|life|existing|fighting)",
    r"(can'?t|cannot)\s*(do\s*this|take\s*this|handle\s*this)\s*(anymore)?",
    r"(ready|want)\s*to\s*give\s*up",
]

# Active suicidal ideation (English) - CRITICAL
ACTIVE_IDEATION_EN = [
    r"(want|going|planning)\s*to\s*(kill|end|hurt)\s*(myself|my\s*life)",
    r"(thinking\s*(about|of))\s*(suicide|killing\s*myself|ending\s*(it|my\s*life))",
    r"(have|got)\s*(a\s*)?(plan|method|way)\s*(to\s*)?(die|end\s*it)?",
    r"(overdose|od|slit|hang|jump|shoot)\s*(myself)?",
    r"(suicide|suicidal)\s*(thoughts|ideation|plan|note)?",
    r"(this\s*is)?\s*(my\s*)?(last|final)\s*(goodbye|message|note)",
    r"(by\s*the\s*time\s*you\s*read\s*this)",
]

# Goodbye/farewell patterns (English)
GOODBYE_EN = [
    r"(goodbye|farewell)\s*(everyone|world|all)",
    r"(thank\s*you|thanks)\s*(for\s*)?(everything|all)",
    r"(take\s*care\s*of)\s*(yourself|my\s*(family|kids|pets))",
    r"(telling|saying)\s*(you|this)\s*(now|one\s*last\s*time)",
    r"(love\s*you\s*all)\s*(goodbye|forever)?",
    r"(i'?m|am)\s*(sorry|apologize)\s*(for\s*)?(everything)",
    r"(give|giving)\s*(away|out)\s*(my\s*)?(stuff|things|belongings)",
]


# =============================================================================
# CRISIS PATTERNS - BISAYA/CEBUANO
# =============================================================================

HOPELESSNESS_BS = [
    r"wala.{0,10}pulos",
    r"wala.{0,10}(na.{0,5})?paglaum",
    r"di.{0,5}na.{0,10}ganahan.{0,10}padayon",
    r"unsay.{0,5}(pulos|point)",
    r"wala.{0,10}(na.{0,5})?kabuluhan",
    r"kapoy.{0,10}na.{0,10}kaayo.{0,10}(sa\s*)?(tanan|life)",
    r"gi(ka)?poy.{0,5}na.{0,10}(mag)?buhi",
    r"wala.{0,10}na.{0,5}(koy|ko).{0,5}gana",
]

WORTHLESSNESS_BS = [
    r"burden.{0,5}(lang|ra).{0,5}ko",
    r"useless.{0,5}(lang|ra)?.{0,5}(ko|man)",
    r"mas.{0,10}maayo.{0,10}(kung|if).{0,10}wala.{0,5}(na)?.{0,5}ko",
    r"(di|dili).{0,5}ko.{0,5}deserve",
    r"(sayang|waste).{0,5}(lang|ra)?.{0,5}ko",
    r"walay.{0,5}(kwenta|pulos).{0,5}(akong|sa\s*akong).{0,5}kinabuhi",
    r"(wala|di).{0,5}(koy|ko).{0,5}(pulos|bili)",
]

PASSIVE_IDEATION_BS = [
    r"gusto.{0,5}(nlng|nalang|na\s*lang).{0,5}ko.{0,10}(mamatay|patay)",
    r"(di|dili).{0,5}(na)?.{0,5}ko.{0,5}ganahan.{0,5}magmata",
    r"matulog.{0,10}(nlng|nalang).{0,10}forever",
    r"(mawala|mahanaw).{0,5}(nlng|nalang).{0,5}ko",
    r"(gusto|ganahan).{0,5}(nlng|nalang)?.{0,5}(ko)?.{0,5}moundang",
    r"ayaw.{0,5}(na)?.{0,5}(ko)?.{0,5}(mag)?buhi",
    r"kapoy.{0,10}na.{0,10}(mag)?exist",
]

ACTIVE_IDEATION_BS = [
    r"hikog",
    r"magp(a)?atay",
    r"pa?i?lotong.{0,5}(akong)?.{0,5}(kaugalingon|self)",
    r"(gusto|plano).{0,5}(ko)?.{0,5}(i)?suicide",
    r"(lutason|tapuson).{0,5}(na)?.{0,5}(ni|kini|ang).{0,5}tanan",
    r"(ending|tapusan).{0,5}(akong)?.{0,5}kinabuhi",
    r"(last|katapusan).{0,5}(na)?.{0,5}(ni|kini|ko)",
]

GOODBYE_BS = [
    r"salamat.{0,10}sa.{0,10}tanan",
    r"(amping|ayo-ayo).{0,5}(mo|kamo)",
    r"(i)?atiman.{0,10}(akong|sa\s*akong).{0,10}(family|pamilya)",
    r"(kini|ni).{0,5}(na)?.{0,5}(akong)?.{0,5}(last|katapusan)",
    r"(sulti|ingon).{0,5}nako.{0,5}(karon|ron)",
]


# =============================================================================
# CRISIS PATTERNS - TAGALOG
# =============================================================================

HOPELESSNESS_TL = [
    r"walang.{0,5}(kwenta|saysay|pag-asa)",
    r"(di|hindi).{0,5}ko.{0,5}na.{0,5}kaya",
    r"(ayoko|ayaw\s*ko).{0,5}na",
    r"pagod.{0,5}na.{0,5}(ako|ko).{0,5}(sa\s*)?(lahat|buhay)",
    r"walang.{0,5}(point|saysay)",
]

PASSIVE_IDEATION_TL = [
    r"(gusto|sana).{0,5}(ko|kong).{0,5}(na)?mamatay",
    r"(ayoko|ayaw\s*ko).{0,5}na.{0,5}(mag)?gising",
    r"(mawala|maglaho).{0,5}na.{0,5}lang.{0,5}(ako|ko)",
    r"(sana|gusto).{0,5}(di|hindi).{0,5}(na)?.{0,5}(ako)?.{0,5}(nag)?exist",
]


# =============================================================================
# PROTECTIVE FACTORS (Reduce crisis score)
# =============================================================================

PROTECTIVE_SUPPORT = [
    r"(my|akong|ang\s*akong)\s*(family|pamilya|friends|higala)",
    r"(people|tao)\s*(who)?\s*(love|care|support)",
    r"(have|naa|may)\s*(someone|usa|tao)\s*(to\s*talk|makastorya)",
    r"(support\s*system|support\s*group)",
    r"(therapist|counselor|doctor|teacher)",
]

PROTECTIVE_GOALS = [
    r"(want|gusto|ganahan)\s*(to)?\s*(live|mabuhi|survive)",
    r"(future|dreams|goals|plano)",
    r"(graduate|trabaho|career|work)",
    r"(get\s*better|recover|heal|improve)",
    r"(try|fight|laban|padayon)",
]

PROTECTIVE_COPING = [
    r"(but|pero|apan)\s*(i'?ll|i\s*will)\s*(try|fight|survive)",
    r"(kaya|can\s*do|i\s*can)\s*(ra|lang|ni|this)",
    r"(laban|fighting|padayon)",
    r"(praying|nagampo|pray)",
    r"(reach\s*out|ask\s*for\s*help)",
]


# =============================================================================
# CRISIS DETECTOR CLASS
# =============================================================================

class CrisisDetector:
    """
    Contextual NLP-based crisis detection with MentalBERT integration.
    
    Detects:
    - Implicit suicidal ideation patterns
    - Hopelessness and worthlessness
    - Protective factors (reduces false positives)
    - Filipino/Bisaya/Tagalog patterns
    """
    
    # Pattern weights (higher = more severe)
    # CALIBRATED: Single indicators are LOW, require multiple for escalation
    PATTERN_WEIGHTS = {
        "hopelessness": 0.12,       # Reduced from 0.20 - single mention = LOW
        "worthlessness": 0.15,      # Reduced from 0.25 - single mention = LOW  
        "passive_ideation": 0.30,   # Reduced from 0.35
        "active_ideation": 0.50,    # Keep - explicit crisis
        "goodbye": 0.15,            # Reduced from 0.30
    }
    
    CRISIS_THRESHOLD = 0.45   # Score above this = crisis detected (was 0.50)
    ESCALATION_THRESHOLD = 0.65  # Score above this = requires immediate alert (was 0.70)
    
    def __init__(self):
        """Initialize crisis detector."""
        self._mental_bert = None
        self._mental_bert_loaded = False
        
        # Compile all patterns for efficiency
        self._compile_patterns()
    
    def _compile_patterns(self):
        """Pre-compile regex patterns."""
        self.patterns = {
            "hopelessness_en": [re.compile(p, re.IGNORECASE) for p in HOPELESSNESS_EN],
            "hopelessness_bs": [re.compile(p, re.IGNORECASE) for p in HOPELESSNESS_BS],
            "hopelessness_tl": [re.compile(p, re.IGNORECASE) for p in HOPELESSNESS_TL],
            "worthlessness_en": [re.compile(p, re.IGNORECASE) for p in WORTHLESSNESS_EN],
            "worthlessness_bs": [re.compile(p, re.IGNORECASE) for p in WORTHLESSNESS_BS],
            "passive_en": [re.compile(p, re.IGNORECASE) for p in PASSIVE_IDEATION_EN],
            "passive_bs": [re.compile(p, re.IGNORECASE) for p in PASSIVE_IDEATION_BS],
            "passive_tl": [re.compile(p, re.IGNORECASE) for p in PASSIVE_IDEATION_TL],
            "active_en": [re.compile(p, re.IGNORECASE) for p in ACTIVE_IDEATION_EN],
            "active_bs": [re.compile(p, re.IGNORECASE) for p in ACTIVE_IDEATION_BS],
            "goodbye_en": [re.compile(p, re.IGNORECASE) for p in GOODBYE_EN],
            "goodbye_bs": [re.compile(p, re.IGNORECASE) for p in GOODBYE_BS],
            "protective_support": [re.compile(p, re.IGNORECASE) for p in PROTECTIVE_SUPPORT],
            "protective_goals": [re.compile(p, re.IGNORECASE) for p in PROTECTIVE_GOALS],
            "protective_coping": [re.compile(p, re.IGNORECASE) for p in PROTECTIVE_COPING],
        }
    
    def _load_mental_bert(self):
        """Lazy load MentalBERT model."""
        if self._mental_bert_loaded:
            return self._mental_bert is not None
        
        self._mental_bert_loaded = True
        
        try:
            from transformers import pipeline
            import torch
            
            device = 0 if torch.cuda.is_available() else -1
            
            logger.info("Loading MentalBERT model: ethandavey/mental-health-diagnosis-bert")
            self._mental_bert = pipeline(
                "text-classification",
                model="ethandavey/mental-health-diagnosis-bert",
                device=device,
                top_k=5  # Get all categories
            )
            logger.info("MentalBERT loaded successfully")
            return True
        except Exception as e:
            logger.warning(f"Failed to load MentalBERT: {e}")
            self._mental_bert = None
            return False
    
    def analyze_mental_bert(self, text: str) -> Optional[MentalBertResult]:
        """
        Classify text using MentalBERT.
        
        Returns categories: Normal, Anxiety, Depression, Suicidal
        """
        if not self._load_mental_bert():
            return None
        
        try:
            # Truncate text for model
            text = text[:512] if len(text) > 512 else text
            
            results = self._mental_bert(text)
            
            # Handle nested list
            if isinstance(results[0], list):
                results = results[0]
            
            # Get all scores
            all_scores = {r['label']: r['score'] for r in results}
            
            # Find top category
            top_result = max(results, key=lambda x: x['score'])
            category_str = top_result['label']
            confidence = top_result['score']
            
            # Map to enum
            category_map = {
                'Normal': MentalHealthCategory.NORMAL,
                'Anxiety': MentalHealthCategory.ANXIETY,
                'Depression': MentalHealthCategory.DEPRESSION,
                'Suicidal': MentalHealthCategory.SUICIDAL,
                'Stress': MentalHealthCategory.STRESS,
            }
            category = category_map.get(category_str, MentalHealthCategory.NORMAL)
            
            # Check if crisis
            is_crisis = (
                category == MentalHealthCategory.SUICIDAL and 
                confidence >= self.ESCALATION_THRESHOLD
            )
            
            return MentalBertResult(
                category=category,
                confidence=confidence,
                all_scores=all_scores,
                is_crisis=is_crisis
            )
        except Exception as e:
            logger.error(f"MentalBERT analysis failed: {e}")
            return None
    
    def analyze_contextual(self, text: str) -> CrisisResult:
        """
        Analyze text for crisis indicators using contextual NLP patterns.
        """
        text_lower = text.lower()
        
        risk_score = 0.0
        flags = []
        patterns_matched = []
        
        # Check hopelessness patterns
        hopelessness_matches = self._check_pattern_group(
            text_lower, 
            ["hopelessness_en", "hopelessness_bs", "hopelessness_tl"]
        )
        if hopelessness_matches:
            risk_score += self.PATTERN_WEIGHTS["hopelessness"] * len(hopelessness_matches)
            flags.append("hopelessness")
            patterns_matched.extend(hopelessness_matches)
        
        # Check worthlessness patterns
        worthlessness_matches = self._check_pattern_group(
            text_lower,
            ["worthlessness_en", "worthlessness_bs"]
        )
        if worthlessness_matches:
            risk_score += self.PATTERN_WEIGHTS["worthlessness"] * len(worthlessness_matches)
            flags.append("worthlessness")
            patterns_matched.extend(worthlessness_matches)
        
        # Check passive ideation patterns
        passive_matches = self._check_pattern_group(
            text_lower,
            ["passive_en", "passive_bs", "passive_tl"]
        )
        if passive_matches:
            risk_score += self.PATTERN_WEIGHTS["passive_ideation"] * len(passive_matches)
            flags.append("passive_ideation")
            patterns_matched.extend(passive_matches)
        
        # Check active ideation patterns (CRITICAL)
        active_matches = self._check_pattern_group(
            text_lower,
            ["active_en", "active_bs"]
        )
        if active_matches:
            risk_score += self.PATTERN_WEIGHTS["active_ideation"] * len(active_matches)
            flags.append("active_ideation")
            patterns_matched.extend(active_matches)
        
        # Check goodbye patterns
        goodbye_matches = self._check_pattern_group(
            text_lower,
            ["goodbye_en", "goodbye_bs"]
        )
        if goodbye_matches:
            risk_score += self.PATTERN_WEIGHTS["goodbye"] * len(goodbye_matches)
            flags.append("goodbye_pattern")
            patterns_matched.extend(goodbye_matches)
        
        # Check protective factors (reduce score)
        protective_factors = []
        coping_strength = 0.0
        
        support_matches = self._check_pattern_group(text_lower, ["protective_support"])
        if support_matches:
            protective_factors.append("support_system")
            risk_score -= 0.10
            coping_strength += 0.2
        
        goals_matches = self._check_pattern_group(text_lower, ["protective_goals"])
        if goals_matches:
            protective_factors.append("future_goals")
            risk_score -= 0.10
            coping_strength += 0.2
        
        coping_matches = self._check_pattern_group(text_lower, ["protective_coping"])
        if coping_matches:
            protective_factors.append("coping_effort")
            risk_score -= 0.15
            coping_strength += 0.3
        
        # Clamp risk score
        risk_score = max(0.0, min(1.0, risk_score))
        coping_strength = min(1.0, coping_strength)
        
        # Determine crisis level
        if "active_ideation" in flags:
            crisis_level = CrisisLevel.CRITICAL
        elif risk_score >= 0.70:
            crisis_level = CrisisLevel.HIGH
        elif risk_score >= 0.50:
            crisis_level = CrisisLevel.MEDIUM
        elif risk_score >= 0.30:
            crisis_level = CrisisLevel.LOW
        else:
            crisis_level = CrisisLevel.NONE
        
        is_crisis = crisis_level in [CrisisLevel.MEDIUM, CrisisLevel.HIGH, CrisisLevel.CRITICAL]
        
        return CrisisResult(
            risk_score=round(risk_score, 3),
            crisis_level=crisis_level,
            flags=flags,
            patterns_matched=patterns_matched[:5],  # Limit for output
            is_crisis=is_crisis,
            requires_escalation=crisis_level in [CrisisLevel.HIGH, CrisisLevel.CRITICAL],
            protective_factors=protective_factors,
            coping_strength=round(coping_strength, 2)
        )
    
    def _check_pattern_group(self, text: str, pattern_keys: List[str]) -> List[str]:
        """Check a group of patterns and return matched pattern names."""
        matches = []
        for key in pattern_keys:
            if key not in self.patterns:
                continue
            for i, pattern in enumerate(self.patterns[key]):
                if pattern.search(text):
                    matches.append(f"{key}_{i}")
        return matches
    
    def analyze(self, text: str) -> CrisisDetectionOutput:
        """
        Full crisis detection analysis combining MentalBERT and contextual NLP.
        
        Returns combined assessment with alert recommendation.
        """
        # Run MentalBERT
        mental_bert_result = self.analyze_mental_bert(text)
        
        # Run contextual analysis
        contextual_result = self.analyze_contextual(text)
        
        # Combine signals
        combined_score = contextual_result.risk_score
        
        # If MentalBERT detected suicidal, boost score
        if mental_bert_result:
            if mental_bert_result.category == MentalHealthCategory.SUICIDAL:
                combined_score += mental_bert_result.confidence * 0.4
            elif mental_bert_result.category == MentalHealthCategory.DEPRESSION:
                combined_score += mental_bert_result.confidence * 0.15
            elif mental_bert_result.category == MentalHealthCategory.ANXIETY:
                combined_score += mental_bert_result.confidence * 0.05
        
        combined_score = min(1.0, combined_score)
        
        # Determine final crisis level
        if mental_bert_result and mental_bert_result.is_crisis:
            final_level = CrisisLevel.CRITICAL
        elif "active_ideation" in contextual_result.flags:
            final_level = CrisisLevel.CRITICAL
        elif combined_score >= 0.70:
            final_level = CrisisLevel.HIGH
        elif combined_score >= 0.50:
            final_level = CrisisLevel.MEDIUM
        elif combined_score >= 0.30:
            final_level = CrisisLevel.LOW
        else:
            final_level = CrisisLevel.NONE
        
        # Determine if alert is needed
        requires_alert = final_level in [CrisisLevel.HIGH, CrisisLevel.CRITICAL]
        
        # Map to alert severity
        if final_level == CrisisLevel.CRITICAL:
            alert_severity = "HIGH"
        elif final_level == CrisisLevel.HIGH:
            alert_severity = "HIGH"
        elif final_level == CrisisLevel.MEDIUM:
            alert_severity = "MEDIUM"
        else:
            alert_severity = "LOW"
        
        # Generate reasoning
        reasoning_parts = []
        if mental_bert_result:
            reasoning_parts.append(
                f"MentalBERT: {mental_bert_result.category.value} "
                f"({mental_bert_result.confidence:.0%})"
            )
        if contextual_result.flags:
            reasoning_parts.append(f"Patterns: {', '.join(contextual_result.flags)}")
        if contextual_result.protective_factors:
            reasoning_parts.append(f"Protective: {', '.join(contextual_result.protective_factors)}")
        
        reasoning = "; ".join(reasoning_parts) if reasoning_parts else "No crisis indicators"
        
        # Generate recommendations
        recommendations = []
        if final_level == CrisisLevel.CRITICAL:
            recommendations.append("IMMEDIATE counselor intervention required")
            recommendations.append("Consider crisis hotline referral")
        elif final_level == CrisisLevel.HIGH:
            recommendations.append("Prioritize for counselor follow-up")
            recommendations.append("Send wellness check notification")
        elif final_level == CrisisLevel.MEDIUM:
            recommendations.append("Monitor for pattern changes")
            recommendations.append("Schedule routine check-in")
        
        return CrisisDetectionOutput(
            mental_bert=mental_bert_result,
            contextual=contextual_result,
            final_crisis_level=final_level,
            combined_risk_score=round(combined_score, 3),
            requires_alert=requires_alert,
            alert_severity=alert_severity,
            reasoning=reasoning,
            recommendations=recommendations
        )


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

_crisis_detector: Optional[CrisisDetector] = None


def get_crisis_detector() -> CrisisDetector:
    """Get or create the crisis detector singleton."""
    global _crisis_detector
    if _crisis_detector is None:
        _crisis_detector = CrisisDetector()
    return _crisis_detector


def detect_crisis(text: str) -> CrisisDetectionOutput:
    """Convenience function for crisis detection."""
    return get_crisis_detector().analyze(text)


# =============================================================================
# QUICK TEST
# =============================================================================

if __name__ == "__main__":
    # Test cases
    test_cases = [
        "gusto nlng ko mag hikog, di na ko ganahan mag padayon",
        "wala na koy pulos, burden lang ko sa tanan",
        "kapoy na kaayo ko pero kaya ra, laban lang",
        "nalipay kaayo ko karon! happy ra gyud",
        "di ko alam kung para saan pa ang lahat, meaningless",
        "I just want to disappear, nobody would notice anyway",
        "Stressed kaayo ko but I have my family to support me",
    ]
    
    detector = get_crisis_detector()
    
    print("=" * 70)
    print("CRISIS DETECTION TEST")
    print("=" * 70)
    
    for text in test_cases:
        result = detector.analyze(text)
        print(f"\nText: {text[:50]}...")
        print(f"  Level: {result.final_crisis_level.value}")
        print(f"  Score: {result.combined_risk_score:.2f}")
        print(f"  Alert: {result.alert_severity if result.requires_alert else 'None'}")
        if result.contextual.flags:
            print(f"  Flags: {', '.join(result.contextual.flags)}")
        if result.contextual.protective_factors:
            print(f"  Protected: {', '.join(result.contextual.protective_factors)}")
