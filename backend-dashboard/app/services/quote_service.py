"""
Quote service for fetching daily positive quotes.
Uses ZenQuotes API with fallback to local quotes.
"""

import httpx
import random
import logging
from typing import Optional, Dict

logger = logging.getLogger(__name__)

# Fallback quotes for when API is unavailable
FALLBACK_QUOTES = [
    {"q": "You are stronger than you know, braver than you believe, and loved more than you can imagine.", "a": "Unknown"},
    {"q": "Every day may not be good, but there is something good in every day.", "a": "Alice Morse Earle"},
    {"q": "You don't have to be positive all the time. It's perfectly okay to feel sad, angry, or frustrated.", "a": "Lori Deschene"},
    {"q": "Be gentle with yourself. You're doing the best you can.", "a": "Unknown"},
    {"q": "Your mental health is more important than your productivity.", "a": "Unknown"},
    {"q": "It's okay to take a break. Rest is not a reward, it's a necessity.", "a": "Unknown"},
    {"q": "Small steps are still progress. Celebrate every little win.", "a": "Unknown"},
    {"q": "You are not your thoughts. You are the one who observes them.", "a": "Eckhart Tolle"},
    {"q": "Healing is not linear. Be patient with yourself.", "a": "Unknown"},
    {"q": "You are worthy of love and belonging, exactly as you are.", "a": "Brené Brown"},
    {"q": "The only way out is through. And you will get through this.", "a": "Robert Frost"},
    {"q": "Take it one day at a time, one hour at a time, one moment at a time.", "a": "Unknown"},
    {"q": "Your feelings are valid, even if others don't understand them.", "a": "Unknown"},
    {"q": "Progress, not perfection, is what matters.", "a": "Unknown"},
    {"q": "You've survived 100% of your worst days. You're doing amazing.", "a": "Unknown"},
    {"q": "It's okay to ask for help. It's a sign of strength, not weakness.", "a": "Unknown"},
    {"q": "Breathe. You are exactly where you need to be right now.", "a": "Unknown"},
    {"q": "Your story isn't over yet. The best chapters may still be unwritten.", "a": "Unknown"},
    {"q": "Be kind to your mind. It's doing its best to protect you.", "a": "Unknown"},
    {"q": "You are enough. You have always been enough. You will always be enough.", "a": "Unknown"},
    {"q": "Tomorrow is a new day with no mistakes in it yet.", "a": "L.M. Montgomery"},
    {"q": "The sun will rise and we will try again.", "a": "Twenty One Pilots"},
    {"q": "In the middle of difficulty lies opportunity.", "a": "Albert Einstein"},
    {"q": "What lies behind us and what lies before us are tiny matters compared to what lies within us.", "a": "Ralph Waldo Emerson"},
    {"q": "Happiness can be found even in the darkest of times, if one only remembers to turn on the light.", "a": "Albus Dumbledore"},
]


async def fetch_daily_quote() -> Dict[str, str]:
    """
    Fetch a random positive quote from ZenQuotes API.
    Falls back to local quotes if API fails.
    
    Returns:
        Dict with 'quote' and 'author' keys
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get("https://zenquotes.io/api/random")
            if response.status_code == 200:
                data = response.json()
                if data and len(data) > 0:
                    quote_data = data[0]
                    return {
                        "quote": quote_data.get("q", ""),
                        "author": quote_data.get("a", "Unknown")
                    }
    except Exception as e:
        logger.warning(f"Failed to fetch quote from ZenQuotes: {e}")
    
    # Fallback to local quotes
    fallback = random.choice(FALLBACK_QUOTES)
    return {
        "quote": fallback["q"],
        "author": fallback["a"]
    }


def get_random_fallback_quote() -> Dict[str, str]:
    """
    Get a random quote from the fallback list (synchronous).
    """
    fallback = random.choice(FALLBACK_QUOTES)
    return {
        "quote": fallback["q"],
        "author": fallback["a"]
    }
