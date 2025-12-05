"""
Fine-tune XLM-RoBERTa for Bisaya/Filipino/English sentiment classification.

This script:
1. Loads labeled data from your database (journal_sentiment, checkin_sentiment)
2. Uses your text_cleaning utilities for preprocessing
3. Fine-tunes xlm-roberta-base for 3-class sentiment classification
4. Saves the model for production use

Usage:
    cd backend-dashboard
    python tools/finetune_sentiment.py

Requirements:
    pip install transformers datasets scikit-learn torch accelerate
"""

import os
import sys
import json
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

import logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Check dependencies
try:
    import torch
    from transformers import (
        AutoTokenizer,
        AutoModelForSequenceClassification,
        TrainingArguments,
        Trainer,
        DataCollatorWithPadding,
    )
    from datasets import Dataset
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score, f1_score, classification_report
    import numpy as np
except ImportError as e:
    logger.error(f"Missing dependency: {e}")
    logger.error("Install with: pip install transformers datasets scikit-learn torch accelerate")
    sys.exit(1)

from app.utils.text_cleaning import clean_text
from app.utils.gibberish_detector import GibberishDetector
from app.utils.filipino_lexicon import (
    STRESS_EXHAUSTION,
    COPING_PHRASES,
    PLEA_PHRASES,
    GENUINE_POSITIVE,
)
from app.db.database import engine
from sqlalchemy import text


# =============================================================================
# Configuration
# =============================================================================

MODEL_NAME = "xlm-roberta-base"
OUTPUT_DIR = Path(__file__).parent.parent / "models" / "bisaya-sentiment"
LABEL2ID = {"positive": 0, "neutral": 1, "negative": 2}
ID2LABEL = {v: k for k, v in LABEL2ID.items()}
MIN_SAMPLES = 50  # Minimum samples needed to train
MAX_LENGTH = 256


# =============================================================================
# Data Collection
# =============================================================================

def collect_labeled_data() -> list[dict]:
    """Collect labeled sentiment data from database."""
    logger.info("Collecting labeled data from database...")
    
    samples = []
    
    # Get journal sentiments
    journal_sql = text("""
        SELECT j.content, js.sentiment, js.confidence
        FROM journal_sentiment js
        JOIN journal j ON j.journal_id = js.journal_id
        WHERE js.sentiment IS NOT NULL 
          AND js.sentiment IN ('positive', 'neutral', 'negative')
          AND j.content IS NOT NULL
          AND LENGTH(j.content) >= 10
          AND js.confidence >= 0.5
    """)
    
    # Get checkin sentiments
    checkin_sql = text("""
        SELECT ec.comment, cs.sentiment, cs.confidence
        FROM checkin_sentiment cs
        JOIN emotional_checkin ec ON ec.checkin_id = cs.checkin_id
        WHERE cs.sentiment IS NOT NULL
          AND cs.sentiment IN ('positive', 'neutral', 'negative')
          AND ec.comment IS NOT NULL
          AND LENGTH(ec.comment) >= 10
          AND cs.confidence >= 0.5
    """)
    
    with engine.connect() as conn:
        # Journals
        for row in conn.execute(journal_sql).mappings():
            text_content = clean_text(row["content"])
            # Skip gibberish
            if GibberishDetector.is_gibberish(text_content):
                continue
            if text_content and len(text_content) >= 10:
                samples.append({
                    "text": text_content,
                    "label": row["sentiment"].lower(),
                    "source": "journal",
                    "confidence": float(row["confidence"]),
                })
        
        # Check-ins
        for row in conn.execute(checkin_sql).mappings():
            text_content = clean_text(row["comment"])
            # Skip gibberish
            if GibberishDetector.is_gibberish(text_content):
                continue
            if text_content and len(text_content) >= 10:
                samples.append({
                    "text": text_content,
                    "label": row["sentiment"].lower(),
                    "source": "checkin",
                    "confidence": float(row["confidence"]),
                })
    
    logger.info(f"Collected {len(samples)} labeled samples")
    
    # Show distribution
    from collections import Counter
    dist = Counter(s["label"] for s in samples)
    logger.info(f"Label distribution: {dict(dist)}")
    
    return samples


def load_manual_data(filepath: str) -> list[dict]:
    """Load manually labeled data from JSON file if available."""
    if not os.path.exists(filepath):
        return []
    
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        samples = []
        for item in data:
            text_content = clean_text(item.get("text", ""))
            label = item.get("label", "").lower()
            if text_content and label in LABEL2ID:
                samples.append({
                    "text": text_content,
                    "label": label,
                    "source": "manual",
                    "confidence": 1.0,
                })
        
        logger.info(f"Loaded {len(samples)} manual samples from {filepath}")
        return samples
    except Exception as e:
        logger.warning(f"Failed to load manual data: {e}")
        return []


def generate_lexicon_samples() -> list[dict]:
    """Generate synthetic training samples from filipino_lexicon.
    
    This leverages the carefully curated lexicon to create training data
    for words/phrases that might not appear in the database.
    """
    import random
    
    samples = []
    
    # Templates for generating sentences
    negative_templates = [
        "{word} kaayo ko karon",
        "Feeling {word} today",
        "Grabe {word} ko",
        "{word} na {word}",
        "Sobrang {word}",
        "Ang {word} ko",
        "Na-{word} ako",
    ]
    
    positive_templates = [
        "{word} kaayo ko karon",
        "Feeling {word} today",
        "Sobrang {word}",
        "Ang {word} ko",
        "Super {word}",
    ]
    
    neutral_templates = [
        "{word} lang",
        "Okay ra, {word}",
        "{word} ra man",
    ]
    
    # Generate from STRESS_EXHAUSTION (negative)
    for word, entry in STRESS_EXHAUSTION.items():
        if entry.is_stress_indicator and len(word) >= 4:
            template = random.choice(negative_templates)
            try:
                text = template.format(word=word)
                samples.append({
                    "text": text,
                    "label": "negative",
                    "source": "lexicon_synthetic",
                    "confidence": entry.intensity,
                })
            except Exception:
                pass
    
    # Generate from PLEA_PHRASES (negative)
    for word, entry in PLEA_PHRASES.items():
        if entry.is_plea and len(word) >= 4:
            samples.append({
                "text": word,
                "label": "negative",
                "source": "lexicon_synthetic",
                "confidence": entry.intensity,
            })
    
    # Generate from GENUINE_POSITIVE (positive)
    for word, entry in GENUINE_POSITIVE.items():
        if len(word) >= 4:
            template = random.choice(positive_templates)
            try:
                text = template.format(word=word)
                samples.append({
                    "text": text,
                    "label": "positive",
                    "source": "lexicon_synthetic",
                    "confidence": entry.intensity,
                })
            except Exception:
                pass
    
    # Generate from COPING_PHRASES (neutral - they mask real feelings)
    for word, entry in COPING_PHRASES.items():
        if entry.is_coping_phrase and len(word) >= 4:
            template = random.choice(neutral_templates)
            try:
                text = template.format(word=word)
                samples.append({
                    "text": text,
                    "label": "neutral",
                    "source": "lexicon_synthetic",
                    "confidence": 0.6,  # Lower confidence for coping phrases
                })
            except Exception:
                pass
    
    # Deduplicate
    seen = set()
    unique_samples = []
    for s in samples:
        key = s["text"].lower()
        if key not in seen:
            seen.add(key)
            unique_samples.append(s)
    
    logger.info(f"Generated {len(unique_samples)} synthetic samples from lexicon")
    return unique_samples


# =============================================================================
# Training
# =============================================================================

def compute_metrics(eval_pred):
    """Compute metrics for evaluation."""
    predictions, labels = eval_pred
    predictions = np.argmax(predictions, axis=1)
    
    return {
        "accuracy": accuracy_score(labels, predictions),
        "f1_macro": f1_score(labels, predictions, average="macro"),
        "f1_weighted": f1_score(labels, predictions, average="weighted"),
    }


def train_model(samples: list[dict]):
    """Fine-tune the model on collected samples."""
    
    if len(samples) < MIN_SAMPLES:
        logger.error(f"Not enough samples ({len(samples)}). Need at least {MIN_SAMPLES}.")
        logger.info("Add more labeled data or lower MIN_SAMPLES threshold.")
        return None
    
    # Prepare data
    texts = [s["text"] for s in samples]
    labels = [LABEL2ID[s["label"]] for s in samples]
    
    # Split data
    train_texts, val_texts, train_labels, val_labels = train_test_split(
        texts, labels, test_size=0.2, random_state=42, stratify=labels
    )
    
    logger.info(f"Training samples: {len(train_texts)}, Validation samples: {len(val_texts)}")
    
    # Load tokenizer and model
    logger.info(f"Loading {MODEL_NAME}...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=3,
        id2label=ID2LABEL,
        label2id=LABEL2ID,
    )
    
    # Tokenize
    def tokenize_function(examples):
        return tokenizer(
            examples["text"],
            truncation=True,
            max_length=MAX_LENGTH,
            padding=False,  # Dynamic padding via collator
        )
    
    train_dataset = Dataset.from_dict({"text": train_texts, "label": train_labels})
    val_dataset = Dataset.from_dict({"text": val_texts, "label": val_labels})
    
    train_dataset = train_dataset.map(tokenize_function, batched=True)
    val_dataset = val_dataset.map(tokenize_function, batched=True)
    
    # Data collator for dynamic padding
    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)
    
    # Training arguments
    training_args = TrainingArguments(
        output_dir=str(OUTPUT_DIR / "checkpoints"),
        eval_strategy="epoch",
        save_strategy="epoch",
        learning_rate=2e-5,
        per_device_train_batch_size=16,
        per_device_eval_batch_size=16,
        num_train_epochs=4,
        weight_decay=0.01,
        load_best_model_at_end=True,
        metric_for_best_model="f1_macro",
        greater_is_better=True,
        logging_dir=str(OUTPUT_DIR / "logs"),
        logging_steps=10,
        warmup_ratio=0.1,
        fp16=torch.cuda.is_available(),  # Use FP16 if GPU available
        report_to="none",  # Disable wandb/tensorboard
    )
    
    # Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        tokenizer=tokenizer,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
    )
    
    # Train
    logger.info("Starting training...")
    trainer.train()
    
    # Evaluate
    logger.info("Evaluating...")
    eval_results = trainer.evaluate()
    logger.info(f"Evaluation results: {eval_results}")
    
    # Detailed classification report
    predictions = trainer.predict(val_dataset)
    preds = np.argmax(predictions.predictions, axis=1)
    print("\nClassification Report:")
    print(classification_report(val_labels, preds, target_names=list(LABEL2ID.keys())))
    
    # Save model
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"Saving model to {OUTPUT_DIR}...")
    trainer.save_model(str(OUTPUT_DIR))
    tokenizer.save_pretrained(str(OUTPUT_DIR))
    
    # Save config
    config = {
        "model_name": MODEL_NAME,
        "label2id": LABEL2ID,
        "id2label": ID2LABEL,
        "max_length": MAX_LENGTH,
        "training_samples": len(train_texts),
        "validation_samples": len(val_texts),
        "eval_results": eval_results,
    }
    with open(OUTPUT_DIR / "training_config.json", "w") as f:
        json.dump(config, f, indent=2)
    
    logger.info("Training complete!")
    return trainer


# =============================================================================
# Main
# =============================================================================

def main():
    logger.info("=" * 60)
    logger.info("Bisaya/Filipino Sentiment Model Fine-Tuning")
    logger.info("=" * 60)
    logger.info("")
    logger.info("This script uses:")
    logger.info("  • text_cleaning.py - Normalize and clean text")
    logger.info("  • gibberish_detector.py - Filter meaningless input")
    logger.info("  • filipino_lexicon.py - Generate synthetic training data")
    logger.info("")
    
    # Collect data from database
    samples = collect_labeled_data()
    
    # Load manual data if available
    manual_data_path = Path(__file__).parent.parent / "data" / "manual_sentiment_labels.json"
    manual_samples = load_manual_data(str(manual_data_path))
    samples.extend(manual_samples)
    
    # Generate synthetic samples from filipino_lexicon
    # This helps the model learn Bisaya/Tagalog vocabulary
    lexicon_samples = generate_lexicon_samples()
    samples.extend(lexicon_samples)
    
    # Show data source breakdown
    from collections import Counter
    sources = Counter(s["source"] for s in samples)
    logger.info(f"\nData sources:")
    for source, count in sources.items():
        logger.info(f"  • {source}: {count} samples")
    
    if not samples:
        logger.error("No labeled data found!")
        logger.info("\nTo add training data, either:")
        logger.info("1. Ensure journal_sentiment and checkin_sentiment tables have data")
        logger.info(f"2. Create {manual_data_path} with format:")
        logger.info('   [{"text": "Nalipay ko", "label": "positive"}, ...]')
        return
    
    # Train
    train_model(samples)


if __name__ == "__main__":
    main()
