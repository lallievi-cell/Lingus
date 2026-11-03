import { teachWord } from './engine';
import { getLessonPreview, type LessonPreview } from './teaching';
import type { GameState } from './types';

export interface PlannedLesson extends LessonPreview {
  wordId: string;
}

/** Rehearse the public lesson API on copies, including its real pupil/seed ordering. */
function evaluatePlan(state: GameState, words: readonly string[]) {
  const unique = [...new Set(words)];
  let next = state;
  const lessons: PlannedLesson[] = [];
  for (const wordId of unique) {
    const lesson = { wordId, ...getLessonPreview(next, wordId) };
    lessons.push(lesson);
    if (lesson.allowed) next = teachWord(next, wordId);
  }
  return {
    lessons,
    cost: lessons.reduce((total, lesson) => total + lesson.attentionCost, 0),
    allowed: lessons.length > 0 && lessons.every((lesson) => lesson.allowed),
    next,
  };
}

export function previewLessonPlan(state: GameState, words: readonly string[]) {
  const { next: _next, ...preview } = evaluatePlan(state, words);
  return preview;
}

/** All chosen lessons are revalidated before any real Attention is spent. */
export function executeLessonPlan(state: GameState, words: readonly string[]) {
  const preview = evaluatePlan(state, words);
  return preview.allowed ? preview.next : state;
}
