"""
Bisaya Sentiment Model Fine-Tuning Script
==========================================

This script fine-tunes the existing sentisphere-bisaya-sentiment model
to fix misclassifications, especially for positive Bisaya text.

Usage:
    1. Run locally: python finetune_bisaya_model.py
    2. Or in Google Colab (recommended for GPU)

Requirements:
    pip install torch transformers datasets huggingface_hub accelerate

After training, upload to HuggingFace:
    huggingface-cli login
    python finetune_bisaya_model.py --upload
"""

import os
import sys
import json
import argparse
from datetime import datetime

# Check for required packages
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
    from huggingface_hub import login, HfApi
except ImportError as e:
    print(f"Missing required package: {e}")
    print("Install with: pip install torch transformers datasets huggingface_hub accelerate")
    sys.exit(1)


# =============================================================================
# TRAINING DATASET (Corrected labels for misclassified examples)
# =============================================================================

# Format: (text, label) where label is 0=negative, 1=neutral, 2=positive
TRAINING_DATA = [
    # === POSITIVE BISAYA (These were misclassified as negative) ===
    ("Nalipay kaayo ko karon! Happy ra gyud. Nice kaayo ang adlaw.", 2),
    ("Nindot kaayo ang weather today, perfect for jogging.", 2),
    ("Lipay kaayo ko kay naka-pass ko sa exam.", 2),
    ("Ni-volunteer kami sa barangay, nakatabang mi.", 2),
    ("Grateful kaayo ko sa akong family. Blessed gyud mi.", 2),
    ("Finally naka-graduate na ko! Proud kaayo akong parents.", 2),
    ("Excited kaayo ko for tomorrow, naa koy date!", 2),
    ("Na-promote ko finally! Thankful sa support.", 2),
    ("We had lechon for dinner, felt good to reconnect.", 2),
    ("Masaya ako ngayon, ang ganda ng araw!", 2),
    
    # More positive examples with Bisaya markers
    ("Ganahan kaayo ko sa imo, happy ko nimo.", 2),
    ("Nindot kaayo ang sunset karon, peaceful ra kaayo.", 2),
    ("Proud kaayo ko sa akong sarili, kaya ra tanan.", 2),
    ("Blessed gyud mi, thankful sa Ginoo.", 2),
    ("Lipay kaayo ang akong heart karon.", 2),
    ("Maayo kaayo ang result sa exam, pasado ko!", 2),
    ("Happy birthday sa akong best friend, love you!", 2),
    ("Nalingaw kaayo ko sa outing, unforgettable experience.", 2),
    ("Grateful kaayo ko sa akong mga higala.", 2),
    ("Nag-enjoy mi sa beach, nindot kaayo.", 2),
    ("Kalipay ra kaayo, blessed ang akong family.", 2),
    ("Accomplished kaayo ang feeling, worth it ang effort.", 2),
    ("Maayo na ang tanan, okay na tanan.", 2),
    ("Salamat sa support, appreciated kaayo.", 2),
    ("Love kaayo ko sa akong work, fulfilling kaayo.", 2),
    
    # Positive with mixed language
    ("Super happy ko today, blessed kaayo!", 2),
    ("Finally achieved my goal, proud kaayo ko!", 2),
    ("Best day ever, lipay kaayo ang heart!", 2),
    ("Thankful for this opportunity, excited kaayo!", 2),
    ("Great news! Naka-pass ko sa interview!", 2),
    
    # === NEUTRAL BISAYA (To improve neutral detection) ===
    ("Nag-abot ko sa opisina alas otso.", 1),
    ("Maayo ra man ko, okay lang tanan.", 1),
    ("Nag-adto ko sa merkado ganina.", 1),
    ("Nag-kaon ko ug pan sa buntag.", 1),
    ("Nag-trabaho ko karon, usual day lang.", 1),
    ("Naa ko sa balay, wala lang.", 1),
    ("Nag-basa ko ug libro karon.", 1),
    ("Nag-tan-aw ko ug TV, chill lang.", 1),
    ("Normal day lang, wala special.", 1),
    ("Nag-hugas ko mga plato ganina.", 1),
    
    # === NEGATIVE BISAYA (To reinforce negative detection) ===
    ("Kapoy na kaayo ko, di ko na kaya.", 0),
    ("Lisod kaayo ang life karon, stressed gyud ko.", 0),
    ("Naguba akong plano, frustrated kaayo ko.", 0),
    ("Gikapoy na ko sa tanan, wala na koy gana.", 0),
    ("Sakit kaayo akong ulo, di ko ka focus.", 0),
    ("Ambot oy kapoy na kaayo ko pero sige lang gud.", 0),
    ("Wala nako kasabot sa akong gibati ron.", 0),
    ("Stress sa school tapos problems pa sa bahay.", 0),
    ("Gimingaw na ko sa akong family, sad kaayo.", 0),
    ("Nag-away na usab mi sa akong uyab, kapoy.", 0),
    ("Daghan kaayo deadline, overwhelmed na ko.", 0),
    ("Failed ko sa exam, disappointed kaayo ko.", 0),
    ("Burned out na kaayo ko, need break.", 0),
    ("Sobrang pagod na ako, hindi ko na kayang mag-aral.", 0),
    ("Subo kaayo ko karon, di ko alam ngano.", 0),
    
    # === STRONGLY NEGATIVE / CRISIS (Reinforce detection) ===
    ("Gusto nlng ko mag hikog, di na ko ganahan mag padayon.", 0),
    ("Ayoko na talaga, I just want everything to end.", 0),
    ("Wala na koy pulos, burden lang ko sa tanan.", 0),
    ("Break up mi sa akong boyfriend, devastated kaayo ko.", 0),
    ("Mamatay nalang ko, wala na koy purpose.", 0),
    
    # === MIXED SENTIMENT (Coping with stress - classify as negative) ===
    ("Kapoy pero worth it ra, laban lang.", 0),
    ("Stress pero kaya ra, padayon lang.", 0),
    ("Kapoy na kaayo ko HAHAHA pero sige lang gud.", 0),
    ("Lisod pero kaya ra ni, fighting!", 0),
]

# Additional data augmentation with common Bisaya expressions
AUGMENTATION_TEMPLATES = {
    "positive": [
        "Kalipay ra kaayo, {reason}!",
        "{reason}, blessed gyud mi!",
        "Happy kaayo ko kay {reason}.",
        "Proud ko sa {reason}, worth it tanan!",
        "Grateful kaayo sa {reason}, thankful gyud!",
    ],
    "neutral": [
        "Nag-{action} ko karon, okay lang.",
        "Normal day, nag-{action} lang.",
        "Wala special, {action} lang ko ganina.",
    ],
    "negative": [
        "Kapoy kaayo ko, {reason}.",
        "Stressed gyud ko kay {reason}.",
        "{reason}, lisod kaayo.",
        "Di ko ka-focus, {reason}.",
    ]
}

POSITIVE_REASONS = [
    "naka-pass ko sa exam", "na-promote ko", "blessed ang family",
    "naa koy new job", "naka-graduate na", "nacomplete ang project",
    "maayo ang result", "happy ang heart", "successful ang event"
]

NEUTRAL_ACTIONS = [
    "trabaho", "kaon", "tulog", "basa", "tan-aw TV", "ligo", "limpyo"
]

NEGATIVE_REASONS = [
    "daghan deadline", "failed sa exam", "gisakit akong ulo",
    "nag-away mi", "wala tulog", "nag-breakdown ang laptop"
]


def augment_data():
    """Generate additional training examples from templates."""
    augmented = []
    
    for reason in POSITIVE_REASONS:
        for template in AUGMENTATION_TEMPLATES["positive"]:
            text = template.format(reason=reason)
            augmented.append((text, 2))
    
    for action in NEUTRAL_ACTIONS:
        for template in AUGMENTATION_TEMPLATES["neutral"]:
            text = template.format(action=action)
            augmented.append((text, 1))
    
    for reason in NEGATIVE_REASONS:
        for template in AUGMENTATION_TEMPLATES["negative"]:
            text = template.format(reason=reason)
            augmented.append((text, 0))
    
    return augmented


def create_dataset():
    """Create HuggingFace Dataset from training data."""
    # Combine base data with augmented data
    all_data = list(TRAINING_DATA) + augment_data()
    
    # Shuffle
    import random
    random.shuffle(all_data)
    
    texts = [d[0] for d in all_data]
    labels = [d[1] for d in all_data]
    
    dataset = Dataset.from_dict({
        "text": texts,
        "label": labels
    })
    
    # Split into train/validation
    dataset = dataset.train_test_split(test_size=0.2, seed=42)
    
    return dataset


# =============================================================================
# FINE-TUNING
# =============================================================================

def finetune_model(
    base_model: str = "OfflineAu/sentisphere-bisaya-sentiment",
    output_dir: str = "./finetuned-bisaya-sentiment",
    num_epochs: int = 5,
    batch_size: int = 8,
    learning_rate: float = 2e-5,
):
    """Fine-tune the Bisaya sentiment model."""
    
    print("=" * 60)
    print("BISAYA SENTIMENT MODEL FINE-TUNING")
    print("=" * 60)
    print(f"Base model: {base_model}")
    print(f"Output dir: {output_dir}")
    print(f"Epochs: {num_epochs}")
    print()
    
    # Check for GPU
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device}")
    if device == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")
    print()
    
    # Load tokenizer and model
    print("[1/5] Loading base model and tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(base_model)
    model = AutoModelForSequenceClassification.from_pretrained(
        base_model,
        num_labels=3,  # negative, neutral, positive
        ignore_mismatched_sizes=True
    )
    
    # Update label mappings
    model.config.id2label = {0: "negative", 1: "neutral", 2: "positive"}
    model.config.label2id = {"negative": 0, "neutral": 1, "positive": 2}
    
    print(f"Model loaded: {model.config.model_type}")
    print(f"Parameters: {model.num_parameters():,}")
    print()
    
    # Create dataset
    print("[2/5] Creating training dataset...")
    dataset = create_dataset()
    print(f"Training samples: {len(dataset['train'])}")
    print(f"Validation samples: {len(dataset['test'])}")
    
    # Label distribution
    train_labels = dataset['train']['label']
    print(f"Label distribution: negative={train_labels.count(0)}, "
          f"neutral={train_labels.count(1)}, positive={train_labels.count(2)}")
    print()
    
    # Tokenize
    print("[3/5] Tokenizing dataset...")
    def tokenize_function(examples):
        return tokenizer(
            examples["text"],
            padding="max_length",
            truncation=True,
            max_length=128
        )
    
    tokenized_dataset = dataset.map(tokenize_function, batched=True)
    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)
    
    # Training arguments
    print("[4/5] Setting up training...")
    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=num_epochs,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=batch_size,
        learning_rate=learning_rate,
        weight_decay=0.01,
        eval_strategy="epoch",  # Changed from evaluation_strategy
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        logging_steps=10,
        warmup_ratio=0.1,
        fp16=torch.cuda.is_available(),  # Mixed precision on GPU
        report_to="none",  # Disable wandb
    )
    
    # Metrics
    def compute_metrics(eval_pred):
        predictions, labels = eval_pred
        predictions = predictions.argmax(axis=-1)
        accuracy = (predictions == labels).mean()
        return {"accuracy": accuracy}
    
    # Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_dataset["train"],
        eval_dataset=tokenized_dataset["test"],
        tokenizer=tokenizer,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
    )
    
    # Train
    print("[5/5] Training...")
    print("-" * 60)
    trainer.train()
    
    # Evaluate
    print("\n" + "=" * 60)
    print("EVALUATION RESULTS")
    print("=" * 60)
    results = trainer.evaluate()
    print(f"Validation Loss: {results['eval_loss']:.4f}")
    print(f"Validation Accuracy: {results['eval_accuracy']:.2%}")
    
    # Save model
    print(f"\nSaving model to {output_dir}...")
    trainer.save_model(output_dir)
    tokenizer.save_pretrained(output_dir)
    
    # Save training info
    training_info = {
        "base_model": base_model,
        "finetuned_at": datetime.now().isoformat(),
        "num_epochs": num_epochs,
        "training_samples": len(dataset['train']),
        "eval_loss": results['eval_loss'],
        "eval_accuracy": results['eval_accuracy'],
        "label_mapping": model.config.id2label,
    }
    with open(os.path.join(output_dir, "training_info.json"), "w") as f:
        json.dump(training_info, f, indent=2)
    
    print("\n" + "=" * 60)
    print("TRAINING COMPLETE!")
    print("=" * 60)
    print(f"Model saved to: {output_dir}")
    
    return output_dir


# =============================================================================
# HUGGINGFACE UPLOAD
# =============================================================================

def upload_to_huggingface(
    model_dir: str = "./finetuned-bisaya-sentiment",
    repo_id: str = "OfflineAu/sentisphere-bisaya-sentiment",
    commit_message: str = "Fine-tuned for improved positive Bisaya detection"
):
    """Upload the fine-tuned model to HuggingFace Hub."""
    
    print("=" * 60)
    print("UPLOADING TO HUGGINGFACE")
    print("=" * 60)
    print(f"Model dir: {model_dir}")
    print(f"Repo: {repo_id}")
    print()
    
    # Check if logged in
    try:
        api = HfApi()
        user = api.whoami()
        print(f"Logged in as: {user['name']}")
    except Exception:
        print("Not logged in. Please run: huggingface-cli login")
        print("Or set HF_TOKEN environment variable")
        
        token = os.environ.get("HF_TOKEN")
        if token:
            login(token=token)
            print("Logged in via HF_TOKEN")
        else:
            print("\nTo login, run:")
            print("  huggingface-cli login")
            print("Or provide your token:")
            token = input("HuggingFace Token (or press Enter to skip): ").strip()
            if token:
                login(token=token)
            else:
                print("Skipping upload.")
                return
    
    # Upload
    print("\nUploading model files...")
    api = HfApi()
    
    api.upload_folder(
        folder_path=model_dir,
        repo_id=repo_id,
        commit_message=commit_message,
    )
    
    print("\n" + "=" * 60)
    print("UPLOAD COMPLETE!")
    print("=" * 60)
    print(f"Model available at: https://huggingface.co/{repo_id}")


# =============================================================================
# QUICK TEST
# =============================================================================

def test_model(model_dir: str = "./finetuned-bisaya-sentiment"):
    """Quick test of the fine-tuned model."""
    
    print("=" * 60)
    print("TESTING FINE-TUNED MODEL")
    print("=" * 60)
    
    from transformers import pipeline
    
    classifier = pipeline("sentiment-analysis", model=model_dir)
    
    test_cases = [
        "Nalipay kaayo ko karon! Happy ra gyud.",
        "Nindot kaayo ang weather today, perfect for jogging.",
        "Nag-abot ko sa opisina alas otso.",
        "Kapoy na kaayo ko, di ko na kaya.",
        "Lipay kaayo ko kay naka-pass ko sa exam.",
    ]
    
    print("\nTest predictions:")
    print("-" * 60)
    
    for text in test_cases:
        result = classifier(text)[0]
        label = result['label']
        score = result['score']
        print(f"[{label:>8}] ({score:.2%}) {text[:50]}...")
    
    print()


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fine-tune Bisaya sentiment model")
    parser.add_argument("--train", action="store_true", help="Run training")
    parser.add_argument("--test", action="store_true", help="Test the model")
    parser.add_argument("--upload", action="store_true", help="Upload to HuggingFace")
    parser.add_argument("--epochs", type=int, default=5, help="Number of epochs")
    parser.add_argument("--output", type=str, default="./finetuned-bisaya-sentiment", help="Output directory")
    parser.add_argument("--repo", type=str, default="OfflineAu/sentisphere-bisaya-sentiment", help="HuggingFace repo")
    
    args = parser.parse_args()
    
    # Default to training if no args
    if not any([args.train, args.test, args.upload]):
        args.train = True
    
    if args.train:
        finetune_model(
            output_dir=args.output,
            num_epochs=args.epochs
        )
    
    if args.test:
        test_model(args.output)
    
    if args.upload:
        upload_to_huggingface(
            model_dir=args.output,
            repo_id=args.repo
        )
