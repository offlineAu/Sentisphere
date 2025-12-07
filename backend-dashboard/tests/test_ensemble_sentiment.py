"""
Test suite for the Ensemble Sentiment Pipeline.

Tests the three-stage sentiment analysis:
1. XLM-RoBERTa base analysis
2. Bisaya refinement (conditional)
3. Hybrid merge

Run with: python -m pytest tests/test_ensemble_sentiment.py -v
"""

import pytest
from typing import Dict


# =============================================================================
# BISAYA DETECTOR TESTS
# =============================================================================

class TestBisayaDetector:
    """Tests for Bisaya language detection."""
    
    def test_detect_bisaya_heavy_text(self):
        """Test detection of heavily Bisaya text."""
        from app.utils.bisaya_detector import detect_bisaya
        
        # Heavily Bisaya text
        text = "Ambot oy kapoy na kaayo ko pero sige lang gud"
        result = detect_bisaya(text)
        
        assert result["is_heavily_bisaya"] is True
        assert result["bisaya_ratio"] >= 0.4
        assert "kapoy" in result["bisaya_markers_found"]
        assert "kaayo" in result["bisaya_markers_found"]
    
    def test_detect_bisaya_moderate_text(self):
        """Test detection of moderately Bisaya text."""
        from app.utils.bisaya_detector import detect_bisaya
        
        # Mixed text with some Bisaya
        text = "I'm feeling okay lang today, chill ra kaayo"
        result = detect_bisaya(text)
        
        assert result["is_moderately_bisaya"] is True
        assert result["bisaya_ratio"] >= 0.2
    
    def test_detect_english_text(self):
        """Test that English text is not flagged as Bisaya."""
        from app.utils.bisaya_detector import detect_bisaya
        
        text = "I am feeling stressed about my upcoming exams"
        result = detect_bisaya(text)
        
        assert result["is_heavily_bisaya"] is False
        assert result["is_moderately_bisaya"] is False
        assert result["dominant_language"] in ["english", "mixed"]
    
    def test_should_use_bisaya_low_confidence(self):
        """Test routing to Bisaya model on low confidence."""
        from app.utils.bisaya_detector import should_use_bisaya_model
        
        text = "Ambot lang ko unsay feeling nako"
        should_use, reason = should_use_bisaya_model(text, base_confidence=0.55)
        
        assert should_use is True
        assert "Low base confidence" in reason
    
    def test_should_use_bisaya_heavy_content(self):
        """Test routing to Bisaya model on heavy Bisaya content."""
        from app.utils.bisaya_detector import should_use_bisaya_model
        
        text = "Kapoy kaayo gyud ko karon, lisod ang skwelahan"
        should_use, reason = should_use_bisaya_model(text, base_confidence=0.80)
        
        assert should_use is True
        assert "Heavy Bisaya" in reason


# =============================================================================
# ENSEMBLE PIPELINE TESTS
# =============================================================================

class TestEnsemblePipeline:
    """Tests for the full ensemble pipeline."""
    
    def test_empty_input(self):
        """Test handling of empty input."""
        from app.services.ensemble_sentiment import get_ensemble_pipeline
        
        pipeline = get_ensemble_pipeline()
        result = pipeline.analyze("")
        
        assert result.final_result["sentiment"] == "neutral"
        assert result.final_result["combined_confidence"] == 0.5
    
    def test_bisaya_heavy_negative(self):
        """Test heavily Bisaya negative sentiment text."""
        from app.services.ensemble_sentiment import get_ensemble_pipeline
        
        # Your example text with suicidal ideation
        text = (
            "Ambot oy kapoy na kaayo ko pero sige lang gud. "
            "kapoi pajud kaayo ang skwelahan unya gadugang pa akong uyab "
            "nga sige ug pangaway. gusto nlng ko mag hikog"
        )
        
        pipeline = get_ensemble_pipeline()
        result = pipeline.analyze(text)
        
        # Should detect strongly negative with crisis flags
        final = result.final_result
        assert final["sentiment"] in ["negative", "strongly_negative"]
        assert "crisis_language" in final["flags"] or final["sentiment"] == "strongly_negative"
        
        # Should have high confidence due to clear distress
        assert final["combined_confidence"] >= 0.7
        
        # Bisaya model should have been used
        assert result.bisaya_model is not None
    
    def test_mixed_sentiment(self):
        """Test mixed sentiment detection."""
        from app.services.ensemble_sentiment import get_ensemble_pipeline
        
        text = "Chill ra kaayo, pero murag stress gamay sa exams. Kaya ra gihapon."
        
        pipeline = get_ensemble_pipeline()
        result = pipeline.analyze(text)
        
        final = result.final_result
        # Could be mixed or neutral depending on model
        assert final["sentiment"] in ["mixed", "neutral", "negative"]
    
    def test_positive_sentiment(self):
        """Test positive sentiment detection."""
        from app.services.ensemble_sentiment import get_ensemble_pipeline
        
        text = "Nalipay kaayo ko karon! Happy ra gyud. Nice kaayo ang adlaw."
        
        pipeline = get_ensemble_pipeline()
        result = pipeline.analyze(text)
        
        final = result.final_result
        assert final["sentiment"] in ["positive", "mixed"]
    
    def test_user_context_override(self):
        """Test that user context overrides text analysis."""
        from app.services.ensemble_sentiment import get_ensemble_pipeline
        
        # Text seems okay but user reports high stress
        text = "okay lang"
        
        pipeline = get_ensemble_pipeline()
        result = pipeline.analyze(
            text,
            mood_level="Anxious",
            stress_level="Very High Stress",
            energy_level="Low",
        )
        
        final = result.final_result
        # User context should push toward negative
        assert final["sentiment"] in ["negative", "mixed", "strongly_negative"]
    
    def test_output_format(self):
        """Test that output matches expected JSON format."""
        from app.services.ensemble_sentiment import get_ensemble_pipeline
        
        text = "Test text for format verification"
        
        pipeline = get_ensemble_pipeline()
        result = pipeline.analyze(text)
        output = result.to_dict()
        
        # Check required fields
        assert "xlm_roberta" in output
        assert "emotion_detection" in output
        assert "final_result" in output
        
        # Check XLM-RoBERTa fields
        xlm = output["xlm_roberta"]
        assert "sentiment" in xlm
        assert "confidence" in xlm
        assert "interpretation" in xlm
        assert "detected_language" in xlm
        
        # Check final result fields
        final = output["final_result"]
        assert "sentiment" in final
        assert "combined_confidence" in final
        assert "reasoning" in final
        assert "emotions" in final
        assert "dominant_emotion" in final
        assert "flags" in final
        assert "language_detection" in final


# =============================================================================
# NLP LOADER INTEGRATION TESTS
# =============================================================================

class TestNLPLoaderIntegration:
    """Tests for nlp_loader.py ensemble functions."""
    
    def test_analyze_text_ensemble(self):
        """Test the simplified ensemble analysis function."""
        from app.utils.nlp_loader import analyze_text_ensemble
        
        text = "Kapoy kaayo ko pero laban lang"
        result = analyze_text_ensemble(text)
        
        assert result.sentiment in ["positive", "negative", "neutral", "mixed", "strongly_negative"]
        assert 0.0 <= result.confidence <= 1.0
        assert result.model_version == "ensemble-v1.0"
        assert result.emotions  # Should have emotions string
    
    def test_analyze_text_ensemble_detailed(self):
        """Test the detailed ensemble analysis function."""
        from app.utils.nlp_loader import analyze_text_ensemble_detailed
        
        text = "Grabe kapoy kaayo, stress sa school"
        result = analyze_text_ensemble_detailed(text)
        
        assert isinstance(result, dict)
        assert "final_result" in result
        assert result["final_result"]["sentiment"] in ["positive", "negative", "neutral", "mixed", "strongly_negative"]


# =============================================================================
# CRISIS DETECTION TESTS
# =============================================================================

class TestCrisisDetection:
    """Tests for crisis language detection."""
    
    def test_detect_suicide_ideation_bisaya(self):
        """Test detection of Bisaya suicide ideation."""
        from app.services.ensemble_sentiment import get_ensemble_pipeline
        
        text = "gusto nlng ko mag hikog"  # "I just want to hang myself"
        
        pipeline = get_ensemble_pipeline()
        result = pipeline.analyze(text)
        
        final = result.final_result
        # Should be strongly negative with crisis flag
        assert final["sentiment"] == "strongly_negative" or "crisis_language" in final["flags"]
    
    def test_detect_extreme_distress(self):
        """Test detection of extreme distress markers."""
        from app.services.ensemble_sentiment import get_ensemble_pipeline
        
        text = "Ayoko na talaga. Di ko na kaya. Gusto ko na matapos lahat."
        
        pipeline = get_ensemble_pipeline()
        result = pipeline.analyze(text)
        
        final = result.final_result
        assert final["sentiment"] in ["negative", "strongly_negative"]


# =============================================================================
# PERFORMANCE TESTS
# =============================================================================

class TestPerformance:
    """Basic performance tests."""
    
    def test_model_caching(self):
        """Test that models are cached (singleton pattern)."""
        from app.services.ensemble_sentiment import get_ensemble_pipeline
        
        # Get pipeline twice
        pipeline1 = get_ensemble_pipeline()
        pipeline2 = get_ensemble_pipeline()
        
        # Should be the same instance
        assert pipeline1 is pipeline2
    
    def test_processing_time_recorded(self):
        """Test that processing time is recorded."""
        from app.services.ensemble_sentiment import get_ensemble_pipeline
        
        text = "Test text for timing"
        
        pipeline = get_ensemble_pipeline()
        result = pipeline.analyze(text)
        
        # Should have processing time
        assert result.processing_time_ms >= 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
