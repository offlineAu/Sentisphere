import React from 'react';
import { Feather } from '@expo/vector-icons';
import {
  Home,
  Heart,
  BookOpen,
  MessageSquare,
  MessageCircle,
  GraduationCap,
  Book,
  Plus,
  ArrowRight,
  Calendar,
  Target,
  Award,
  Sparkles,
  Sun,
  Moon,
  Activity,
  Users,
  Clock,
  CheckCircle,
  Star,
  Brain,
} from 'lucide-react-native';

type IconProps = {
  name:
    | 'home'
    | 'heart'
    | 'book-open'
    | 'message-square'
    | 'message-circle'
    | 'graduation-cap'
    | 'book'
    | 'plus'
    | 'arrow-right'
    | 'calendar'
    | 'target'
    | 'award'
    | 'sparkles'
    | 'sun'
    | 'moon'
    | 'activity'
    | 'users'
    | 'clock'
    | 'check-circle'
    | 'star'
    | 'brain';
  size?: number;
  color?: string;
};

// Static icon map (case-sensitive string keys) -> Lucide component
const icons: Record<string, any> = {
  'home': Home,
  'heart': Heart,
  'book-open': BookOpen,
  'message-square': MessageSquare,
  'message-circle': MessageCircle,
  'graduation-cap': GraduationCap,
  'book': Book,
  'plus': Plus,
  'arrow-right': ArrowRight,
  'calendar': Calendar,
  'target': Target,
  'award': Award,
  'sparkles': Sparkles,
  'sun': Sun,
  'moon': Moon,
  'activity': Activity,
  'users': Users,
  'clock': Clock,
  'check-circle': CheckCircle,
  'star': Star,
  'brain': Brain,
};

export function Icon({ name, size = 20, color }: IconProps) {
  const Cmp = icons[name];
  if (Cmp) return <Cmp size={size} color={color as string} />;
  // Feather fallback
  const featherNameMap: Record<string, any> = {
    home: 'home',
    heart: 'heart',
    'book-open': 'book-open',
    'message-square': 'message-square',
    'message-circle': 'message-circle',
    'graduation-cap': 'book',
    book: 'book',
    plus: 'plus',
    'arrow-right': 'arrow-right',
    calendar: 'calendar',
    target: 'target',
    award: 'award',
    sparkles: 'zap',
    sun: 'sun',
    moon: 'moon',
    activity: 'activity',
    users: 'users',
    clock: 'clock',
    'check-circle': 'check-circle',
    star: 'star',
    brain: 'cpu',
  };
  const featherName = featherNameMap[name] ?? 'circle';
  return <Feather name={featherName} size={size} color={color} />;
}
