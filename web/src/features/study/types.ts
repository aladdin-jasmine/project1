export interface Slide {
  title: string;
  bullets: string[];
  notes: string;
  layout: 'title' | 'bullets' | 'two-col' | 'quote';
}
export interface SlideDeck {
  title: string;
  subtitle?: string;
  slides: Slide[];
}
export interface Flashcard {
  front: string;
  back: string;
  hint?: string;
  tags?: string[];
}
export interface FlashcardSet {
  title: string;
  cards: Flashcard[];
}
export type QuizType = 'mcq' | 'fill' | 'short' | 'long' | 'coding';
export interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  explanation?: string;
  topic?: string;
  type?: QuizType;
  answer?: string;
  difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
}
export interface Quiz {
  title: string;
  questions: QuizQuestion[];
}
export interface MindNode {
  id: string;
  parent: string | null;
  label: string;
  desc?: string;
}
export interface MindMap {
  root: string;
  nodes: MindNode[];
}
export interface StudyDay {
  day: number;
  topics: string[];
  tasks: string[];
  estMinutes: number;
}
export interface StudyPlan {
  goal: string;
  durationDays: number;
  summary: string;
  days: StudyDay[];
}
