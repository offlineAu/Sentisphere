export type ArticleContentBlock = {
  type: "heading" | "paragraph" | "list" | "source"
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
  articles: LearnArticle[]
}

export const learnTopics: Record<string, TopicData> = {
  "stress-management": {
    title: "Stress Management",
    subtitle: "Learn effective techniques to reduce and manage stress in your daily life.",
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
            text: "Adapted from Verywell Mind — “Understanding Your Body's Stress Response.”"
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
            text: "This content will be available soon. In the meantime, explore the Stress Response article to learn core concepts you can pair with breathing routines."
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
            text: "Detailed guidance for this practice is coming soon."
          }
        ]
      },
      {
        id: "a4",
        slug: "cognitive-reframing",
        title: "Cognitive Reframing",
        summary: "Techniques to reframe unhelpful thoughts that amplify stress.",
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
            text: "Detailed guidance for this practice is coming soon."
          }
        ]
      },
      {
        id: "a5",
        slug: "timeboxing-for-students",
        title: "Timeboxing for Students",
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
            text: "Detailed guidance for this practice is coming soon."
          }
        ]
      },
      {
        id: "a6",
        slug: "personal-stress-plan",
        title: "Building a Personal Stress Plan",
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
            text: "Detailed guidance for this practice is coming soon."
          }
        ]
      }
    ]
  },
  "mindfulness-meditation": {
    title: "Mindfulness & Meditation",
    subtitle: "Build attention and calm through small, repeatable practices.",
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
            text: "Detailed guidance for this practice is coming soon."
          }
        ]
      },
      {
        id: "m2",
        slug: "body-scan-basics",
        title: "Body Scan Basics",
        summary: "Gently notice sensations from head to toe.",
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
            text: "Detailed guidance for this practice is coming soon."
          }
        ]
      }
    ]
  },
  "sleep-rest": {
    title: "Sleep & Rest",
    subtitle: "Habits and science-backed tips for better sleep.",
    articles: [
      {
        id: "s1",
        slug: "sleep-foundations",
        title: "Sleep Foundations",
        summary: "Circadian rhythm, sleep pressure and why they matter.",
        level: "Beginner",
        mins: 7,
        tags: ["Sleep", "Science"],
        author: "Sentisphere Guides",
        source: "Sentisphere",
        sourceUrl: "",
        heroImageUrl: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
        content: [
          {
            type: "paragraph",
            text: "Detailed guidance for this practice is coming soon."
          }
        ]
      }
    ]
  },
  "academic-success": {
    title: "Academic Success",
    subtitle: "Tactics to learn better, manage time, and reduce study stress.",
    articles: [
      {
        id: "ac1",
        slug: "active-recall-101",
        title: "Active Recall 101",
        summary: "Study smarter with simple retrieval practice.",
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
            text: "Detailed guidance for this practice is coming soon."
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
