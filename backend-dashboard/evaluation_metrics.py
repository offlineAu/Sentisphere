"""
Sentisphere Ensemble Sentiment Pipeline - Evaluation Script
============================================================
Generates accuracy, precision, recall, F1 score, and confusion matrix
for research paper methodology and results.

Usage:
    python evaluation_metrics.py

Output:
    - Console: Metrics and confusion matrix
    - File: evaluation_results.json
    - File: confusion_matrix.csv
"""

import sys
import os
import json
import time
from datetime import datetime
from typing import List, Dict, Tuple
from collections import Counter

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


# =============================================================================
# TEST DATASET WITH GROUND TRUTH LABELS
# =============================================================================

# Labeled test samples: (text, expected_sentiment, language_type, category)
# Sentiments: positive, neutral, mixed, negative, strongly_negative

TEST_DATASET = [
    # === POSITIVE SAMPLES (Bisaya) ===
    ("Nalipay kaayo ko karon! Happy ra gyud. Nice kaayo ang adlaw.", 
     "positive", "bisaya", "genuine_positive"),
    
    ("Grateful kaayo ko sa akong family. Blessed gyud mi.", 
     "positive", "bisaya", "genuine_positive"),
    
    ("Nindot kaayo ang weather today, perfect for jogging.", 
     "positive", "mixed", "genuine_positive"),
    
    ("Finally naka-graduate na ko! Proud kaayo akong parents.", 
     "positive", "bisaya", "achievement"),
    
    ("Lipay kaayo ko kay naka-pass ko sa exam.", 
     "positive", "bisaya", "achievement"),
    
    # === POSITIVE SAMPLES (English) ===
    ("I'm feeling great today, everything is going well!", 
     "positive", "english", "genuine_positive"),
    
    ("Just got promoted at work, so happy and grateful!", 
     "positive", "english", "achievement"),
    
    ("The team morale is high and everyone is excited about the project.", 
     "positive", "english", "work_positive"),
    
    # === NEGATIVE SAMPLES (Bisaya) ===
    ("Kapoy na kaayo ko, di ko na kaya.", 
     "negative", "bisaya", "exhaustion"),
    
    ("Lisod kaayo ang life karon, stressed gyud ko.", 
     "negative", "bisaya", "stress"),
    
    ("Naguba akong plano, frustrated kaayo ko.", 
     "negative", "bisaya", "frustration"),
    
    ("Gikapoy na ko sa tanan, wala na koy gana.", 
     "negative", "bisaya", "burnout"),
    
    ("Sakit kaayo akong ulo, di ko ka focus sa work.", 
     "negative", "bisaya", "physical_distress"),
    
    # === NEGATIVE SAMPLES (Mixed/Code-switched) ===
    ("Ambot oy kapoy na kaayo ko pero sige lang gud. kapoi pajud kaayo ang skwelahan.", 
     "negative", "bisaya", "masked_distress"),
    
    ("Wala nako kasabot sa akong gibati ron, it feels like I'm tearing up.", 
     "negative", "mixed", "emotional_confusion"),
    
    ("Stress sa school tapos problems pa sa bahay, overwhelming kaayo.", 
     "negative", "mixed", "multiple_stressors"),
    
    # === STRONGLY NEGATIVE / CRISIS ===
    ("Gusto nlng ko mag hikog, di na ko ganahan mag padayon.", 
     "strongly_negative", "bisaya", "crisis"),
    
    ("Ayoko na talaga, I just want everything to end.", 
     "strongly_negative", "mixed", "crisis"),
    
    ("Wala na koy pulos, burden lang ko sa tanan.", 
     "strongly_negative", "bisaya", "hopelessness"),
    
    # === NEUTRAL SAMPLES ===
    ("Nag-abot ko sa opisina alas otso.", 
     "neutral", "bisaya", "factual"),
    
    ("Today I had rice and chicken for lunch.", 
     "neutral", "english", "factual"),
    
    ("The meeting was moved to 3pm.", 
     "neutral", "english", "factual"),
    
    # === MIXED SENTIMENT ===
    ("Chill ra kaayo, pero murag stress gamay sa exams. Kaya ra gihapon.", 
     "mixed", "bisaya", "stress_with_coping"),
    
    ("Happy sa uyab pero stressed sa trabaho.", 
     "mixed", "bisaya", "dual_emotion"),
    
    ("Kapoy pero worth it ra, proud ko sa akong sarili.", 
     "mixed", "bisaya", "effort_reward"),
    
    # === COPING HUMOR (Should be detected as negative/masked) ===
    ("Kapoy na kaayo ko HAHAHA pero sige lang gud.", 
     "negative", "bisaya", "coping_humor"),
    
    ("Stress na stress na ko LOL bahala na.", 
     "negative", "mixed", "coping_humor"),
    
    # === ADDITIONAL BISAYA SAMPLES ===
    ("Gimingaw na ko sa akong family, dugay na ko wala ka-uli.", 
     "negative", "bisaya", "longing"),
    
    ("Maayo ra man ko, okay lang tanan.", 
     "neutral", "bisaya", "neutral_bisaya"),
    
    ("Excited kaayo ko for tomorrow, naa koy date!", 
     "positive", "bisaya", "anticipation"),
    
    # === RELATIONSHIP STRESS ===
    ("Nag-away na usab mi sa akong uyab, kapoy na kaayo.", 
     "negative", "bisaya", "relationship_conflict"),
    
    ("Break up mi sa akong boyfriend, devastated kaayo ko.", 
     "strongly_negative", "bisaya", "relationship_crisis"),
    
    # === ACADEMIC STRESS ===
    ("Daghan kaayo deadline, di ko ka-catch up.", 
     "negative", "bisaya", "academic_stress"),
    
    ("Failed ko sa exam, disappointed kaayo ko sa akong sarili.", 
     "negative", "bisaya", "academic_failure"),
    
    # === WORK/CAREER ===
    ("Na-promote ko finally! Thankful sa support.", 
     "positive", "mixed", "career_positive"),
    
    ("I think I need a mental health day, burned out na ko.", 
     "negative", "mixed", "burnout"),
    
    # === TAGALOG SAMPLES ===
    ("Sobrang pagod na ako, hindi ko na kayang mag-aral.", 
     "negative", "tagalog", "exhaustion"),
    
    ("Masaya ako ngayon, ang ganda ng araw!", 
     "positive", "tagalog", "genuine_positive"),
    
    # === MORE COMPLEX CASES ===
    ("Ni-volunteer kami sa barangay, nakatabang mi distribute relief packs.", 
     "positive", "bisaya", "altruism"),
    
    ("The interface design is smoother but we need clearer microcopy.", 
     "neutral", "english", "work_feedback"),
    
    ("We had lechon for dinner and my lolo told jokes, felt good to reconnect.", 
     "positive", "mixed", "family_connection"),
]


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def calculate_metrics(y_true: List[str], y_pred: List[str], labels: List[str]) -> Dict:
    """Calculate precision, recall, F1 for each class and overall."""
    
    # Per-class metrics
    class_metrics = {}
    
    for label in labels:
        tp = sum(1 for t, p in zip(y_true, y_pred) if t == label and p == label)
        fp = sum(1 for t, p in zip(y_true, y_pred) if t != label and p == label)
        fn = sum(1 for t, p in zip(y_true, y_pred) if t == label and p != label)
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
        support = sum(1 for t in y_true if t == label)
        
        class_metrics[label] = {
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1_score": round(f1, 4),
            "support": support,
            "tp": tp,
            "fp": fp,
            "fn": fn
        }
    
    # Overall accuracy
    correct = sum(1 for t, p in zip(y_true, y_pred) if t == p)
    accuracy = correct / len(y_true) if y_true else 0
    
    # Macro-average (unweighted mean)
    macro_precision = sum(m["precision"] for m in class_metrics.values()) / len(labels)
    macro_recall = sum(m["recall"] for m in class_metrics.values()) / len(labels)
    macro_f1 = sum(m["f1_score"] for m in class_metrics.values()) / len(labels)
    
    # Weighted average (by support)
    total_support = sum(m["support"] for m in class_metrics.values())
    weighted_precision = sum(m["precision"] * m["support"] for m in class_metrics.values()) / total_support if total_support > 0 else 0
    weighted_recall = sum(m["recall"] * m["support"] for m in class_metrics.values()) / total_support if total_support > 0 else 0
    weighted_f1 = sum(m["f1_score"] * m["support"] for m in class_metrics.values()) / total_support if total_support > 0 else 0
    
    return {
        "accuracy": round(accuracy, 4),
        "macro_avg": {
            "precision": round(macro_precision, 4),
            "recall": round(macro_recall, 4),
            "f1_score": round(macro_f1, 4)
        },
        "weighted_avg": {
            "precision": round(weighted_precision, 4),
            "recall": round(weighted_recall, 4),
            "f1_score": round(weighted_f1, 4)
        },
        "per_class": class_metrics,
        "total_samples": len(y_true),
        "correct_predictions": correct
    }


def build_confusion_matrix(y_true: List[str], y_pred: List[str], labels: List[str]) -> List[List[int]]:
    """Build confusion matrix."""
    label_to_idx = {label: i for i, label in enumerate(labels)}
    n = len(labels)
    matrix = [[0] * n for _ in range(n)]
    
    for t, p in zip(y_true, y_pred):
        if t in label_to_idx and p in label_to_idx:
            matrix[label_to_idx[t]][label_to_idx[p]] += 1
    
    return matrix


def print_confusion_matrix(matrix: List[List[int]], labels: List[str]):
    """Print confusion matrix in a nice format."""
    # Header
    header = " " * 18 + "Predicted"
    print(header)
    label_short = [l[:10] for l in labels]
    print(" " * 12 + " ".join(f"{l:>10}" for l in label_short))
    print("-" * (12 + 11 * len(labels)))
    
    for i, row in enumerate(matrix):
        prefix = f"{'Actual':>6} {label_short[i]:>4}"
        print(f"{labels[i]:>11} |" + " ".join(f"{v:>10}" for v in row))
    print()


def print_classification_report(metrics: Dict, labels: List[str]):
    """Print sklearn-style classification report."""
    print("\n" + "=" * 70)
    print("CLASSIFICATION REPORT")
    print("=" * 70)
    
    # Header
    print(f"\n{'':20} {'precision':>10} {'recall':>10} {'f1-score':>10} {'support':>10}")
    print("-" * 60)
    
    # Per-class metrics
    for label in labels:
        m = metrics["per_class"].get(label, {})
        print(f"{label:20} {m.get('precision', 0):>10.4f} {m.get('recall', 0):>10.4f} {m.get('f1_score', 0):>10.4f} {m.get('support', 0):>10}")
    
    print("-" * 60)
    
    # Averages
    print(f"\n{'accuracy':20} {'':>10} {'':>10} {metrics['accuracy']:>10.4f} {metrics['total_samples']:>10}")
    
    macro = metrics["macro_avg"]
    print(f"{'macro avg':20} {macro['precision']:>10.4f} {macro['recall']:>10.4f} {macro['f1_score']:>10.4f} {metrics['total_samples']:>10}")
    
    weighted = metrics["weighted_avg"]
    print(f"{'weighted avg':20} {weighted['precision']:>10.4f} {weighted['recall']:>10.4f} {weighted['f1_score']:>10.4f} {metrics['total_samples']:>10}")


# =============================================================================
# MAIN EVALUATION
# =============================================================================

def run_evaluation():
    """Run full evaluation of the ensemble pipeline."""
    
    print("=" * 70)
    print("SENTISPHERE ENSEMBLE SENTIMENT PIPELINE - EVALUATION")
    print("=" * 70)
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Test samples: {len(TEST_DATASET)}")
    print()
    
    # Load pipeline
    print("[1/4] Loading ensemble pipeline...")
    try:
        from app.services.ensemble_sentiment import get_ensemble_pipeline
        pipeline = get_ensemble_pipeline()
        print("      Pipeline loaded successfully")
    except Exception as e:
        print(f"      ERROR loading pipeline: {e}")
        return
    
    # Run predictions
    print("\n[2/4] Running predictions...")
    
    y_true = []
    y_pred = []
    predictions = []
    total_time = 0
    
    for i, (text, expected, lang_type, category) in enumerate(TEST_DATASET):
        # Progress indicator
        if (i + 1) % 10 == 0:
            print(f"      Processed {i + 1}/{len(TEST_DATASET)} samples...")
        
        start = time.time()
        try:
            result = pipeline.analyze(text)
            predicted = result.final_result["sentiment"]
            confidence = result.final_result["combined_confidence"]
            emotions = result.final_result.get("emotions", [])
            elapsed = (time.time() - start) * 1000
        except Exception as e:
            predicted = "error"
            confidence = 0
            emotions = []
            elapsed = 0
            print(f"      ERROR on sample {i}: {e}")
        
        total_time += elapsed
        y_true.append(expected)
        y_pred.append(predicted)
        
        predictions.append({
            "id": i + 1,
            "text": text[:50] + "..." if len(text) > 50 else text,
            "expected": expected,
            "predicted": predicted,
            "correct": expected == predicted,
            "confidence": round(confidence, 3),
            "emotions": emotions[:3],
            "language_type": lang_type,
            "category": category,
            "time_ms": round(elapsed, 1)
        })
    
    print(f"      Completed all {len(TEST_DATASET)} samples")
    print(f"      Total processing time: {total_time/1000:.1f} seconds")
    print(f"      Average per sample: {total_time/len(TEST_DATASET):.0f} ms")
    
    # Calculate metrics
    print("\n[3/4] Calculating metrics...")
    
    labels = ["positive", "neutral", "mixed", "negative", "strongly_negative"]
    metrics = calculate_metrics(y_true, y_pred, labels)
    confusion = build_confusion_matrix(y_true, y_pred, labels)
    
    # Print results
    print("\n[4/4] Results\n")
    
    # Summary metrics
    print("=" * 70)
    print("SUMMARY METRICS")
    print("=" * 70)
    print(f"\n  Overall Accuracy:      {metrics['accuracy']:.2%} ({metrics['correct_predictions']}/{metrics['total_samples']})")
    print(f"  Macro F1 Score:        {metrics['macro_avg']['f1_score']:.4f}")
    print(f"  Weighted F1 Score:     {metrics['weighted_avg']['f1_score']:.4f}")
    print(f"  Macro Precision:       {metrics['macro_avg']['precision']:.4f}")
    print(f"  Macro Recall:          {metrics['macro_avg']['recall']:.4f}")
    
    # Classification report
    print_classification_report(metrics, labels)
    
    # Confusion matrix
    print("\n" + "=" * 70)
    print("CONFUSION MATRIX")
    print("=" * 70)
    print()
    print_confusion_matrix(confusion, labels)
    
    # Misclassifications analysis
    misclassified = [p for p in predictions if not p["correct"]]
    if misclassified:
        print("=" * 70)
        print("MISCLASSIFICATION ANALYSIS")
        print("=" * 70)
        print(f"\nTotal misclassified: {len(misclassified)}/{len(predictions)} ({100*len(misclassified)/len(predictions):.1f}%)")
        print("\nMisclassified samples:")
        print("-" * 70)
        for m in misclassified[:10]:  # Show first 10
            print(f"  [{m['id']}] \"{m['text']}\"")
            print(f"       Expected: {m['expected']} | Predicted: {m['predicted']} | Conf: {m['confidence']}")
            print(f"       Category: {m['category']} | Language: {m['language_type']}")
            print()
    
    # Per-category accuracy
    print("=" * 70)
    print("ACCURACY BY CATEGORY")
    print("=" * 70)
    categories = {}
    for p in predictions:
        cat = p["category"]
        if cat not in categories:
            categories[cat] = {"correct": 0, "total": 0}
        categories[cat]["total"] += 1
        if p["correct"]:
            categories[cat]["correct"] += 1
    
    print(f"\n{'Category':<25} {'Correct':>10} {'Total':>10} {'Accuracy':>10}")
    print("-" * 55)
    for cat, vals in sorted(categories.items(), key=lambda x: x[1]["correct"]/x[1]["total"]):
        acc = vals["correct"] / vals["total"]
        print(f"{cat:<25} {vals['correct']:>10} {vals['total']:>10} {acc:>10.1%}")
    
    # Per-language accuracy
    print("\n" + "=" * 70)
    print("ACCURACY BY LANGUAGE TYPE")
    print("=" * 70)
    languages = {}
    for p in predictions:
        lang = p["language_type"]
        if lang not in languages:
            languages[lang] = {"correct": 0, "total": 0}
        languages[lang]["total"] += 1
        if p["correct"]:
            languages[lang]["correct"] += 1
    
    print(f"\n{'Language':<15} {'Correct':>10} {'Total':>10} {'Accuracy':>10}")
    print("-" * 45)
    for lang, vals in sorted(languages.items(), key=lambda x: -x[1]["correct"]/x[1]["total"]):
        acc = vals["correct"] / vals["total"]
        print(f"{lang:<15} {vals['correct']:>10} {vals['total']:>10} {acc:>10.1%}")
    
    # Save results to files
    print("\n" + "=" * 70)
    print("SAVING RESULTS")
    print("=" * 70)
    
    # Save JSON results
    results = {
        "evaluation_date": datetime.now().isoformat(),
        "total_samples": len(TEST_DATASET),
        "metrics": metrics,
        "confusion_matrix": {
            "labels": labels,
            "matrix": confusion
        },
        "predictions": predictions,
        "per_category_accuracy": {k: v["correct"]/v["total"] for k, v in categories.items()},
        "per_language_accuracy": {k: v["correct"]/v["total"] for k, v in languages.items()},
        "processing_stats": {
            "total_time_seconds": round(total_time/1000, 2),
            "average_time_ms": round(total_time/len(TEST_DATASET), 1)
        }
    }
    
    with open("evaluation_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print("  Saved: evaluation_results.json")
    
    # Save confusion matrix CSV
    with open("confusion_matrix.csv", "w", encoding="utf-8") as f:
        f.write("," + ",".join(labels) + "\n")
        for i, row in enumerate(confusion):
            f.write(labels[i] + "," + ",".join(str(v) for v in row) + "\n")
    print("  Saved: confusion_matrix.csv")
    
    # Save predictions CSV
    with open("predictions_detail.csv", "w", encoding="utf-8") as f:
        f.write("id,text,expected,predicted,correct,confidence,language,category\n")
        for p in predictions:
            text_clean = p["text"].replace('"', "'").replace(",", ";")
            f.write(f'{p["id"]},"{text_clean}",{p["expected"]},{p["predicted"]},{p["correct"]},{p["confidence"]},{p["language_type"]},{p["category"]}\n')
    print("  Saved: predictions_detail.csv")
    
    print("\n" + "=" * 70)
    print("EVALUATION COMPLETE")
    print("=" * 70)
    
    return results


if __name__ == "__main__":
    run_evaluation()
