"""Gibberish detection utility.

Detects meaningless text to avoid wasting sentiment analysis resources.
"""
import re
from typing import Optional


class GibberishDetector:
    """Detect if text is gibberish/meaningless."""
    
    # Minimum requirements for valid text
    MIN_LENGTH = 3
    MIN_WORDS = 2
    MIN_VOWEL_RATIO = 0.15  # At least 15% vowels
    MAX_CONSONANT_STREAK = 7  # Max consecutive consonants
    MAX_REPEAT_RATIO = 0.6  # Max 60% repeated characters
    
    # Common gibberish patterns
    GIBBERISH_PATTERNS = [
        r'^[a-z]{1,2}$',  # Single/double letter
        r'^(.)\1{4,}$',  # Same character repeated 5+ times (aaaaa)
        r'^[^aeiouAEIOU\s]{8,}$',  # 8+ consonants with no vowels
        r'^\d+$',  # Only numbers
        r'^[^\w\s]+$',  # Only special characters
        r'^(test|asdf|qwer|zxcv|hjkl)+$',  # Keyboard mashing
    ]
    
    # Common filler words that alone are gibberish
    FILLER_ONLY = {
        'ok', 'okay', 'k', 'kk', 'lol', 'haha', 'hehe', 'hmm', 'uhm', 'um',
        'uh', 'ah', 'oh', 'eh', 'meh', 'yep', 'nope', 'yeah', 'nah',
        'idk', 'dunno', 'wala', 'wla', 'none', 'nothing', 'n/a', 'na'
    }
    
    @classmethod
    def is_gibberish(cls, text: Optional[str]) -> bool:
        """Check if text is gibberish.
        
        Args:
            text: Text to check
            
        Returns:
            True if gibberish, False if valid text
        """
        if not text or not isinstance(text, str):
            return True
        
        # Clean and normalize
        cleaned = text.strip()
        
        # Too short
        if len(cleaned) < cls.MIN_LENGTH:
            return True
        
        # Check for gibberish patterns
        for pattern in cls.GIBBERISH_PATTERNS:
            if re.match(pattern, cleaned, re.IGNORECASE):
                return True
        
        # Extract words (alphanumeric sequences)
        words = re.findall(r'\b\w+\b', cleaned.lower())
        
        # Too few words
        if len(words) < cls.MIN_WORDS:
            # Check if single word is just filler
            if len(words) == 1 and words[0] in cls.FILLER_ONLY:
                return True
            # Single word must be at least 4 characters
            if len(words) == 1 and len(words[0]) < 4:
                return True
        
        # Check if all words are filler
        if words and all(w in cls.FILLER_ONLY for w in words):
            return True
        
        # Check vowel ratio (excluding spaces and punctuation)
        letters_only = re.sub(r'[^a-zA-Z]', '', cleaned)
        if letters_only:
            vowels = sum(1 for c in letters_only.lower() if c in 'aeiou')
            vowel_ratio = vowels / len(letters_only)
            if vowel_ratio < cls.MIN_VOWEL_RATIO:
                return True
        
        # Check for excessive consonant streaks
        if cls._has_long_consonant_streak(cleaned):
            return True
        
        # Check for excessive character repetition
        if cls._has_excessive_repetition(cleaned):
            return True
        
        return False
    
    @classmethod
    def _has_long_consonant_streak(cls, text: str) -> bool:
        """Check if text has unusually long consonant sequences."""
        consonant_streak = 0
        for char in text.lower():
            if char.isalpha():
                if char not in 'aeiou':
                    consonant_streak += 1
                    if consonant_streak > cls.MAX_CONSONANT_STREAK:
                        return True
                else:
                    consonant_streak = 0
        return False
    
    @classmethod
    def _has_excessive_repetition(cls, text: str) -> bool:
        """Check if text has too many repeated characters."""
        if len(text) < 5:
            return False
        
        # Count character frequencies
        char_counts = {}
        for char in text.lower():
            if char.isalnum():
                char_counts[char] = char_counts.get(char, 0) + 1
        
        if not char_counts:
            return False
        
        # Check if any character appears too frequently
        total_chars = sum(char_counts.values())
        max_count = max(char_counts.values())
        
        return (max_count / total_chars) > cls.MAX_REPEAT_RATIO
    
    @classmethod
    def get_reason(cls, text: Optional[str]) -> Optional[str]:
        """Get reason why text is considered gibberish.
        
        Useful for debugging/logging.
        """
        if not text or not isinstance(text, str):
            return "Empty or invalid text"
        
        cleaned = text.strip()
        
        if len(cleaned) < cls.MIN_LENGTH:
            return f"Too short (< {cls.MIN_LENGTH} chars)"
        
        for pattern in cls.GIBBERISH_PATTERNS:
            if re.match(pattern, cleaned, re.IGNORECASE):
                return f"Matches gibberish pattern: {pattern}"
        
        words = re.findall(r'\b\w+\b', cleaned.lower())
        
        if len(words) < cls.MIN_WORDS:
            if len(words) == 1 and words[0] in cls.FILLER_ONLY:
                return f"Single filler word: {words[0]}"
            if len(words) == 1 and len(words[0]) < 4:
                return f"Single short word: {words[0]}"
        
        if words and all(w in cls.FILLER_ONLY for w in words):
            return "Only filler words"
        
        letters_only = re.sub(r'[^a-zA-Z]', '', cleaned)
        if letters_only:
            vowels = sum(1 for c in letters_only.lower() if c in 'aeiou')
            vowel_ratio = vowels / len(letters_only)
            if vowel_ratio < cls.MIN_VOWEL_RATIO:
                return f"Low vowel ratio: {vowel_ratio:.2%}"
        
        if cls._has_long_consonant_streak(cleaned):
            return "Excessive consonant streak"
        
        if cls._has_excessive_repetition(cleaned):
            return "Excessive character repetition"
        
        return None


# Convenience function
def is_gibberish(text: Optional[str]) -> bool:
    """Quick check if text is gibberish."""
    return GibberishDetector.is_gibberish(text)
