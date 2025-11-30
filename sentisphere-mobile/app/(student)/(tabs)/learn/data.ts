export type ArticleContentBlock = {
  type: "heading" | "paragraph" | "list" | "source" | "tip" | "quote"
  text: string
  items?: string[]
}

export type LearnArticle = {
  id: string
  slug: string
  title: string
  summary: string
  level: string
  mins: number
  tags: string[]
  author: string
  source: string
  sourceUrl: string
  heroImageUrl: string
  order?: number
  content: ArticleContentBlock[]
}

type TopicData = {
  title: string
  subtitle: string
  icon: string
  color: string
  articles: LearnArticle[]
}

export const learnTopics: Record<string, TopicData> = {
  "stress-management": {
    title: "Stress Management",
    subtitle: "Learn effective techniques to reduce and manage stress in your daily life.",
    icon: "wind",
    color: "#10B981",
    articles: [
      {
        id: "a1",
        slug: "understanding-stress-response",
        title: "Understanding Stress: Your Body's Response",
        summary: "Learn about the physiological and psychological aspects of the stress response.",
        level: "Beginner",
        mins: 8,
        tags: ["Life Improvement", "Knowledge"],
        author: "Elizabeth Scott, PhD",
        source: "Verywell Mind",
        sourceUrl: "https://www.verywellmind.com/what-is-a-stress-response-3145148",
        heroImageUrl: "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80",
        content: [
          {
            type: "paragraph",
            text: "The stress response describes the psychological and physiological changes that occur when you perceive a threat. It is sometimes called the fight-or-flight response because it prepares your body to take action even when a threat is only imagined."
          },
          {
            type: "heading",
            text: "What Happens During the Stress Response"
          },
          {
            type: "paragraph",
            text: "When a stressor is detected, the brain releases corticotropin-releasing hormone, prompting adrenocorticotropic hormone to signal the adrenal glands. Cortisol, adrenaline, and other messengers surge through the body, activating the sympathetic nervous system."
          },
          {
            type: "list",
            text: "Physical changes you may notice include:",
            items: [
              "A faster pulse and quickened breathing",
              "Blood flow shifting toward vital organs",
              "Muscle tension, trembling, or cold sweats",
              "Dilated pupils and changes in blood pressure"
            ]
          },
          {
            type: "paragraph",
            text: "These changes help you scan for danger and react quickly. You might recall feeling on edge or hyper-aware during a stressful moment—that sensation is the stress response at work."
          },
          {
            type: "heading",
            text: "Stages of the Stress Response"
          },
          {
            type: "paragraph",
            text: "Experts often describe three stages. The alarm stage is the rapid cascade that readies you for action. During the resistance stage, the body attempts to stabilize and return to baseline. If stressors persist without relief, the exhaustion stage can follow, leaving you drained and more vulnerable to burnout or illness."
          },
          {
            type: "heading",
            text: "What Triggers the Response"
          },
          {
            type: "paragraph",
            text: "Early humans needed this system to survive predators, but modern triggers are usually psychological. Deadlines, relationship conflict, discrimination, illness, financial strain, and constant worry can all activate the stress response when demands feel greater than your ability to cope."
          },
          {
            type: "heading",
            text: "Managing Your Stress Response"
          },
          {
            type: "paragraph",
            text: "Chronic activation makes it harder to think clearly and can wear down your health. Build a stress-relief toolbox with quick techniques—deep breathing, grounding exercises, or gentle movement—to help your body reset after a surge of stress hormones."
          },
          {
            type: "paragraph",
            text: "Long-term habits matter too. Regular activity, supportive relationships, reframing stressful thoughts, and practicing mindfulness can reduce how often the response is triggered and help you move through stress with greater resilience."
          },
          {
            type: "source",
            text: "Adapted from Verywell Mind - Understanding Your Body's Stress Response."
          }
        ]
      },
      {
        id: "a2",
        slug: "breathing-techniques-stress-relief",
        title: "5 Breathing Techniques for Immediate Stress Relief",
        summary: "Simple breathing exercises you can do anywhere to calm your nervous system.",
        level: "Beginner",
        mins: 6,
        tags: ["Breathing", "Practice"],
        author: "Sentisphere Guides",
        source: "Sentisphere",
        sourceUrl: "",
        heroImageUrl: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=1200&q=80",
        content: [
          {
            type: "paragraph",
            text: "When stress hits, your breath is one of the fastest ways to activate your body's relaxation response. These five techniques can be done anywhere—in class, before an exam, or in your dorm room."
          },
          {
            type: "heading",
            text: "1. Box Breathing (4-4-4-4)"
          },
          {
            type: "paragraph",
            text: "Used by Navy SEALs to stay calm under pressure. Inhale for 4 counts, hold for 4 counts, exhale for 4 counts, hold empty for 4 counts. Repeat 4 times."
          },
          {
            type: "tip",
            text: "Visualize tracing a square as you breathe—each side represents one phase of the breath."
          },
          {
            type: "heading",
            text: "2. 4-7-8 Breathing"
          },
          {
            type: "paragraph",
            text: "Dr. Andrew Weil's technique for reducing anxiety. Inhale through your nose for 4 counts, hold for 7 counts, exhale slowly through your mouth for 8 counts."
          },
          {
            type: "heading",
            text: "3. Physiological Sigh"
          },
          {
            type: "paragraph",
            text: "The fastest way to calm down, backed by Stanford research. Take a deep breath in, then add a second shorter inhale to fully expand your lungs, followed by a long slow exhale. Just 1-3 sighs can reduce stress significantly."
          },
          {
            type: "heading",
            text: "4. Belly Breathing"
          },
          {
            type: "paragraph",
            text: "Place one hand on your chest and one on your belly. Breathe so only your belly hand rises. This engages your diaphragm and activates the parasympathetic nervous system."
          },
          {
            type: "heading",
            text: "5. Coherent Breathing"
          },
          {
            type: "paragraph",
            text: "Simply breathe at a rate of 5 breaths per minute—inhale for 6 seconds, exhale for 6 seconds. This rhythm synchronizes your heart rate variability and promotes calm."
          },
          {
            type: "tip",
            text: "Practice these techniques when you're NOT stressed so they become automatic when you need them most."
          }
        ]
      },
      {
        id: "a3",
        slug: "progressive-muscle-relaxation",
        title: "Progressive Muscle Relaxation",
        summary: "Step-by-step guide to release tension held in the body.",
        level: "Beginner",
        mins: 7,
        tags: ["Body", "Practice"],
        author: "Sentisphere Guides",
        source: "Sentisphere",
        sourceUrl: "",
        heroImageUrl: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80",
        content: [
          {
            type: "paragraph",
            text: "Progressive Muscle Relaxation (PMR) is a technique developed by Dr. Edmund Jacobson in the 1920s. It involves systematically tensing and releasing muscle groups to reduce physical tension and mental anxiety."
          },
          {
            type: "heading",
            text: "How It Works"
          },
          {
            type: "paragraph",
            text: "By deliberately creating tension in your muscles and then releasing it, you become more aware of what tension feels like—and learn to let it go. This is especially helpful if you carry stress in your shoulders, jaw, or back."
          },
          {
            type: "heading",
            text: "The Practice"
          },
          {
            type: "list",
            text: "Follow this sequence, holding tension for 5 seconds, then releasing for 30 seconds:",
            items: [
              "Feet: Curl your toes tightly, then release",
              "Calves: Point your toes toward your shins, then release",
              "Thighs: Squeeze your thigh muscles, then release",
              "Glutes: Clench your buttocks, then release",
              "Abdomen: Tighten your stomach muscles, then release",
              "Hands: Make tight fists, then release",
              "Arms: Bend your elbows and tense your biceps, then release",
              "Shoulders: Shrug up toward your ears, then release",
              "Face: Scrunch your face tightly, then release"
            ]
          },
          {
            type: "tip",
            text: "Do this lying down before bed to improve sleep quality. Even a shortened version focusing on your shoulders and jaw can help during study breaks."
          }
        ]
      },
      {
        id: "a4",
        slug: "cognitive-reframing",
        title: "Cognitive Reframing for Students",
        summary: "Change how you think about stressful situations to reduce their impact.",
        level: "Intermediate",
        mins: 9,
        tags: ["Mindset", "Skills"],
        author: "Sentisphere Guides",
        source: "Sentisphere",
        sourceUrl: "",
        heroImageUrl: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80",
        content: [
          {
            type: "paragraph",
            text: "Cognitive reframing is a psychological technique that helps you identify and change the way you think about stressful situations. It's not about positive thinking—it's about accurate, helpful thinking."
          },
          {
            type: "heading",
            text: "Common Thinking Traps"
          },
          {
            type: "list",
            text: "Students often fall into these patterns:",
            items: [
              "Catastrophizing: 'If I fail this exam, my life is over'",
              "All-or-nothing: 'I got a B, so I'm a failure'",
              "Mind reading: 'Everyone thinks I'm stupid'",
              "Fortune telling: 'I know I'm going to bomb this presentation'",
              "Should statements: 'I should be able to handle this without stress'"
            ]
          },
          {
            type: "heading",
            text: "The Reframing Process"
          },
          {
            type: "list",
            text: "When you notice stress, try this:",
            items: [
              "Identify the thought: What exactly am I telling myself?",
              "Examine the evidence: Is this thought 100% true?",
              "Consider alternatives: What's another way to see this?",
              "Ask: What would I tell a friend thinking this?",
              "Create a balanced thought: More accurate, less extreme"
            ]
          },
          {
            type: "quote",
            text: "Instead of 'I have to give a presentation' try 'I get to share what I've learned.' The situation is the same—your experience of it changes."
          },
          {
            type: "tip",
            text: "Keep a thought journal for a week. Write down stressful thoughts and practice reframing them. Over time, this becomes automatic."
          }
        ]
      },
      {
        id: "a5",
        slug: "timeboxing-for-students",
        title: "Timeboxing: Beat Overwhelm",
        summary: "Reduce overwhelm and procrastination with a simple time plan.",
        level: "Intermediate",
        mins: 10,
        tags: ["Productivity", "Planning"],
        author: "Sentisphere Guides",
        source: "Sentisphere",
        sourceUrl: "",
        heroImageUrl: "https://images.unsplash.com/photo-1523475472560-d2df97ec485c?auto=format&fit=crop&w=1200&q=80",
        content: [
          {
            type: "paragraph",
            text: "Timeboxing is a time management technique where you allocate a fixed time period to a task in advance. Unlike to-do lists, which focus on completing tasks, timeboxing focuses on spending time intentionally."
          },
          {
            type: "heading",
            text: "Why It Works for Students"
          },
          {
            type: "list",
            text: "Timeboxing helps because:",
            items: [
              "Parkinson's Law: Work expands to fill the time available. Timeboxes create healthy constraints.",
              "Reduces perfectionism: You work with the time you have, not until it's 'perfect'",
              "Prevents burnout: Built-in breaks keep you fresh",
              "Creates momentum: Small completed boxes feel rewarding"
            ]
          },
          {
            type: "heading",
            text: "How to Timebox Your Day"
          },
          {
            type: "list",
            text: "Follow these steps:",
            items: [
              "List your tasks for the day",
              "Estimate how long each will take",
              "Schedule specific time blocks in your calendar",
              "Include buffer time between boxes",
              "When the timer ends, stop—even if not finished",
              "Review what you accomplished"
            ]
          },
          {
            type: "tip",
            text: "Start with 25-minute boxes (Pomodoro technique) and adjust. Some tasks need 90-minute deep work blocks."
          }
        ]
      },
      {
        id: "a6",
        slug: "personal-stress-plan",
        title: "Building Your Personal Stress Plan",
        summary: "Create a sustainable routine with stress buffers that fit your life.",
        level: "Advanced",
        mins: 12,
        tags: ["Strategy", "Planning"],
        author: "Sentisphere Guides",
        source: "Sentisphere",
        sourceUrl: "",
        heroImageUrl: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80",
        content: [
          {
            type: "paragraph",
            text: "A personal stress plan is your customized toolkit for managing stress before, during, and after it occurs. The best plan is one you'll actually use—built around your life, preferences, and warning signs."
          },
          {
            type: "heading",
            text: "Know Your Warning Signs"
          },
          {
            type: "paragraph",
            text: "Everyone experiences stress differently. Identify your early warning signs—maybe it's irritability, trouble sleeping, headaches, or withdrawing from friends. Catching stress early makes it easier to manage."
          },
          {
            type: "heading",
            text: "Build Your Toolkit"
          },
          {
            type: "list",
            text: "Include strategies for different scenarios:",
            items: [
              "Quick fixes (under 2 min): Deep breaths, cold water on wrists, stepping outside",
              "Short breaks (5-15 min): Walking, stretching, music, calling a friend",
              "Recovery activities (30+ min): Exercise, hobbies, nature time",
              "Daily habits: Sleep routine, movement, social connection",
              "Weekly practices: Planning sessions, longer self-care activities"
            ]
          },
          {
            type: "heading",
            text: "Create Stress Buffers"
          },
          {
            type: "paragraph",
            text: "Don't wait for stress to hit. Build buffers into your schedule—transition time between classes, a morning routine that doesn't feel rushed, one evening per week with no obligations."
          },
          {
            type: "tip",
            text: "Write your plan down and share it with a friend or counselor. They can remind you to use it when you're too stressed to remember."
          }
        ]
      }
    ]
  },
  "anxiety-coping": {
    title: "Anxiety & Coping",
    subtitle: "Understand anxiety and learn practical coping strategies.",
    icon: "heart",
    color: "#8B5CF6",
    articles: [
      {
        id: "anx1",
        slug: "understanding-anxiety",
        title: "Understanding Anxiety: More Than Just Worry",
        summary: "Learn what anxiety is, why it happens, and when to seek help.",
        level: "Beginner",
        mins: 8,
        tags: ["Mental Health", "Awareness"],
        author: "Sentisphere Guides",
        source: "Sentisphere",
        sourceUrl: "",
        heroImageUrl: "https://images.unsplash.com/photo-1541199249251-f713e6145474?auto=format&fit=crop&w=1200&q=80",
        content: [
          {
            type: "paragraph",
            text: "Anxiety is one of the most common mental health challenges among college students, affecting approximately 41% of students. Understanding anxiety is the first step toward managing it effectively."
          },
          {
            type: "heading",
            text: "What Is Anxiety?"
          },
          {
            type: "paragraph",
            text: "Anxiety is your body's natural response to perceived threats. It's designed to protect you—but sometimes the alarm system becomes too sensitive, triggering when there's no real danger."
          },
          {
            type: "heading",
            text: "Common Symptoms"
          },
          {
            type: "list",
            text: "Anxiety can manifest physically and mentally:",
            items: [
              "Racing heart, sweating, trembling",
              "Difficulty concentrating or mind going blank",
              "Constant worry about things going wrong",
              "Avoiding situations that trigger anxiety",
              "Trouble sleeping or restlessness",
              "Irritability or feeling on edge"
            ]
          },
          {
            type: "heading",
            text: "Why Students Are Vulnerable"
          },
          {
            type: "paragraph",
            text: "College brings unique pressures: academic expectations, social comparisons, financial stress, uncertainty about the future, and often being away from support systems for the first time. Social media can amplify these pressures."
          },
          {
            type: "heading",
            text: "When to Seek Help"
          },
          {
            type: "paragraph",
            text: "If anxiety interferes with your daily life—affecting your grades, relationships, or ability to enjoy things—it's time to talk to a counselor. Anxiety disorders are highly treatable, and getting help is a sign of strength."
          },
          {
            type: "tip",
            text: "Most colleges offer free counseling services. Don't wait until you're in crisis—reaching out early leads to better outcomes."
          }
        ]
      },
      {
        id: "anx2",
        slug: "grounding-techniques",
        title: "5-4-3-2-1 Grounding Technique",
        summary: "A simple sensory exercise to calm anxiety in the moment.",
        level: "Beginner",
        mins: 5,
        tags: ["Practice", "Quick Relief"],
        author: "Sentisphere Guides",
        source: "Sentisphere",
        sourceUrl: "",
        heroImageUrl: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1200&q=80",
        content: [
          {
            type: "paragraph",
            text: "When anxiety pulls you into worried thoughts about the future or regrets about the past, grounding brings you back to the present moment. The 5-4-3-2-1 technique uses your senses to anchor you to the here and now."
          },
          {
            type: "heading",
            text: "How It Works"
          },
          {
            type: "paragraph",
            text: "Slowly work through your senses, taking time to really notice each thing:"
          },
          {
            type: "list",
            text: "",
            items: [
              "5 things you can SEE: Look around and name five things. Notice colors, shapes, textures.",
              "4 things you can TOUCH: Feel your feet on the floor, the chair beneath you, the texture of your clothes.",
              "3 things you can HEAR: Listen for sounds near and far—traffic, birds, the hum of a computer.",
              "2 things you can SMELL: Notice any scents in the air, or bring something to smell like coffee or hand lotion.",
              "1 thing you can TASTE: Notice any taste in your mouth, or take a sip of water mindfully."
            ]
          },
          {
            type: "tip",
            text: "You can do this anywhere—in an exam, during a difficult conversation, or lying in bed at night. No one will know you're doing it."
          },
          {
            type: "heading",
            text: "Why It Works"
          },
          {
            type: "paragraph",
            text: "Focusing on sensory details requires mental effort, which interrupts the spiral of anxious thoughts. It also activates your parasympathetic nervous system, helping your body shift from 'fight or flight' to 'rest and digest.'"
          }
        ]
      },
      {
        id: "anx3",
        slug: "social-anxiety-tips",
        title: "Navigating Social Anxiety in College",
        summary: "Practical strategies for managing social situations and building connections.",
        level: "Intermediate",
        mins: 10,
        tags: ["Social", "Relationships"],
        author: "Sentisphere Guides",
        source: "Sentisphere",
        sourceUrl: "",
        heroImageUrl: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80",
        content: [
          {
            type: "paragraph",
            text: "Social anxiety is more than shyness—it's an intense fear of being judged, embarrassed, or rejected in social situations. In college, where social interaction is constant, this can feel overwhelming."
          },
          {
            type: "heading",
            text: "Common Triggers for Students"
          },
          {
            type: "list",
            text: "",
            items: [
              "Speaking up in class or presentations",
              "Meeting new people at orientation or parties",
              "Group projects and team meetings",
              "Eating alone in the dining hall",
              "Office hours with professors",
              "Starting conversations with classmates"
            ]
          },
          {
            type: "heading",
            text: "Practical Strategies"
          },
          {
            type: "list",
            text: "Try these approaches:",
            items: [
              "Start small: Begin with low-stakes interactions (asking someone the time) and build up",
              "Prepare conversation starters: Have a few questions ready (What's your major? How did you find this class?)",
              "Focus outward: Instead of monitoring yourself, get curious about the other person",
              "Challenge predictions: After social situations, check if your fears actually came true",
              "Find your people: Look for clubs or groups aligned with your interests where connection happens naturally"
            ]
          },
          {
            type: "quote",
            text: "Remember: Other people are much more focused on themselves than on judging you. Most people are too worried about their own impression to scrutinize yours."
          },
          {
            type: "tip",
            text: "Exposure is key—avoiding social situations maintains anxiety. Each small interaction is practice that builds confidence over time."
          }
        ]
      },
      {
        id: "anx4",
        slug: "test-anxiety",
        title: "Conquering Test Anxiety",
        summary: "Strategies to manage anxiety before, during, and after exams.",
        level: "Intermediate",
        mins: 9,
        tags: ["Academic", "Performance"],
        author: "Sentisphere Guides",
        source: "Sentisphere",
        sourceUrl: "",
        heroImageUrl: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1200&q=80",
        content: [
          {
            type: "paragraph",
            text: "Test anxiety affects up to 40% of students and can significantly impact performance—even when you know the material. The good news: it's highly manageable with the right strategies."
          },
          {
            type: "heading",
            text: "Before the Exam"
          },
          {
            type: "list",
            text: "",
            items: [
              "Prepare early: Cramming increases anxiety. Spaced practice over days reduces it.",
              "Simulate test conditions: Practice with timed tests to reduce novelty anxiety",
              "Sleep is non-negotiable: Your brain consolidates learning during sleep",
              "Exercise: Even a 20-minute walk reduces anxiety and improves focus",
              "Avoid anxious peers: Their worry is contagious. Find calm study partners."
            ]
          },
          {
            type: "heading",
            text: "During the Exam"
          },
          {
            type: "list",
            text: "",
            items: [
              "Start with easy questions: Build confidence before tackling harder ones",
              "If you blank, skip and return: Your brain will often retrieve the answer later",
              "Use calming breaths: A few slow exhales activate your parasympathetic system",
              "Reframe anxiety: Tell yourself 'This feeling means I care' instead of 'I'm going to fail'"
            ]
          },
          {
            type: "heading",
            text: "After the Exam"
          },
          {
            type: "paragraph",
            text: "Avoid post-mortems with classmates—they increase rumination. Instead, do something pleasant to transition your mind. Learn from the experience once grades are released, then let it go."
          },
          {
            type: "tip",
            text: "If test anxiety is severe, talk to your school's disability services. You may qualify for accommodations like extended time."
          }
        ]
      }
    ]
  },
  "mindfulness-meditation": {
    title: "Mindfulness & Meditation",
    subtitle: "Build attention and calm through small, repeatable practices.",
    icon: "sun",
    color: "#F59E0B",
    articles: [
      {
        id: "m1",
        slug: "one-minute-mindfulness",
        title: "One-Minute Mindfulness",
        summary: "A tiny practice to reset during the day.",
        level: "Beginner",
        mins: 6,
        tags: ["Mindfulness", "Practice"],
        author: "Sentisphere Guides",
        source: "Sentisphere",
        sourceUrl: "",
        heroImageUrl: "https://images.unsplash.com/photo-1517479149777-5f3b1511bd7c?auto=format&fit=crop&w=1200&q=80",
        content: [
          {
            type: "paragraph",
            text: "You don't need 20 minutes or a quiet room to practice mindfulness. One minute is enough to shift your state—and you can do it anywhere, anytime."
          },
          {
            type: "heading",
            text: "The Practice"
          },
          {
            type: "list",
            text: "Try this one-minute reset:",
            items: [
              "Pause whatever you're doing",
              "Take 3 slow, deep breaths",
              "Notice 3 things you can see right now",
              "Feel your feet on the ground",
              "Notice how your body feels in this moment",
              "Return to your activity with fresh attention"
            ]
          },
          {
            type: "heading",
            text: "When to Use It"
          },
          {
            type: "list",
            text: "Perfect moments for one-minute mindfulness:",
            items: [
              "Before starting a study session",
              "Between classes during your walk",
              "When you notice stress rising",
              "Before responding to a difficult message",
              "When you wake up, before checking your phone",
              "Right before sleep"
            ]
          },
          {
            type: "tip",
            text: "Set a few random alarms throughout the day as mindfulness reminders. Even brief moments of presence add up."
          }
        ]
      },
      {
        id: "m2",
        slug: "body-scan-basics",
        title: "Body Scan Meditation",
        summary: "Gently notice sensations from head to toe to release tension.",
        level: "Beginner",
        mins: 8,
        tags: ["Body", "Awareness"],
        author: "Sentisphere Guides",
        source: "Sentisphere",
        sourceUrl: "",
        heroImageUrl: "https://images.unsplash.com/photo-1517832606294-5a6b290a7d47?auto=format&fit=crop&w=1200&q=80",
        content: [
          {
            type: "paragraph",
            text: "A body scan is a meditation practice where you systematically move your attention through different parts of your body. It builds body awareness and helps release tension you may not know you're holding."
          },
          {
            type: "heading",
            text: "How to Practice"
          },
          {
            type: "list",
            text: "",
            items: [
              "Lie down comfortably or sit in a relaxed position",
              "Close your eyes and take a few deep breaths",
              "Bring attention to the top of your head",
              "Slowly move down: forehead, eyes, jaw, neck, shoulders...",
              "Notice sensations without trying to change them",
              "Continue down through arms, chest, belly, hips, legs, feet",
              "End by feeling your whole body at once"
            ]
          },
          {
            type: "heading",
            text: "What You Might Notice"
          },
          {
            type: "paragraph",
            text: "You may find tension in unexpected places—a clenched jaw, tight shoulders, held breath. Simply noticing these areas often leads to natural relaxation. Don't judge what you find; just observe."
          },
          {
            type: "tip",
            text: "Body scans are especially helpful before bed. They transition your mind from 'doing mode' to 'being mode,' promoting deeper sleep."
          }
        ]
      },
      {
        id: "m3",
        slug: "mindful-walking",
        title: "Mindful Walking Between Classes",
        summary: "Transform your commute into a meditation practice.",
        level: "Beginner",
        mins: 5,
        tags: ["Movement", "Daily Life"],
        author: "Sentisphere Guides",
        source: "Sentisphere",
        sourceUrl: "",
        heroImageUrl: "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1200&q=80",
        content: [
          {
            type: "paragraph",
            text: "You probably walk between classes multiple times a day. Instead of scrolling your phone or ruminating, you can use this time to practice mindfulness and arrive at your destination refreshed."
          },
          {
            type: "heading",
            text: "How to Walk Mindfully"
          },
          {
            type: "list",
            text: "",
            items: [
              "Put your phone away (or leave it in your bag)",
              "Feel your feet making contact with the ground",
              "Notice the sensation of walking—the weight shifting, muscles engaging",
              "Observe your surroundings—trees, buildings, sky, other people",
              "When your mind wanders (it will), gently return to the sensations of walking"
            ]
          },
          {
            type: "heading",
            text: "Benefits"
          },
          {
            type: "paragraph",
            text: "Mindful walking reduces stress, improves focus for your next class, and gives your eyes a break from screens. It also helps you feel more connected to your campus environment."
          },
          {
            type: "tip",
            text: "Try mindful walking in nature when you can—parks, paths with trees, or near water. Nature amplifies the stress-reducing benefits."
          }
        ]
      }
    ]
  },
  "sleep-rest": {
    title: "Sleep & Rest",
    subtitle: "Habits and science-backed tips for better sleep.",
    icon: "moon",
    color: "#6366F1",
    articles: [
      {
        id: "s1",
        slug: "sleep-foundations",
        title: "Sleep Foundations for Students",
        summary: "Understand the science of sleep and why it matters for your brain.",
        level: "Beginner",
        mins: 8,
        tags: ["Sleep", "Science"],
        author: "Sentisphere Guides",
        source: "Sentisphere",
        sourceUrl: "",
        heroImageUrl: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
        content: [
          {
            type: "paragraph",
            text: "Sleep isn't just rest—it's when your brain consolidates memories, processes emotions, and clears toxins. Yet most college students are chronically sleep-deprived, which affects everything from grades to mental health."
          },
          {
            type: "heading",
            text: "The Two-Process Model"
          },
          {
            type: "paragraph",
            text: "Sleep is regulated by two systems: your circadian rhythm (your internal 24-hour clock) and sleep pressure (the drive to sleep that builds the longer you're awake). Optimal sleep happens when these align."
          },
          {
            type: "heading",
            text: "Sleep Cycles"
          },
          {
            type: "paragraph",
            text: "Each night, you cycle through light sleep, deep sleep, and REM sleep about 4-6 times. Deep sleep repairs your body; REM sleep consolidates learning and processes emotions. Cutting sleep short robs you of later REM cycles."
          },
          {
            type: "heading",
            text: "Why Students Struggle"
          },
          {
            type: "list",
            text: "",
            items: [
              "Natural circadian shift: Teens and young adults biologically tend toward later sleep times",
              "Early classes: 8 AM classes fight your natural rhythm",
              "Screen exposure: Blue light suppresses melatonin",
              "Stress and anxiety: Racing thoughts keep you awake",
              "Irregular schedules: Weekend sleep-ins disrupt your rhythm"
            ]
          },
          {
            type: "tip",
            text: "Consistency is key: Going to bed and waking at the same time (even weekends) is the single most important sleep habit."
          }
        ]
      },
      {
        id: "s2",
        slug: "sleep-hygiene",
        title: "Sleep Hygiene: A Student's Guide",
        summary: "Practical habits to improve your sleep quality.",
        level: "Beginner",
        mins: 7,
        tags: ["Habits", "Practice"],
        author: "Sentisphere Guides",
        source: "Sentisphere",
        sourceUrl: "",
        heroImageUrl: "https://images.unsplash.com/photo-1507652313519-d4e9174996dd?auto=format&fit=crop&w=1200&q=80",
        content: [
          {
            type: "paragraph",
            text: "Sleep hygiene refers to habits and environment factors that promote good sleep. While it won't cure sleep disorders, good sleep hygiene helps most people sleep better."
          },
          {
            type: "heading",
            text: "Environment"
          },
          {
            type: "list",
            text: "",
            items: [
              "Dark: Use blackout curtains or a sleep mask",
              "Cool: 65-68°F (18-20°C) is optimal",
              "Quiet: Use earplugs or white noise",
              "Bed is for sleep: Train your brain by only sleeping in bed"
            ]
          },
          {
            type: "heading",
            text: "Before Bed"
          },
          {
            type: "list",
            text: "",
            items: [
              "No screens 30-60 minutes before sleep (or use night mode)",
              "No caffeine after 2 PM",
              "Avoid alcohol—it disrupts sleep quality",
              "Create a wind-down routine: reading, stretching, journaling",
              "Write tomorrow's to-do list to clear your mind"
            ]
          },
          {
            type: "heading",
            text: "If You Can't Sleep"
          },
          {
            type: "paragraph",
            text: "If you're lying awake for more than 20 minutes, get up and do something calm in low light. Return to bed when drowsy. This prevents your brain from associating bed with wakefulness."
          },
          {
            type: "tip",
            text: "All-nighters don't work: Sleep-deprived performance on an exam is worse than going in well-rested with slightly less studying."
          }
        ]
      }
    ]
  },
  "academic-success": {
    title: "Academic Success",
    subtitle: "Tactics to learn better, manage time, and reduce study stress.",
    icon: "book-open",
    color: "#EC4899",
    articles: [
      {
        id: "ac1",
        slug: "active-recall-101",
        title: "Active Recall: Study Smarter",
        summary: "The most effective learning technique most students don't use.",
        level: "Beginner",
        mins: 9,
        tags: ["Study", "Skills"],
        author: "Sentisphere Guides",
        source: "Sentisphere",
        sourceUrl: "",
        heroImageUrl: "https://images.unsplash.com/photo-1498079022511-d15614cb1c02?auto=format&fit=crop&w=1200&q=80",
        content: [
          {
            type: "paragraph",
            text: "Active recall is the practice of actively trying to remember information without looking at it. It's one of the most researched and effective learning techniques—yet most students rely on passive methods like re-reading."
          },
          {
            type: "heading",
            text: "Why It Works"
          },
          {
            type: "paragraph",
            text: "Every time you retrieve information from memory, you strengthen the neural pathway to that information. Struggling to remember something—even if you fail—strengthens learning more than passively reviewing it."
          },
          {
            type: "heading",
            text: "How to Practice"
          },
          {
            type: "list",
            text: "",
            items: [
              "Flashcards: Cover the answer and try to recall it",
              "Practice problems: Solve without looking at examples first",
              "Teach it: Explain concepts aloud as if teaching someone else",
              "Brain dumps: Write everything you know about a topic from memory",
              "Self-testing: Create and take your own quizzes"
            ]
          },
          {
            type: "heading",
            text: "The Discomfort Paradox"
          },
          {
            type: "paragraph",
            text: "Active recall feels harder than re-reading—that's exactly why it works. The mental effort of retrieval is what creates durable learning. If studying feels too easy, you're probably not learning much."
          },
          {
            type: "tip",
            text: "Combine with spaced repetition: Review material at increasing intervals (1 day, 3 days, 1 week, etc.) for maximum retention."
          }
        ]
      },
      {
        id: "ac2",
        slug: "beating-procrastination",
        title: "Beating Procrastination",
        summary: "Understand why you procrastinate and practical strategies to start.",
        level: "Intermediate",
        mins: 10,
        tags: ["Productivity", "Mindset"],
        author: "Sentisphere Guides",
        source: "Sentisphere",
        sourceUrl: "",
        heroImageUrl: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1200&q=80",
        content: [
          {
            type: "paragraph",
            text: "Procrastination isn't about laziness—it's about emotion regulation. We procrastinate to avoid negative emotions associated with a task: boredom, anxiety, frustration, or self-doubt."
          },
          {
            type: "heading",
            text: "Understanding Your Triggers"
          },
          {
            type: "list",
            text: "We often procrastinate on tasks that feel:",
            items: [
              "Boring: Not engaging or interesting",
              "Frustrating: Confusing or difficult",
              "Anxiety-inducing: High stakes or fear of failure",
              "Ambiguous: Unclear how to start",
              "Unstructured: No clear deadline or steps",
              "Meaningless: No connection to your goals"
            ]
          },
          {
            type: "heading",
            text: "Strategies That Work"
          },
          {
            type: "list",
            text: "",
            items: [
              "2-Minute Start: Commit to just 2 minutes. Starting is the hardest part.",
              "Temptation bundling: Pair unpleasant tasks with enjoyable ones (study at your favorite café)",
              "Implementation intentions: Decide exactly when, where, and how you'll start",
              "Remove friction: Prepare your environment so starting is easy",
              "Self-compassion: Being hard on yourself increases procrastination, not motivation"
            ]
          },
          {
            type: "quote",
            text: "You don't have to feel like doing something to do it. Action often precedes motivation, not the other way around."
          },
          {
            type: "tip",
            text: "Track your procrastination patterns for a week. Knowing your triggers helps you create targeted solutions."
          }
        ]
      }
    ]
  },
  "emotional-wellness": {
    title: "Emotional Wellness",
    subtitle: "Develop emotional intelligence and resilience.",
    icon: "smile",
    color: "#14B8A6",
    articles: [
      {
        id: "ew1",
        slug: "understanding-emotions",
        title: "Understanding Your Emotions",
        summary: "Learn to identify, understand, and work with your emotions.",
        level: "Beginner",
        mins: 8,
        tags: ["Emotions", "Awareness"],
        author: "Sentisphere Guides",
        source: "Sentisphere",
        sourceUrl: "",
        heroImageUrl: "https://images.unsplash.com/photo-1499209974431-9dddcece7f88?auto=format&fit=crop&w=1200&q=80",
        content: [
          {
            type: "paragraph",
            text: "Emotions are information—they tell us something about our needs, values, and how we're relating to our environment. Learning to understand emotions is a key life skill."
          },
          {
            type: "heading",
            text: "The Purpose of Emotions"
          },
          {
            type: "list",
            text: "Every emotion has a purpose:",
            items: [
              "Fear: Alerts you to danger and prepares you to respond",
              "Anger: Signals that a boundary has been crossed",
              "Sadness: Helps you process loss and invites support",
              "Joy: Reinforces beneficial behaviors and builds connection",
              "Anxiety: Prepares you for future challenges",
              "Guilt: Motivates you to repair relationships"
            ]
          },
          {
            type: "heading",
            text: "Emotional Granularity"
          },
          {
            type: "paragraph",
            text: "Research shows that people who can precisely name their emotions—'frustrated' rather than just 'bad'—regulate them better. Expand your emotional vocabulary beyond 'good' and 'bad.'"
          },
          {
            type: "heading",
            text: "Working With Emotions"
          },
          {
            type: "list",
            text: "",
            items: [
              "Notice: Pay attention to what you're feeling",
              "Name: Put a specific word to the emotion",
              "Validate: All emotions are valid information",
              "Investigate: What triggered this? What does it need?",
              "Respond: Choose how to act (not react)"
            ]
          },
          {
            type: "tip",
            text: "Keep an emotion journal for a week. Notice patterns in when certain emotions arise and what triggers them."
          }
        ]
      },
      {
        id: "ew2",
        slug: "building-resilience",
        title: "Building Resilience",
        summary: "Develop the ability to bounce back from setbacks.",
        level: "Intermediate",
        mins: 9,
        tags: ["Resilience", "Growth"],
        author: "Sentisphere Guides",
        source: "Sentisphere",
        sourceUrl: "",
        heroImageUrl: "https://images.unsplash.com/photo-1519834785169-98be25ec3f84?auto=format&fit=crop&w=1200&q=80",
        content: [
          {
            type: "paragraph",
            text: "Resilience isn't about never struggling—it's about recovering from difficulty and growing through challenges. Good news: resilience is a skill you can develop."
          },
          {
            type: "heading",
            text: "The Pillars of Resilience"
          },
          {
            type: "list",
            text: "",
            items: [
              "Connection: Supportive relationships buffer against stress",
              "Wellness: Physical health (sleep, exercise, nutrition) builds mental strength",
              "Purpose: Having meaning and goals gives you something to move toward",
              "Healthy thinking: Flexible, realistic thinking helps you adapt",
              "Self-compassion: Treating yourself kindly during hard times"
            ]
          },
          {
            type: "heading",
            text: "Reframing Setbacks"
          },
          {
            type: "paragraph",
            text: "Resilient people view setbacks as temporary, specific, and something they can influence. A failed exam becomes 'I didn't prepare effectively for this test' rather than 'I'm a failure.'"
          },
          {
            type: "heading",
            text: "Building Your Resilience"
          },
          {
            type: "list",
            text: "",
            items: [
              "Nurture relationships: Connect with friends, family, mentors",
              "Take care of basics: Sleep, movement, nutrition",
              "Practice gratitude: Notice what's going well",
              "Embrace challenges: See them as opportunities to grow",
              "Seek help: Asking for support is a sign of strength"
            ]
          },
          {
            type: "quote",
            text: "The oak fought the wind and was broken, the willow bent when it must and survived. —Robert Jordan"
          }
        ]
      }
    ]
  }
}

type ArticleWithTopic = {
  article: LearnArticle
  topic: TopicData
  topicId: string
}

const articleMap: ArticleWithTopic[] = Object.entries(learnTopics).flatMap(([topicId, topic]) =>
  topic.articles.map((article) => ({ article, topic, topicId }))
)

export const getArticleById = (articleId: string) => articleMap.find(({ article }) => article.id === articleId) ?? null

export const getArticleNeighbors = (articleId: string) => {
  const index = articleMap.findIndex(({ article }) => article.id === articleId)
  if (index === -1) return { prev: null as ArticleWithTopic | null, next: null as ArticleWithTopic | null }
  const prev = index > 0 ? articleMap[index - 1] : null
  const next = index < articleMap.length - 1 ? articleMap[index + 1] : null
  return { prev, next }
}
