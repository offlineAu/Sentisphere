"""
Sentisphere Ensemble Sentiment Pipeline - Google Colab Evaluation
==================================================================

INSTRUCTIONS:
1. Open Google Colab (colab.research.google.com)
2. Create a new notebook
3. Copy this entire file into the first code cell
4. Run the cell (Shift+Enter)

The script will:
- Install required packages
- Download models from HuggingFace
- Run evaluation on 41 test samples
- Display accuracy, F1, precision, recall, confusion matrix
"""

# =============================================================================
# CELL 1: Install Dependencies (run this first in Colab)
# =============================================================================
"""
# Uncomment and run this cell first in Colab:
!pip install -q torch transformers scikit-learn pandas seaborn matplotlib
"""

import subprocess
import sys

def install_packages():
    """Install required packages for Colab."""
    packages = ['torch', 'transformers', 'scikit-learn', 'pandas', 'seaborn', 'matplotlib']
    for package in packages:
        try:
            __import__(package.replace('-', '_'))
        except ImportError:
            print(f"Installing {package}...")
            subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', package])

# Uncomment the next line when running in Colab:
# install_packages()

import json
import time
import re
from datetime import datetime
from typing import List, Dict, Optional, Tuple, Any
from collections import Counter
from dataclasses import dataclass, field

# ML imports
import numpy as np

try:
    import torch
    from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
    HAS_TRANSFORMERS = True
except ImportError:
    HAS_TRANSFORMERS = False
    print("WARNING: transformers not installed. Run: pip install transformers torch")

try:
    from sklearn.metrics import (
        accuracy_score, precision_recall_fscore_support,
        confusion_matrix, classification_report
    )
    import pandas as pd
    import seaborn as sns
    import matplotlib.pyplot as plt
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False
    print("WARNING: sklearn/pandas not installed. Run: pip install scikit-learn pandas seaborn matplotlib")


# =============================================================================
# BISAYA LANGUAGE DETECTOR (Standalone)
# =============================================================================

BISAYA_PARTICLES = {
    "kaayo", "gyud", "jud", "lang", "ra", "bitaw", "diay", "daw", "ba", "gani",
    "pod", "pud", "sab", "lagi", "baya", "man", "oy", "intawn", "unta",
    "nga", "sa", "ug", "og", "ang", "kay", "kung", "na", "pa", "ni", "kini"
}

BISAYA_VOCABULARY = {
    "kapoy", "lisod", "lipay", "subo", "hadlok", "lagot", "kasuko", "kasubo",
    "maayo", "nindot", "ganahan", "gusto", "dili", "wala", "naay", "aduna",
    "unsa", "kinsa", "asa", "kanus-a", "ngano", "giunsa", "pila", "uyab",
    "higala", "barkada", "ambot", "lami", "buotan", "gwapa", "gwapo", "ako",
    "ikaw", "siya", "kita", "kami", "sila", "karon", "gahapon", "ugma",
    "skwelahan", "trabaho", "balay", "opisina", "gimingaw", "nalipay", "nasuko",
    "gikapoy", "nahadlok", "naguba", "nalingaw", "hikog", "mamatay", "patay"
}

BISAYA_PREFIXES = ['nag', 'naga', 'mag', 'maga', 'mi', 'ni', 'gi', 'gina', 'mo', 'ma', 'ka', 'pag', 'pang', 'mang', 'nang']
BISAYA_SUFFIXES = ['on', 'an', 'hon', 'han', 'ay', 'i']


def detect_bisaya(text: str) -> Dict:
    """Detect Bisaya/Cebuano language in text."""
    text_lower = text.lower()
    words = re.findall(r'\b[a-z]+\b', text_lower)
    
    if not words:
        return {"bisaya_ratio": 0.0, "is_heavily_bisaya": False, "dominant_language": "unknown"}
    
    bisaya_count = 0
    bisaya_markers = []
    
    for word in words:
        if word in BISAYA_PARTICLES or word in BISAYA_VOCABULARY:
            bisaya_count += 1
            bisaya_markers.append(word)
        elif any(word.startswith(p) for p in BISAYA_PREFIXES):
            bisaya_count += 0.5
        elif any(word.endswith(s) for s in BISAYA_SUFFIXES) and len(word) > 4:
            bisaya_count += 0.3
    
    bisaya_ratio = bisaya_count / len(words)
    
    return {
        "bisaya_ratio": round(bisaya_ratio, 3),
        "is_heavily_bisaya": bisaya_ratio >= 0.40,
        "is_moderately_bisaya": bisaya_ratio >= 0.20,
        "dominant_language": "bisaya" if bisaya_ratio >= 0.40 else "mixed" if bisaya_ratio >= 0.20 else "english",
        "bisaya_markers_found": bisaya_markers[:10]
    }


# =============================================================================
# MENTAL HEALTH LEXICON (Simplified for Colab)
# =============================================================================

STRESS_INDICATORS = {
    "kapoy", "lisod", "pagod", "stressed", "stress", "burnout", "burned out",
    "di ko na kaya", "di na ko kaya", "ayoko na", "give up", "overwhelmed",
    "exhausted", "tired", "drained", "gikapoy", "nakapoy", "kapoyan"
}

POSITIVE_INDICATORS = {
    "happy", "lipay", "nalipay", "blessed", "grateful", "thankful", "excited",
    "proud", "maayo", "nindot", "nice", "great", "amazing", "wonderful",
    "love", "ganahan", "masaya", "masayang", "good vibes"
}

CRISIS_KEYWORDS = {"hikog", "mamatay", "suicide", "suicidal", "patay", "end it all", "kill myself", "wala na koy pulos"}

COPING_PHRASES = {"kaya ra", "laban lang", "sige lang", "kapit lang", "worth it", "padayon", "fighting"}


def analyze_mental_health(text: str) -> Dict:
    """Simple mental health lexicon analysis."""
    text_lower = text.lower()
    
    stress_found = [s for s in STRESS_INDICATORS if s in text_lower]
    positive_found = [p for p in POSITIVE_INDICATORS if p in text_lower]
    crisis_found = [c for c in CRISIS_KEYWORDS if c in text_lower]
    coping_found = [c for c in COPING_PHRASES if c in text_lower]
    
    # Detect coping humor (laughter + stress)
    has_laughter = bool(re.search(r'(ha){3,}|(he){3,}|lol|lmao|haha|hehe', text_lower))
    coping_humor = has_laughter and len(stress_found) > 0
    
    # Determine sentiment
    if crisis_found:
        sentiment = "strongly_negative"
        confidence = 0.95
    elif len(stress_found) > len(positive_found):
        if coping_humor or coping_found:
            sentiment = "negative"  # Masked distress
        else:
            sentiment = "negative"
        confidence = 0.7
    elif len(positive_found) > len(stress_found):
        sentiment = "positive"
        confidence = 0.7
    else:
        sentiment = "neutral"
        confidence = 0.5
    
    return {
        "sentiment": sentiment,
        "confidence": confidence,
        "stress_indicators": stress_found,
        "positive_indicators": positive_found,
        "crisis_keywords": crisis_found,
        "coping_phrases": coping_found,
        "coping_humor_detected": coping_humor
    }


# =============================================================================
# ENSEMBLE PIPELINE (Colab Version)
# =============================================================================

class ColabEnsemblePipeline:
    """Simplified ensemble pipeline for Colab evaluation."""
    
    XLM_ROBERTA_MODEL = "cardiffnlp/twitter-xlm-roberta-base-sentiment"
    EMOTION_MODEL = "cardiffnlp/twitter-roberta-base-emotion"
    BISAYA_MODEL = "OfflineAu/sentisphere-bisaya-sentiment"
    
    def __init__(self, use_gpu: bool = True):
        """Initialize pipeline with HuggingFace models."""
        self.device = 0 if use_gpu and torch.cuda.is_available() else -1
        self.models = {}
        self._load_models()
    
    def _load_models(self):
        """Load all transformer models."""
        print("Loading models... (this may take a few minutes on first run)")
        
        # XLM-RoBERTa for sentiment
        try:
            print(f"  Loading {self.XLM_ROBERTA_MODEL}...")
            self.models['xlm'] = pipeline("sentiment-analysis", 
                                          model=self.XLM_ROBERTA_MODEL,
                                          device=self.device)
            print("    ✓ XLM-RoBERTa loaded")
        except Exception as e:
            print(f"    ✗ Failed: {e}")
            self.models['xlm'] = None
        
        # Twitter-Emotion for emotions
        try:
            print(f"  Loading {self.EMOTION_MODEL}...")
            self.models['emotion'] = pipeline("text-classification",
                                              model=self.EMOTION_MODEL,
                                              device=self.device,
                                              top_k=5)
            print("    ✓ Emotion model loaded")
        except Exception as e:
            print(f"    ✗ Failed: {e}")
            self.models['emotion'] = None
        
        # Bisaya sentiment model
        try:
            print(f"  Loading {self.BISAYA_MODEL}...")
            self.models['bisaya'] = pipeline("sentiment-analysis",
                                             model=self.BISAYA_MODEL,
                                             device=self.device)
            print("    ✓ Bisaya model loaded")
        except Exception as e:
            print(f"    ✗ Failed: {e}")
            self.models['bisaya'] = None
        
        print("Model loading complete!\n")
    
    def _map_label(self, label: str) -> str:
        """Map model labels to standard format."""
        label = label.lower()
        if label in ['positive', 'label_2', 'pos']:
            return 'positive'
        elif label in ['negative', 'label_0', 'neg']:
            return 'negative'
        elif label in ['neutral', 'label_1', 'neu']:
            return 'neutral'
        elif label == 'strongly_negative':
            return 'strongly_negative'
        return 'neutral'
    
    def analyze(self, text: str) -> Dict:
        """Run full ensemble analysis."""
        start_time = time.time()
        
        if not text or not text.strip():
            return self._empty_result()
        
        # Language detection
        lang_result = detect_bisaya(text)
        
        # Stage 1: XLM-RoBERTa
        xlm_result = self._run_xlm(text)
        
        # Stage 1b: Emotion detection
        emotion_result = self._run_emotion(text)
        
        # Stage 2: Bisaya refinement (conditional)
        bisaya_result = None
        use_bisaya = (xlm_result['confidence'] < 0.70 or 
                      lang_result['is_moderately_bisaya'])
        
        if use_bisaya:
            bisaya_result = self._run_bisaya(text)
        
        # Mental health lexicon
        mh_result = analyze_mental_health(text)
        
        # Stage 3: Merge
        final = self._merge_results(xlm_result, bisaya_result, emotion_result, 
                                    mh_result, lang_result, use_bisaya)
        
        processing_time = (time.time() - start_time) * 1000
        
        return {
            "xlm_roberta": xlm_result,
            "bisaya_model": bisaya_result,
            "emotion_detection": emotion_result,
            "mental_health": mh_result,
            "language_detection": lang_result,
            "final_result": final,
            "processing_time_ms": round(processing_time, 1)
        }
    
    def _run_xlm(self, text: str) -> Dict:
        """Run XLM-RoBERTa sentiment analysis."""
        if self.models['xlm'] is None:
            # Fallback to lexicon
            mh = analyze_mental_health(text)
            return {"sentiment": mh['sentiment'], "confidence": mh['confidence'], "source": "fallback"}
        
        try:
            result = self.models['xlm'](text[:512])[0]
            return {
                "sentiment": self._map_label(result['label']),
                "confidence": round(result['score'], 4),
                "source": "xlm-roberta"
            }
        except Exception as e:
            mh = analyze_mental_health(text)
            return {"sentiment": mh['sentiment'], "confidence": mh['confidence'], "source": "fallback"}
    
    def _run_emotion(self, text: str) -> Dict:
        """Run emotion detection."""
        if self.models['emotion'] is None:
            return {"emotions": [], "dominant": "neutral", "scores": {}}
        
        try:
            results = self.models['emotion'](text[:512])
            if isinstance(results[0], list):
                results = results[0]
            
            emotions = [r['label'].lower() for r in results[:4]]
            scores = {r['label'].lower(): round(r['score'], 3) for r in results}
            dominant = emotions[0] if emotions else "neutral"
            
            return {"emotions": emotions, "dominant": dominant, "scores": scores}
        except Exception as e:
            return {"emotions": [], "dominant": "neutral", "scores": {}}
    
    def _run_bisaya(self, text: str) -> Dict:
        """Run Bisaya sentiment model."""
        if self.models['bisaya'] is None:
            mh = analyze_mental_health(text)
            return {"sentiment": mh['sentiment'], "confidence": mh['confidence'], "source": "fallback"}
        
        try:
            result = self.models['bisaya'](text[:512])[0]
            return {
                "sentiment": self._map_label(result['label']),
                "confidence": round(result['score'], 4),
                "source": "bisaya-model"
            }
        except Exception as e:
            mh = analyze_mental_health(text)
            return {"sentiment": mh['sentiment'], "confidence": mh['confidence'], "source": "fallback"}
    
    def _merge_results(self, xlm: Dict, bisaya: Optional[Dict], emotion: Dict,
                       mh: Dict, lang: Dict, used_bisaya: bool) -> Dict:
        """Merge all model outputs."""
        
        # Check for crisis keywords first
        if mh['crisis_keywords']:
            return {
                "sentiment": "strongly_negative",
                "confidence": 0.95,
                "reasoning": "Crisis keywords detected",
                "emotions": emotion['emotions'],
                "flags": ["crisis_language"]
            }
        
        xlm_sent = xlm['sentiment']
        xlm_conf = xlm['confidence']
        
        bisaya_sent = bisaya['sentiment'] if bisaya else None
        bisaya_conf = bisaya['confidence'] if bisaya else 0
        
        mh_sent = mh['sentiment']
        
        # Positive emotion check
        positive_emotions = {'joy', 'love', 'optimism', 'admiration', 'excitement'}
        emotion_positive = sum(emotion['scores'].get(e, 0) for e in positive_emotions)
        
        # Merge logic
        flags = []
        
        if bisaya and lang['is_heavily_bisaya']:
            # Prefer Bisaya model for heavily Bisaya text
            final_sentiment = bisaya_sent
            confidence = bisaya_conf
            reasoning = f"Bisaya model preferred ({lang['bisaya_ratio']:.0%} Cebuano)"
            flags.append(f"heavily_bisaya: {lang['bisaya_ratio']:.0%}")
        elif bisaya and xlm_sent == bisaya_sent:
            # Agreement
            final_sentiment = xlm_sent
            confidence = (xlm_conf + bisaya_conf) / 2 + 0.1
            reasoning = "Model agreement"
        elif emotion_positive > 0.3 and xlm_sent != 'positive':
            # Emotion override
            final_sentiment = "positive"
            confidence = max(xlm_conf, emotion_positive)
            reasoning = "Positive emotion override"
            flags.append(f"emotion_positive: {emotion_positive:.2f}")
        else:
            # Default to XLM with MH consideration
            if mh_sent == 'strongly_negative':
                final_sentiment = 'strongly_negative'
                confidence = 0.85
            elif mh_sent == 'negative' and xlm_sent != 'positive':
                final_sentiment = 'negative'
                confidence = xlm_conf
            else:
                final_sentiment = xlm_sent
                confidence = xlm_conf
            reasoning = f"XLM-RoBERTa primary with MH context"
        
        if mh['coping_humor_detected']:
            flags.append("coping_humor")
        
        return {
            "sentiment": final_sentiment,
            "confidence": round(min(confidence, 1.0), 3),
            "reasoning": reasoning,
            "emotions": emotion['emotions'][:4],
            "flags": flags
        }
    
    def _empty_result(self) -> Dict:
        """Return empty result."""
        return {
            "xlm_roberta": {"sentiment": "neutral", "confidence": 0.5},
            "final_result": {"sentiment": "neutral", "confidence": 0.5, "reasoning": "Empty input"}
        }


# =============================================================================
# TEST DATASET
# =============================================================================

TEST_DATASET = [
    # POSITIVE (13 samples)
    ("Nalipay kaayo ko karon! Happy ra gyud. Nice kaayo ang adlaw.", "positive", "bisaya"),
    ("Grateful kaayo ko sa akong family. Blessed gyud mi.", "positive", "bisaya"),
    ("Nindot kaayo ang weather today, perfect for jogging.", "positive", "mixed"),
    ("Finally naka-graduate na ko! Proud kaayo akong parents.", "positive", "bisaya"),
    ("Lipay kaayo ko kay naka-pass ko sa exam.", "positive", "bisaya"),
    ("I'm feeling great today, everything is going well!", "positive", "english"),
    ("Just got promoted at work, so happy and grateful!", "positive", "english"),
    ("The team morale is high and everyone is excited!", "positive", "english"),
    ("Excited kaayo ko for tomorrow, naa koy date!", "positive", "bisaya"),
    ("Na-promote ko finally! Thankful sa support.", "positive", "mixed"),
    ("We had lechon for dinner, felt good to reconnect.", "positive", "mixed"),
    ("Ni-volunteer kami sa barangay, nakatabang mi.", "positive", "bisaya"),
    ("Masaya ako ngayon, ang ganda ng araw!", "positive", "tagalog"),
    
    # NEUTRAL (5 samples)
    ("Nag-abot ko sa opisina alas otso.", "neutral", "bisaya"),
    ("Today I had rice and chicken for lunch.", "neutral", "english"),
    ("The meeting was moved to 3pm.", "neutral", "english"),
    ("Maayo ra man ko, okay lang tanan.", "neutral", "bisaya"),
    ("The interface needs clearer microcopy.", "neutral", "english"),
    
    # MIXED (3 samples)
    ("Chill ra kaayo, pero murag stress gamay sa exams. Kaya ra.", "mixed", "bisaya"),
    ("Happy sa uyab pero stressed sa trabaho.", "mixed", "bisaya"),
    ("Kapoy pero worth it ra, proud ko sa akong sarili.", "mixed", "bisaya"),
    
    # NEGATIVE (16 samples)
    ("Kapoy na kaayo ko, di ko na kaya.", "negative", "bisaya"),
    ("Lisod kaayo ang life karon, stressed gyud ko.", "negative", "bisaya"),
    ("Naguba akong plano, frustrated kaayo ko.", "negative", "bisaya"),
    ("Gikapoy na ko sa tanan, wala na koy gana.", "negative", "bisaya"),
    ("Sakit kaayo akong ulo, di ko ka focus sa work.", "negative", "bisaya"),
    ("Ambot oy kapoy na kaayo ko pero sige lang gud.", "negative", "bisaya"),
    ("Wala nako kasabot sa akong gibati ron, I'm tearing up.", "negative", "mixed"),
    ("Stress sa school tapos problems pa sa bahay.", "negative", "mixed"),
    ("Kapoy na kaayo ko HAHAHA pero sige lang gud.", "negative", "bisaya"),
    ("Stress na stress na ko LOL bahala na.", "negative", "mixed"),
    ("Gimingaw na ko sa akong family, dugay na ko wala ka-uli.", "negative", "bisaya"),
    ("Nag-away na usab mi sa akong uyab, kapoy na kaayo.", "negative", "bisaya"),
    ("Daghan kaayo deadline, di ko ka-catch up.", "negative", "bisaya"),
    ("Failed ko sa exam, disappointed kaayo ko.", "negative", "bisaya"),
    ("I think I need a mental health day, burned out na ko.", "negative", "mixed"),
    ("Sobrang pagod na ako, hindi ko na kayang mag-aral.", "negative", "tagalog"),
    
    # STRONGLY NEGATIVE (4 samples)
    ("Gusto nlng ko mag hikog, di na ko ganahan mag padayon.", "strongly_negative", "bisaya"),
    ("Ayoko na talaga, I just want everything to end.", "strongly_negative", "mixed"),
    ("Wala na koy pulos, burden lang ko sa tanan.", "strongly_negative", "bisaya"),
    ("Break up mi sa akong boyfriend, devastated kaayo ko.", "strongly_negative", "bisaya"),
]


# =============================================================================
# EVALUATION FUNCTIONS
# =============================================================================

def run_colab_evaluation():
    """Run full evaluation with visualizations for Colab."""
    
    print("=" * 70)
    print("SENTISPHERE ENSEMBLE PIPELINE - COLAB EVALUATION")
    print("=" * 70)
    print(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Samples: {len(TEST_DATASET)}")
    print()
    
    # Initialize pipeline
    pipeline = ColabEnsemblePipeline(use_gpu=True)
    
    # Run predictions
    print("Running predictions...")
    y_true = []
    y_pred = []
    results = []
    
    for i, (text, expected, lang) in enumerate(TEST_DATASET):
        result = pipeline.analyze(text)
        predicted = result['final_result']['sentiment']
        
        y_true.append(expected)
        y_pred.append(predicted)
        results.append({
            'text': text[:50] + '...',
            'expected': expected,
            'predicted': predicted,
            'correct': expected == predicted,
            'confidence': result['final_result']['confidence'],
            'language': lang
        })
        
        if (i + 1) % 10 == 0:
            print(f"  Processed {i+1}/{len(TEST_DATASET)}")
    
    print("Predictions complete!\n")
    
    # Calculate metrics
    labels = ['positive', 'neutral', 'mixed', 'negative', 'strongly_negative']
    
    accuracy = accuracy_score(y_true, y_pred)
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, y_pred, labels=labels, zero_division=0
    )
    
    # Print metrics
    print("=" * 70)
    print("CLASSIFICATION REPORT")
    print("=" * 70)
    print(classification_report(y_true, y_pred, labels=labels, zero_division=0))
    
    print("\n" + "=" * 70)
    print("SUMMARY METRICS")
    print("=" * 70)
    print(f"  Overall Accuracy:     {accuracy:.2%}")
    print(f"  Macro F1 Score:       {np.mean(f1):.4f}")
    print(f"  Weighted F1 Score:    {np.average(f1, weights=support):.4f}")
    
    # Confusion Matrix
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    
    if HAS_SKLEARN:
        # Plot confusion matrix
        plt.figure(figsize=(10, 8))
        sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
                    xticklabels=labels, yticklabels=labels)
        plt.title('Confusion Matrix - Ensemble Sentiment Pipeline')
        plt.xlabel('Predicted')
        plt.ylabel('Actual')
        plt.tight_layout()
        plt.savefig('confusion_matrix.png', dpi=150)
        plt.show()
        print("\nConfusion matrix saved as 'confusion_matrix.png'")
    
    # Per-language accuracy
    print("\n" + "=" * 70)
    print("ACCURACY BY LANGUAGE")
    print("=" * 70)
    
    lang_stats = {}
    for r in results:
        lang = r['language']
        if lang not in lang_stats:
            lang_stats[lang] = {'correct': 0, 'total': 0}
        lang_stats[lang]['total'] += 1
        if r['correct']:
            lang_stats[lang]['correct'] += 1
    
    for lang, stats in sorted(lang_stats.items(), key=lambda x: -x[1]['correct']/x[1]['total']):
        acc = stats['correct'] / stats['total']
        print(f"  {lang:<10}  {stats['correct']:>3}/{stats['total']:<3}  {acc:.1%}")
    
    # Misclassifications
    misclassified = [r for r in results if not r['correct']]
    print(f"\n\nMisclassified: {len(misclassified)}/{len(results)} ({100*len(misclassified)/len(results):.1f}%)")
    
    if misclassified:
        print("\nSample misclassifications:")
        for m in misclassified[:5]:
            print(f"  \"{m['text']}\"")
            print(f"    Expected: {m['expected']} | Got: {m['predicted']}")
    
    # Return results for further analysis
    return {
        'accuracy': accuracy,
        'f1_scores': dict(zip(labels, f1)),
        'precision': dict(zip(labels, precision)),
        'recall': dict(zip(labels, recall)),
        'confusion_matrix': cm,
        'results': results
    }


# =============================================================================
# RUN EVALUATION
# =============================================================================

if __name__ == "__main__":
    # Check if running in Colab
    try:
        import google.colab
        IN_COLAB = True
        print("Running in Google Colab environment")
    except ImportError:
        IN_COLAB = False
        print("Running locally")
    
    # Run evaluation
    results = run_colab_evaluation()
    
    print("\n" + "=" * 70)
    print("EVALUATION COMPLETE")
    print("=" * 70)
