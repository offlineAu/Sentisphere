# Sentisphere Backend: Hybrid Ensemble Sentiment Analysis System
## Technical Documentation for Research Paper

---

## Abstract

Sentisphere implements a **multi-stage hybrid ensemble sentiment analysis pipeline** designed specifically for mental health monitoring in educational settings. The system addresses the unique challenges of analyzing code-switched text (Filipino/Cebuano/English) from students, where traditional monolingual models fail to capture cultural and linguistic nuances. By combining transformer-based deep learning models with domain-specific lexicon analysis, the system achieves improved accuracy in detecting stress, distress, and crisis indicators in student journal entries and emotional check-ins.

---

## 1. System Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MOBILE APPLICATION                          │
│                    (React Native / Expo)                            │
│         Student submits Check-in / Journal Entry                    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ HTTP POST (JWT Auth)
┌─────────────────────────────────────────────────────────────────────┐
│                         FASTAPI BACKEND                             │
│                      (Python 3.11+, Uvicorn)                        │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │ Authentication  │  │  Data Ingestion │  │  Real-time Events   │ │
│  │ (JWT/OAuth)     │  │  (Check-in/     │  │  (WebSocket/Pusher) │ │
│  │                 │  │   Journal)      │  │                     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────┘ │
│                                │                                    │
│                                ▼                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              SENTIMENT ANALYSIS SERVICE                      │  │
│  │                  (SentimentService)                          │  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │           ENSEMBLE SENTIMENT PIPELINE                  │  │  │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │  │
│  │  │  │ XLM-RoBERTa  │  │ Twitter-Emo  │  │ Bisaya Model │  │  │  │
│  │  │  │ (Sentiment)  │  │ (Emotions)   │  │ (Refinement) │  │  │  │
│  │  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │  │
│  │  │                         │                              │  │  │
│  │  │  ┌──────────────────────┴──────────────────────────┐   │  │  │
│  │  │  │        MentalHealth Lexicon Analyzer            │   │  │  │
│  │  │  │  (Filipino/Cebuano/English Stress Detection)    │   │  │  │
│  │  │  └─────────────────────────────────────────────────┘   │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                │                                    │
│                                ▼                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │ MySQL Database  │  │  Smart Alert    │  │  Counselor          │ │
│  │ (Persistence)   │  │  Service        │  │  Dashboard          │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Backend Framework | FastAPI 0.110+ | Async REST API with WebSocket support |
| Database | MySQL 8.0 | Relational data storage |
| ORM | SQLAlchemy 2.0 | Database abstraction |
| ML Framework | PyTorch 2.2+ | Deep learning inference |
| NLP Library | HuggingFace Transformers 4.44+ | Pre-trained model loading |
| Real-time | WebSocket + Pusher | Live dashboard updates |
| Authentication | JWT (PyJWT) | Stateless token auth |

---

## 2. Ensemble Sentiment Pipeline Architecture

### 2.1 Three-Stage Processing Model

The sentiment analysis follows a **conditional multi-stage architecture**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    STAGE 1: Global Understanding                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1a. Language Detection                                  │   │
│  │      - Bisaya/Cebuano morphology detection               │   │
│  │      - Token-level language ratio calculation            │   │
│  │      - Output: bisaya_ratio, dominant_language           │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1b. XLM-RoBERTa Sentiment Analysis                      │   │
│  │      - Model: cardiffnlp/twitter-xlm-roberta-base-sentiment │
│  │      - Multilingual (100+ languages including Filipino)  │   │
│  │      - Output: sentiment (pos/neg/neu), confidence       │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1c. Multi-Emotion Detection                             │   │
│  │      - Model: cardiffnlp/twitter-roberta-base-emotion    │   │
│  │      - 28 emotion categories (joy, sadness, anger, etc.) │   │
│  │      - Output: emotion_scores dict, dominant_emotion     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Routing Decision │
                    │                 │
                    │ IF confidence   │
                    │    < 0.70       │
                    │    OR           │
                    │ bisaya_ratio    │
                    │    >= 0.40      │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼ YES                         ▼ NO
┌─────────────────────────────┐   ┌─────────────────────────────┐
│   STAGE 2: Bisaya Refinement│   │   Skip to Stage 3           │
│                             │   │   (XLM-R output sufficient) │
│  ┌───────────────────────┐  │   └─────────────────────────────┘
│  │ Bisaya Sentiment Model │  │
│  │ (OfflineAu/sentisphere-│  │
│  │  bisaya-sentiment)     │  │
│  │                        │  │
│  │ Fine-tuned on:         │  │
│  │ - Cebuano text         │  │
│  │ - Code-switched input  │  │
│  │ - Filipino slang       │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │ MentalHealth Lexicon  │  │
│  │                        │  │
│  │ - 700+ Bisaya/Tagalog  │  │
│  │   stress indicators    │  │
│  │ - Coping phrase detect │  │
│  │ - Masked distress flag │  │
│  │ - User context override│  │
│  └───────────────────────┘  │
└─────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    STAGE 3: Hybrid Merge                        │
│                                                                 │
│  Merge Algorithm:                                               │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ IF xlm_sentiment == bisaya_sentiment:                     │ │
│  │     final_sentiment = xlm_sentiment                       │ │
│  │     confidence = avg(xlm_conf, bisaya_conf) + 0.15        │ │
│  │     reasoning = "Model agreement"                         │ │
│  │                                                           │ │
│  │ ELIF bisaya_ratio >= 0.40:  # Heavily Bisaya              │ │
│  │     final_sentiment = bisaya_sentiment                    │ │
│  │     confidence = bisaya_conf                              │ │
│  │     reasoning = "Bisaya model preferred"                  │ │
│  │                                                           │ │
│  │ ELIF emotion_positive_score > emotion_negative_score:     │ │
│  │     final_sentiment = "positive"                          │ │
│  │     reasoning = "Emotion detection override"              │ │
│  │                                                           │ │
│  │ ELSE:                                                     │ │
│  │     final_sentiment = majority_vote(xlm, bisaya, mh)      │ │
│  │     confidence = weighted_average(confidences)            │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Post-processing:                                               │
│  - Crisis keyword detection ("hikog", "suicide", "mamatay")     │
│  - User context override (mood_level, stress_level)             │
│  - Strongly_negative elevation for severe distress markers      │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Model Specifications

| Model | Architecture | Parameters | Training Data | Purpose |
|-------|--------------|------------|---------------|---------|
| XLM-RoBERTa-base-sentiment | Transformer (XLM-R) | 278M | Twitter multilingual corpus | Primary sentiment classification |
| Twitter-RoBERTa-emotion | RoBERTa-base | 125M | GoEmotions + Twitter | Multi-label emotion detection |
| Sentisphere-Bisaya | XLM-R fine-tuned | 278M | Custom Bisaya/Filipino dataset | Cebuano-specialized sentiment |
| MentalHealth Lexicon | Rule-based | N/A | 700+ curated phrases | Stress/coping pattern matching |

---

## 3. Language Detection Algorithm

### 3.1 Bisaya/Cebuano Detection

The system implements a token-level language detection algorithm specifically designed for Filipino code-switching patterns:

```python
# Bisaya Detection Algorithm (Pseudocode)

BISAYA_PARTICLES = {
    "kaayo", "gyud", "jud", "lang", "ra", "bitaw",
    "diay", "daw", "ba", "gani", "pod", "pud", "sab",
    "nga", "sa", "ug", "og", "ang", "kay", "kung"
}

BISAYA_VOCABULARY = {
    "kapoy", "lisod", "lipay", "subo", "hadlok", "lagot",
    "maayo", "nindot", "ganahan", "nalingaw", "uyab", "higala"
}

def detect_bisaya(text):
    tokens = tokenize(text.lower())
    bisaya_count = 0
    
    for token in tokens:
        if token in BISAYA_PARTICLES or token in BISAYA_VOCABULARY:
            bisaya_count += 1
        elif has_bisaya_morphology(token):  # Check affixes
            bisaya_count += 1
    
    bisaya_ratio = bisaya_count / len(tokens)
    is_heavily_bisaya = bisaya_ratio >= 0.40
    
    return bisaya_ratio, is_heavily_bisaya
```

### 3.2 Morphological Pattern Detection

Cebuano-specific affixes are detected to identify Bisaya tokens not in the static vocabulary:

| Affix Type | Examples | Pattern |
|------------|----------|---------|
| Verbal Prefixes | nag-, naga-, mag-, mi-, gi- | `^(nag|naga|mag|mi|gi)` |
| Verbal Suffixes | -on, -an, -hon, -han | [(on|an|hon|han)$](file:///c:/Users/COMPUTER/Documents/GitHub/Sentisphere/backend-dashboard/main.py#4367-4370) |
| Intensifier Prefix | ka- (kakapoy, kasubo) | `^ka[a-z]{4,}$` |
| Reduplication | kapoy-kapoy, hinay-hinay | `^(\w{3,})-\1$` |

---

## 4. MentalHealth Lexicon Analyzer

### 4.1 Lexicon Categories

The system maintains a curated lexicon of 700+ phrases across three languages:

| Category | Count | Examples | Emotion Mapping |
|----------|-------|----------|-----------------|
| **Stress/Exhaustion** | 200+ | "kapoy na kaayo", "di ko na kaya", "burnout" | exhaustion, stress, overwhelm |
| **Coping Phrases** | 150+ | "kaya ra ni", "laban lang", "worth it ra" | coping, resilience, masked_distress |
| **Plea/Help-seeking** | 100+ | "baka naman", "lord help me", "di ko alam" | plea, hopelessness, distress |
| **Genuine Positive** | 150+ | "blessed kaayo", "grateful ko", "happy" | joy, gratitude, contentment |
| **Coping Laughter** | 50+ | "HAHAHA pero kapoy", "LOL charot" | masked_pain, coping_humor |

### 4.2 Coping Humor Detection

A critical feature for Filipino text analysis is detecting **coping laughter** - where students mask distress with humor:

```python
def is_coping_laughter(text):
    """
    Filipino youth often use laughter to mask distress.
    "kapoy na kaayo ko HAHAHA" should NOT be classified as positive.
    """
    has_laughter = re.search(r'(ha){3,}|(he){3,}|lol|lmao', text, re.I)
    has_stress = any(phrase in text for phrase in STRESS_INDICATORS)
    
    if has_laughter and has_stress:
        return True  # Coping humor detected
    return False
```

### 4.3 User Context Override

When structured check-in data is available, the system can override text-based analysis:

```python
def apply_user_context(raw_scores, user_context):
    """
    CRITICAL: User's self-reported mood/stress is ground truth.
    If user reports high stress, model CANNOT output "positive".
    """
    user_negativity = 0.0
    
    if user_context.mood_level in ["Anxious", "Bad", "Terrible"]:
        user_negativity += 0.4
    if user_context.stress_level in ["High Stress", "Very High Stress"]:
        user_negativity += 0.3
    if user_context.energy_level == "Low":
        user_negativity += 0.2
    
    if user_negativity >= 0.5:
        # Force negative sentiment
        raw_scores["positive"] = min(raw_scores["positive"], 0.2)
        raw_scores["negative"] = max(raw_scores["negative"], 0.5)
    
    return raw_scores
```

---

## 5. Database Schema

### 5.1 Sentiment Storage Tables

```sql
-- Journal Sentiment Results
CREATE TABLE journal_sentiment (
    sentiment_id INT PRIMARY KEY AUTO_INCREMENT,
    journal_id INT NOT NULL REFERENCES journal(journal_id),
    sentiment ENUM('positive', 'neutral', 'mixed', 'negative', 'strongly_negative'),
    emotions VARCHAR(500),  -- Comma-separated emotion labels
    confidence DECIMAL(5,4),  -- 0.0000 to 1.0000
    model_version VARCHAR(50),  -- "ensemble-v1.0"
    analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Check-in Sentiment Results
CREATE TABLE checkin_sentiment (
    sentiment_id INT PRIMARY KEY AUTO_INCREMENT,
    checkin_id INT NOT NULL REFERENCES emotional_checkin(checkin_id),
    sentiment ENUM('positive', 'neutral', 'mixed', 'negative', 'strongly_negative'),
    emotions VARCHAR(500),
    confidence DECIMAL(5,4),
    model_version VARCHAR(50),
    analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 6. Processing Pipeline Pseudocode

### 6.1 Complete Analysis Flow

```python
def analyze_checkin(checkin_id: int) -> CheckinSentiment:
    # 1. Retrieve check-in from database
    checkin = db.get(EmotionalCheckin, checkin_id)
    
    # 2. Extract text and user context
    text = checkin.comment or ""
    user_context = {
        "mood_level": checkin.mood_level,
        "stress_level": checkin.stress_level,
        "energy_level": checkin.energy_level,
        "feel_better": checkin.feel_better
    }
    
    # 3. Gibberish detection
    if is_gibberish(text):
        text = ""  # Use only structured fields
    
    # 4. Run ensemble pipeline
    result = ensemble_pipeline.analyze(text, **user_context)
    
    # 5. Extract final result
    sentiment = result.final_result["sentiment"]
    emotions = result.final_result["emotions"]
    confidence = result.final_result["combined_confidence"]
    
    # 6. Persist to database
    sentiment_record = CheckinSentiment(
        checkin_id=checkin_id,
        sentiment=sentiment,
        emotions=",".join(emotions),
        confidence=confidence,
        model_version="ensemble-v1.0",
        analyzed_at=datetime.utcnow()
    )
    db.add(sentiment_record)
    db.commit()
    
    # 7. Trigger smart alert check
    if sentiment in ["negative", "strongly_negative"]:
        SmartAlertService.check_consecutive_negatives(checkin.user_id)
    
    return sentiment_record
```

---

## 7. Output Format

### 7.1 JSON Response Structure

```json
{
  "xlm_roberta": {
    "sentiment": "negative",
    "confidence": 0.788,
    "interpretation": "Text indicates negative emotional state",
    "detected_language": "bisaya"
  },
  "bisaya_model": {
    "sentiment": "negative",
    "confidence": 0.92,
    "correction": "",
    "analysis": "High-distress Bisaya text with exhaustion markers"
  },
  "emotion_detection": {
    "emotions": ["sadness", "anger", "fear", "optimism"],
    "scores": {
      "sadness": 0.45,
      "anger": 0.32,
      "fear": 0.18,
      "optimism": 0.05
    },
    "dominant_emotion": "sadness"
  },
  "final_result": {
    "sentiment": "negative",
    "combined_confidence": 0.795,
    "reasoning": "Bisaya model preferred due to 66% Cebuano content",
    "emotions": ["exhaustion", "stress", "coping", "sadness"],
    "dominant_emotion": "exhaustion",
    "flags": ["masked_distress", "heavily_bisaya: 66%"],
    "language_detection": {
      "dominant": "bisaya",
      "bisaya_ratio": 0.66,
      "english_ratio": 0.24,
      "tagalog_ratio": 0.10
    }
  },
  "processing_time_ms": 1524.7
}
```

---

## 8. Performance Considerations

### 8.1 Model Caching

All transformer models are loaded once and cached in memory using a singleton pattern:

```python
class ModelCache:
    _instance = None
    _models = {}
    
    def get_or_load(self, model_name, loader_fn):
        if model_name not in self._models:
            self._models[model_name] = loader_fn()
        return self._models[model_name]
```

### 8.2 Processing Time

| Stage | Typical Time | Notes |
|-------|--------------|-------|
| Language Detection | 1-5 ms | Cached regex patterns |
| XLM-RoBERTa | 200-500 ms | GPU: ~50ms |
| Emotion Detection | 150-400 ms | GPU: ~40ms |
| Bisaya Model | 200-500 ms | Conditional |
| MH Lexicon | 5-20 ms | Dictionary lookup |
| Merge Logic | <1 ms | Pure Python |
| **Total** | **500-1500 ms** | First request slower (model loading) |

---

## 9. Limitations and Future Work

### 9.1 Current Limitations

1. **Language Detection**: Token-based detection may miss novel Bisaya words not in vocabulary
2. **Model Size**: 280M+ parameter models require significant memory (~2GB)
3. **Code-switching**: Models trained primarily on monolingual data
4. **Crisis Detection**: Keyword-based; may miss implicit suicidal ideation

### 9.2 Proposed Improvements

1. Fine-tune XLM-RoBERTa on Filipino code-switched corpus
2. Implement MentalBERT integration for mental health domain
3. Add real-time model confidence calibration
4. Develop explainability layer for counselor transparency
