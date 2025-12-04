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
        'idk', 'dunno', 'wala', 'wla', 'none', 'nothing', 'n/a', 'na',

        "a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z",

        "aa","ah","aha","ahah","ahh","ahhh","ahhhh",
        "ao","ay","aye","ayo",

        "ba","bah","baa","bo","bro","bruh","bru","bruu","bruuu",
        "btw","bc","bcs","becuz","becos",

        "ca","co","cmon","cmn","cuh","cmonnn",

        "da","dah","damn","dang","derp","der","duno","dunnu","dono",
        "dno","dnt","dk","dky","dyk",

        "eh","ehe","ehee","eheh","ehh","ehhh",
        "emm","eme","emeh","erm","er","errr",

        "fa","fam","fax","forreal","fr","frfr","frr","frrr",
        
        "ga","gah","gawd","geez","gee","guh","gawd",

        "ha","hah","haha","hahaha","hahahaha",
        "hee","hehe","hehehe","heh","hmmm","hmm","hm","huh","huhu",
        "hmp","hmph","huhh","huhhh",

        "idk","idc","idcfr","idek","iono","iono","iono",
        "ikr","ig","igss","iguess","ily","ilyy","ilyyy",

        "ja","jk","jkjk","jst","jus","justsayin","js","juss",

        "ka","k","kk","kek","kekeke","kay","kayyy","kys (harmless: 'keep yourself safe')",

        "la","lah","leh","lol","lmao","lmfao","lmaooo","loool","lolol",
        "lel","lul","lulz","lawl","lqtm","lols","looool",

        "ma","meh","mehh","mehhh","mhm","mhrm","mm","mmm","mmmm",
        "mb","mbn","mbb","maaan","mannn",

        "na","nah","naa","naaa","naw","naww","nuh","nuu","no","nuhuh",
        "nop","nope","nooo","noooo","nooooo","nvm","nvmd",

        "oa","oh","ohh","ohhh","ohhhh","oof","ooof","oooof","oomf",
        "omg","omfg","oml","omw","on god","ong","ongg","onggg",

        "pa","pff","pfft","pft","ph","psh","pshh","pshhh",

        "qt","q_q","qq","qqq",

        "ra","rah","rawr","ree","reee","reeee","rip","ripp","rly","rlly","rlllly",

        "sa","sigh","siiiigh","sighhh","smh","smhh","smhhh",
        "sheesh","sheeeesh","sksk","sksksk","sksksksk",
        "stg","swear","swrs",

        "ta","tsk","tssk","tsktsk","ty","tysm","thx","thanx",
        "tbh","tbf","tbt","tft","ttyl","ttys",

        "uh","uhh","uhhh","uhhhh","uhm","uhmm","uhmmm",
        "umm","ummm","ummmm",
        "ugh","ughh","ughhh","ughhhh",
        "uhhuh","uhuh","uhoh",

        "va","vibe","vibes","vibin","vibinn","vibin'",

        "wa","whew","woah","woo","wooo","woooo",
        "wut","wat","watt","wdyw","wyd","wyd?","wyd???",
        "wow","woww","wowww",
        "wym","wydd","wydfr",

        "xa","xoxo","xo","xox","xddd","xd","xdd","xddddd",

        "ya","yay","yaay","yayy","yikes","yikess","yo","yoo",
        "yooo","yoooo","yoinks","yuh","yea","yeah","ye","yeet",
        "yeee","yeeeet","ykwim","yk","ykno","ykm","yooo",

        "za","zzz","zz","zzzZ","zzzz","zzzZZZ",

        "aaaa","aaaaa","aaaaaa","aaaah","aaaagh",
        "asdf","asf","asff","asfff",
        "ayo","ayooo","ayoooo",
        "boom","boop","bonk","blip","blah","bla","blahh","blagh",

        "ehhh","huehue","hue","hueh","heueu","heheh","haw","haww",

        "ooo","oooo","ooooo","ooooh","ooh","oooh","ooooh",
        "yoop","yurp","yerp","yerr","yee","yeee","yahh",
        
        "mmmhm","mhm","mhmm","mhmmm","mhhhmm",
        "mmmmk","mmkay","mk","mkay",

        "myg","mygod","mygaaah",

        "nahh","nahhh","naah","naaaa",
        "noppe","noopp","nopppe",

        "omfg","oml","omll","omgg","omggg",

        "dfsxgfasd","qwe","whateverrr","whatev","whatevs",
        "welp","welpp","welppp","welp.",

        "zup","sup","suuup","suuuuup",

        "bluh","bleh","blehh","blehhh",
        "bloop","boop","booop","boooop",

        "dude","duuudee","duuuuude",

        "ok","okay","okayy","okk","okok","okokok",
        "okkay","ookay","ook","okie","okies",

        "yeppers","yep","yepper","yepp","yippe","yipi",
    
        "wai","waait","waiiit","waittt",
    
        "empty","blank","none","null","na","n/a","idk bro",
        "idk man","idk tbh","ion","ionno","iono","ionknow",

        "aiyo","aiyoo","aiyoooo",

        "goofy","goofyahh","goof","goofie",

        "mid","miiid","miiiddd",

        "q5235","wq3ttr","just saying",
        "just askin","just wonderin","just curious","lolz",
        
        "placeholder","nothingmuch","nothin","nth","naur","noor",
        
        "fine","okie dokie","oki","okiidoki","okieeee"

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
