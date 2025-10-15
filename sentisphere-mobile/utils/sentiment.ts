// Lightweight on-device sentiment and emotion analyzer + simple coaching replies
// No external packages; suitable for Expo/React Native.

export type SentimentLabel = 'positive' | 'neutral' | 'negative';

export type Analysis = {
  score: number; // total score
  comparative: number; // per token
  label: SentimentLabel;
  tokens: string[];
  signals: string[]; // matched keywords
  emotions: {
    joy: number;
    sadness: number;
    anger: number;
    anxiety: number;
    stress: number;
    calm: number;
  };
  risk: {
    selfHarm: boolean;
    harmToOthers: boolean;
    crisis: boolean; // selfHarm || harmToOthers || severe alarm words
    flags: string[];
    terms?: string[];
    score?: number;
  };
  sentences?: Array<{ text: string; score: number; comparative: number; label: SentimentLabel }>;
  intensity?: number;
  shift?: number;
  phraseMatches?: string[];
  maskingPossible?: boolean;
};

const LEXICON: Record<string, number> = {
  // positive
  'good': 2, 'great': 3, 'awesome': 3, 'amazing': 3, 'fantastic': 3, 'happy': 2, 'glad': 2, 'joy': 3, 'joyful': 3,
  'proud': 2, 'love': 3, 'loved': 3, 'like': 1, 'calm': 2, 'peaceful': 2, 'relaxed': 2, 'grateful': 2, 'hopeful': 2,
  'confident': 2, 'excited': 2, 'relief': 2, 'relieved': 2, 'content': 2, 'satisfied': 2, 'motivated': 2, 'hope': 1.5,
  // negative
  'bad': -2, 'terrible': -3, 'awful': -3, 'horrible': -3, 'sad': -2, 'depressed': -3, 'hopeless': -3,
  'anxious': -2, 'anxiety': -2, 'worried': -2, 'afraid': -2, 'scared': -2, 'nervous': -2, 'panic': -3,
  'angry': -2, 'furious': -3, 'mad': -2, 'annoyed': -2, 'irritated': -2, 'frustrated': -2, 'resentful': -2,
  'stressed': -2, 'overwhelmed': -2, 'burnt': -2, 'burned': -2, 'exhausted': -2, 'tired': -1,
  'lonely': -2, 'cry': -2, 'crying': -2, 'guilty': -2, 'ashamed': -2, 'worthless': -4, 'helpless': -3, 'misunderstood': -2,
  'isolated': -3, 'trapped': -3, 'numb': -2, 'empty': -2,
  'sick': -1, 'pain': -2, 'hurt': -2, 'failed': -2, 'failure': -2,
  // stronger risk-related tokens
  'die': -3, 'dying': -3, 'died': -3, 'dead': -3, 'death': -3,
  'suicide': -4, 'suicidal': -4, 'kys': -4, 'kms': -4,
};

const EMOTION_SETS: Record<keyof Analysis['emotions'], string[]> = {
  joy: ['happy','joy','joyful','glad','grateful','excited','proud','love','loved','content','relief','relieved','satisfied','motivated','hope','hopeful'],
  sadness: ['sad','down','lonely','depressed','cry','crying','grief','hopeless','worthless','guilty','ashamed','isolated','trapped','helpless','misunderstood','numb','empty','disappointed','discouraged'],
  anger: ['angry','mad','furious','annoyed','irritated','rage','resent','frustrated','resentful'],
  anxiety: ['anxious','anxiety','worried','afraid','fear','nervous','panic','scared','overthinking'],
  stress: ['stressed','overwhelmed','pressure','burnt','burned','exhausted','tired'],
  calm: ['calm','peaceful','relaxed','okay','fine','content'],
};

const NEGATIONS = new Set(['not', "don't", 'dont', "didn't", 'didnt', "isn't", 'isnt', "can't", 'cant', 'never', 'no', "won't", 'wont', "n't"]);
const INTENSIFIERS: Record<string, number> = {
  'very': 1.5,
  'really': 1.4,
  'so': 1.3,
  'too': 1.3,
  'extremely': 1.8,
  'super': 1.4,
  'quite': 1.2,
  'a lot': 1.2,
};

// Humor markers to help disambiguate slang like "I'm dead" used jokingly
const HUMOR_MARKERS = ['lol', 'lmao', 'rofl', 'haha', 'lqtm', '😂', '🤣'];

const PHRASES: Record<string, number> = {
  'not good enough': -3,
  'feel like giving up': -4,
  "can't handle this": -3,
  'cant handle this': -3,
  'no one cares': -3,
  'tired of living': -4,
  'over the edge': -3,
  'i hate myself': -4,
  'better off dead': -4,
  'give up on life': -4,
  'no one would miss me': -4,
  'nothing matters': -3,
};

type RiskType = 'self-harm' | 'harm-others' | 'crisis';
const RISK_PATTERNS: Array<{ re: RegExp; type: RiskType; flag: string }> = [
  { re: /\b(suicide|suicidal)\b/i, type: 'crisis', flag: 'crisis' },
  { re: /\bkill\s+(myself|my\s+self)\b/i, type: 'self-harm', flag: 'self-harm' },
  { re: /\bhurt\s+(myself|my\s+self)\b/i, type: 'self-harm', flag: 'self-harm' },
  { re: /\bend\s+(?:my|the)\s+life\b/i, type: 'self-harm', flag: 'self-harm' },
  { re: /\bend\s+it\s+all\b/i, type: 'self-harm', flag: 'self-harm' },
  { re: /\b(?:wanna|want(?:\s+to)?)\s+die\b/i, type: 'self-harm', flag: 'self-harm' },
  { re: /\b(?:wish\s+i\s+(?:were|was)\s+dead)\b/i, type: 'self-harm', flag: 'self-harm' },
  { re: /\bkill\s+(?:them|someone|people|others)\b/i, type: 'harm-others', flag: 'harm-others' },
  { re: /\bhurt\s+(?:them|someone|people|others)\b/i, type: 'harm-others', flag: 'harm-others' },
  { re: /\bkys\b/i, type: 'self-harm', flag: 'self-harm' },
  { re: /\bkms\b/i, type: 'self-harm', flag: 'self-harm' },
  { re: /\blife\s+is\s+meaningless\b/i, type: 'crisis', flag: 'crisis' },
  { re: /\bi\s+can'?t\s+(?:go\s+on|take\s+it)\b/i, type: 'crisis', flag: 'crisis' },
  { re: /\bnothing\s+matters\b/i, type: 'crisis', flag: 'crisis' },
  { re: /\bfeel\s+empty\b/i, type: 'crisis', flag: 'crisis' },
  { re: /\bno\s+one\s+would\s+miss\s+me\b/i, type: 'crisis', flag: 'crisis' },
  { re: /\bbetter\s+off\s+dead\b/i, type: 'self-harm', flag: 'self-harm' },
  { re: /\btired\s+of\s+(?:everything|living)\b/i, type: 'crisis', flag: 'crisis' },
  { re: /\bgive\s+up\s+on\s+life\b/i, type: 'self-harm', flag: 'self-harm' },
  { re: /\bi\s+can'?t\s+handle\s+this\b/i, type: 'crisis', flag: 'crisis' },
  { re: /\bover\s+the\s+edge\b/i, type: 'crisis', flag: 'crisis' },
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  if (!text) return [];
  const norm = normalize(text);
  // keep common contractions as tokens
  const tokens = norm.split(' ');
  return tokens.filter(Boolean);
}

function splitSentences(text: string): string[] {
  const cleaned = (text || '').replace(/[\r\n]+/g, ' ');
  return cleaned.split(/[.!?]+\s*/).map((s) => s.trim()).filter(Boolean);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countMatches(haystack: string, needlePhrase: string): number {
  if (!haystack || !needlePhrase) return 0;
  const re = new RegExp(`\\b${escapeRegExp(needlePhrase)}\\b`, 'gi');
  const m = haystack.match(re);
  return m ? m.length : 0;
}

export function analyzeSentiment(text: string): Analysis {
  const tokens = tokenize(text);
  let score = 0;
  const signals: string[] = [];
  const phraseMatches: string[] = [];

  let negateWindow = 0; // if > 0, invert next tokens
  let boost = 1;
  let lastSentiment: string | null = null;
  let repeatCount = 0;

  const normalizedAll = normalize(text);
  for (const [ph, val] of Object.entries(PHRASES)) {
    const c = countMatches(normalizedAll, ph);
    if (c > 0) {
      for (let i = 0; i < c; i++) phraseMatches.push(ph);
      score += val * c * 1.2;
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    // Intensifier (lookahead)
    if (INTENSIFIERS[t]) {
      boost = Math.max(boost, INTENSIFIERS[t]);
      continue;
    }

    // Negation
    if ([...NEGATIONS].some((n) => t === n || (n === "n't" && t.endsWith("n't")))) {
      negateWindow = 3; // next 3 sentiment words inverted
      continue;
    }

    const base = LEXICON[t];
    if (typeof base === 'number') {
      if (lastSentiment === t) repeatCount += 1; else { repeatCount = 0; lastSentiment = t; }
      const repeatBoost = 1 + Math.min(2, repeatCount) * 0.25;
      let s = base * boost * repeatBoost;
      if (negateWindow > 0) s = -s;
      score += s;
      signals.push(t);
      // decay
      boost = 1;
      if (negateWindow > 0) negateWindow--;
    } else {
      // decay boost over non-sentiment tokens
      boost = Math.max(1, boost * 0.9);
      if (negateWindow > 0) negateWindow--;
    }
  }

  const comparative = tokens.length ? score / Math.sqrt(tokens.length) : 0;
  const label: SentimentLabel = comparative > 0.8 ? 'positive' : comparative < -0.8 ? 'negative' : 'neutral';

  const emotionsCounts: Record<keyof Analysis['emotions'], number> = {
    joy: 0, sadness: 0, anger: 0, anxiety: 0, stress: 0, calm: 0,
  };
  const setLookup: Array<[keyof Analysis['emotions'], Set<string>]> = (Object.keys(EMOTION_SETS) as Array<keyof Analysis['emotions']>)
    .map((k) => [k, new Set(EMOTION_SETS[k])]);
  for (const t of tokens) {
    for (const [k, set] of setLookup) {
      if (set.has(t)) emotionsCounts[k] += 1;
    }
  }
  // normalize 0..1
  const maxCount = Math.max(1, ...Object.values(emotionsCounts));
  const emotions = Object.fromEntries(
    (Object.keys(emotionsCounts) as Array<keyof Analysis['emotions']>).map((k) => [k, +(emotionsCounts[k] / maxCount).toFixed(2)])
  ) as Analysis['emotions'];

  const sentencesRaw = splitSentences(text);
  const sentences = sentencesRaw.map((s) => {
    const toks = tokenize(s);
    let sc = 0;
    let ng = 0;
    let bs = 1;
    let last: string | null = null;
    let rep = 0;
    for (let i = 0; i < toks.length; i++) {
      const tk = toks[i];
      if (INTENSIFIERS[tk]) { bs = Math.max(bs, INTENSIFIERS[tk]); continue; }
      if ([...NEGATIONS].some((n) => tk === n || (n === "n't" && tk.endsWith("n't")))) { ng = 3; continue; }
      const b = LEXICON[tk];
      if (typeof b === 'number') {
        if (last === tk) rep += 1; else { rep = 0; last = tk; }
        const rBoost = 1 + Math.min(2, rep) * 0.25;
        let v = b * bs * rBoost;
        if (ng > 0) v = -v;
        sc += v;
        bs = 1;
        if (ng > 0) ng--;
      } else {
        bs = Math.max(1, bs * 0.9);
        if (ng > 0) ng--;
      }
    }
    const cmp = toks.length ? sc / Math.sqrt(toks.length) : 0;
    const lab: SentimentLabel = cmp > 0.8 ? 'positive' : cmp < -0.8 ? 'negative' : 'neutral';
    return { text: s, score: sc, comparative: cmp, label: lab };
  });

  const firstCmp = sentences[0]?.comparative ?? comparative;
  const lastCmp = sentences[sentences.length - 1]?.comparative ?? comparative;
  const earlierAvg = sentences.length > 1 ? sentences.slice(0, -1).reduce((acc, it) => acc + it.comparative, 0) / Math.max(1, sentences.length - 1) : comparative;
  const shift = +(lastCmp - firstCmp).toFixed(2);
  const maskingPossible = lastCmp > 0.2 && earlierAvg < -0.5;

  // risk flags
  const flags: string[] = [];
  const raw = text;
  let selfHarm = false;
  let harmToOthers = false;
  let crisisWord = false;
  for (const p of RISK_PATTERNS) {
    if (p.re.test(raw)) {
      if (p.type === 'self-harm') selfHarm = true;
      if (p.type === 'harm-others') harmToOthers = true;
      if (p.type === 'crisis') crisisWord = true;
      if (!flags.includes(p.flag)) flags.push(p.flag);
    }
  }
  // Ambiguous slang: "I'm dead" — treat cautiously unless humor markers detected
  const imDead = /\b(?:i['’]m|i am|im)\s+dead\b/i.test(raw);
  if (imDead) {
    const humor = HUMOR_MARKERS.some((m) => raw.toLowerCase().includes(m));
    if (humor) {
      flags.push('ambiguous-im-dead');
    } else {
      // Not necessarily crisis by itself; combined with lexicon it will classify negative
      flags.push('watch-im-dead');
    }
  }

  const RISK_PRECURSORS = new Set(['hopeless','trapped','numb','empty','tired','worthless','helpless','isolated','exhausted','meaningless','pointless']);
  const precursorCounts: Record<string, number> = {};
  for (const t of tokens) {
    if (RISK_PRECURSORS.has(t)) precursorCounts[t] = (precursorCounts[t] || 0) + 1;
  }
  const precursorTotal = Object.values(precursorCounts).reduce((a, b) => a + b, 0);
  const riskTerms = Object.keys(precursorCounts);
  const riskScore = +(Math.min(1, precursorTotal / Math.max(5, tokens.length / 5))).toFixed(2);
  if (riskScore > 0.4 && (label === 'negative' || comparative < -0.8)) {
    if (!flags.includes('risk-trend')) flags.push('risk-trend');
  }

  const intensity = Math.min(1, Math.max(0, Math.abs(comparative)));
  return {
    score,
    comparative,
    label,
    tokens,
    signals,
    emotions,
    risk: { selfHarm, harmToOthers, crisis: selfHarm || harmToOthers || crisisWord, flags, terms: riskTerms, score: riskScore },
    sentences,
    intensity,
    shift,
    phraseMatches,
    maskingPossible,
  };
}

export function makeCoachIntro(text: string, a: Analysis): string {
  if (a.risk.crisis) {
    return [
      "I'm really glad you reached out. From what you shared, it sounds very heavy.",
      'You deserve immediate care. If you are in danger or thinking about harming yourself or someone else, please contact local emergency services or a crisis hotline right now.',
      'You can also reach out to a trusted adult or counselor at your school. Would you like steps to connect with support now?'
    ].join(' ');
  }
  if (a.risk.flags.includes('ambiguous-im-dead')) {
    return 'I noticed the phrase "I\'m dead" — sometimes that\'s used jokingly, but if you\'re feeling overwhelmed or thinking about harm, your safety matters. How are you feeling right now?';
  }
  const topEmotion = Object.entries(a.emotions).sort((a,b) => b[1]-a[1])[0]?.[0] || 'neutral';
  const mood = a.label === 'positive' ? 'a generally positive tone' : a.label === 'negative' ? 'a heavy tone' : 'a mixed tone';
  const snippet = summarizeSnippet(text, 20);
  const lead = `Thanks for sharing. I picked up ${mood}${snippet ? ` around "${snippet}"` : ''}.`;
  const tip = emotionTip(topEmotion as keyof Analysis['emotions']);
  return `${lead} ${tip} How are you feeling about this right now?`;
}

export function coachReply(userMsg: string, context: { analysis: Analysis; transcript: string; turn: number }): string {
  const t = userMsg.toLowerCase();
  // safety re-check
  const a2 = analyzeSentiment(userMsg);
  if (a2.risk.crisis || /\b(kill myself|suicide|end my life|want to die|wanna die|kys|kms)\b/.test(t)) {
    return 'Thank you for telling me. Your safety matters. If you are in danger or thinking of harming yourself or someone else, please contact emergency services or a crisis hotline now. You can also reach a trusted adult or counselor.';
  }
  if (/thank(s| you)|appreciate/.test(t)) return 'You’re welcome. I’m here to support you. Would it help to set a tiny next step for today?';
  if (/(yes|yeah|yep|okay|ok|sure)/.test(t)) return 'Great. What feels like a small, manageable step you could take in the next 24 hours?';
  if (/(no|not really|maybe later|idk|i don\'t know)/.test(t)) return 'That’s okay. We can sit with it. Would you like to unpack what feels hardest about this?';

  // reflective response
  const reflect = reflective(t);
  const step = nextStepSuggestion(context.analysis);
  return `${reflect} ${step}`;
}

function summarizeSnippet(text: string, maxWords = 18): string {
  const tokens = tokenize(text);
  if (tokens.length <= maxWords) return tokens.join(' ');
  return tokens.slice(0, maxWords).join(' ') + '…';
}

function emotionTip(k: keyof Analysis['emotions']): string {
  switch (k) {
    case 'anxiety':
      return 'When anxiety shows up, try box-breathing (inhale 4, hold 4, exhale 4, hold 4) for a minute.';
    case 'sadness':
      return 'When sadness feels heavy, gentle self-care (hydration, a short walk, or journaling) can help a bit.';
    case 'anger':
      return 'For anger, a brief pause and grounding (name 5 things you see, 4 you feel) may reduce intensity.';
    case 'stress':
      return 'Stress responds well to breaking tasks into small chunks and taking brief reset breaks.';
    case 'calm':
      return 'I also see calm signals — noticing what supports that calm can make it easier to return to later.';
    case 'joy':
      return 'There’s joy here — celebrating small wins can reinforce what’s working for you.';
    default:
      return '';
  }
}

function reflective(text: string): string {
  const picks = [
    'I hear how meaningful this is for you.',
    'That sounds like a lot to carry.',
    'It makes sense you’d feel this way.',
    'Thank you for being open about this.',
    'Noticing that feeling is a strong first step.'
  ];
  // lightly vary by negative/positive cues
  const a = analyzeSentiment(text);
  if (a.label === 'positive') return 'I hear some positives in what you said. What feels most supportive right now?';
  if (a.label === 'negative') return picks[1];
  return picks[2];
}

function nextStepSuggestion(a: Analysis): string {
  const top = Object.entries(a.emotions).sort((x,y) => y[1]-x[1])[0]?.[0];
  switch (top) {
    case 'anxiety': return 'Would you like to try a 1-minute breathing reset or list 1-2 worries you can reality-check?';
    case 'sadness': return 'Could a small act of care help — like a glass of water, a snack, or texting a friend?';
    case 'anger': return 'Would stepping away for 5 minutes or a quick physical reset help lower the heat?';
    case 'stress': return 'Want to split the next task into a 10-minute first step?';
    case 'joy': return 'What contributed to that joy that you might want to keep doing?';
    default: return 'What would feel like a gentle next step for you?';
  }
}

// Lightweight key theme extraction for display chips
export function inferThemes(text: string): string[] {
  const t = (text || '').toLowerCase();
  const themes: string[] = [];

  const add = (s: string) => { if (!themes.includes(s)) themes.push(s); };

  // Growth/learning/goals
  if (/(grow|growth|improv|learn|lesson|practice|goal|habit|reflect|reflection)/.test(t)) add('Personal Growth');
  // Relationships/social
  if (/(friend|family|parent|mom|dad|sibling|partner|relationship|classmate|teacher|bully|social)/.test(t)) add('Relationships');
  // School/work
  if (/(school|class|study|studying|homework|assignment|exam|test|grade|project|work|job)/.test(t)) add('Daily Life');
  // Health/wellbeing
  if (/(sleep|tired|exercise|workout|health|sick|doctor|meditation|mindful|breathe|breathing)/.test(t)) add('Wellbeing');
  // Stress/anxiety
  if (/(stress|stressed|overwhelm|anxiety|panic|worry|worried)/.test(t)) add('Stress');

  if (themes.length === 0) themes.push('Daily Life');
  return themes;
}
