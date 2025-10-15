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
  ArrowLeft,
  Calendar,
  Target,
  Award,
  Sparkles,
  Sun,
  Moon,
  Activity,
  Users,
  User,
  Clock,
  CheckCircle,
  Star,
  Brain,
  Bookmark,
  RefreshCcw,
  Share2,
  Bell,
  Send,
  MapPin,
  Ticket,
  PartyPopper,
  Globe2,
  Smile,
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
    | 'arrow-left'
    | 'calendar'
    | 'target'
    | 'award'
    | 'sparkles'
    | 'sun'
    | 'moon'
    | 'activity'
    | 'users'
    | 'user'
    | 'clock'
    | 'check-circle'
    | 'star'
    | 'brain'
    | 'bookmark'
    | 'refresh-ccw'
    | 'share-2'
    | 'bell'
    | 'send'
    | 'bookmark'
    | 'map-pin'
    | 'ticket'
    | 'party-popper'
    | 'globe-2'
    | 'smile';
  size?: number;
  color?: string;
  fill?: string;
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
  'arrow-left': ArrowLeft,
  'calendar': Calendar,
  'target': Target,
  'award': Award,
  'sparkles': Sparkles,
  'sun': Sun,
  'moon': Moon,
  'activity': Activity,
  'users': Users,
  'user': User,
  'clock': Clock,
  'check-circle': CheckCircle,
  'star': Star,
  'brain': Brain,
  'bookmark': Bookmark,
  'refresh-ccw': RefreshCcw,
  'share-2': Share2,
  'bell': Bell,
  'send': Send,
  'map-pin': MapPin,
  'ticket': Ticket,
  'party-popper': PartyPopper,
  'globe-2': Globe2,
  'smile': Smile,
};

export function Icon({ name, size = 20, color, fill }: IconProps) {
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
    'arrow-left': 'arrow-left',
    calendar: 'calendar',
    target: 'target',
    award: 'award',
    sparkles: 'zap',
    sun: 'sun',
    moon: 'moon',
    activity: 'activity',
    users: 'users',
    user: 'user',
    clock: 'clock',
    'check-circle': 'check-circle',
    star: 'star',
    brain: 'cpu',
    bookmark: 'bookmark',
    'refresh-ccw': 'refresh-ccw',
    'share-2': 'share-2',
    bell: 'bell',
    send: 'send',
    'map-pin': 'map-pin',
    ticket: 'ticket',
    'party-popper': 'gift',
    'globe-2': 'globe',
    smile: 'smile',
  };
  const featherName = featherNameMap[name] ?? 'circle';
  return <Feather name={featherName} size={size} color={color} />;
}
