import { Type } from '@angular/core';

/**
 * The frontend half of a learning type (the backend half is
 * backend/src/Types). Add an entry here plus an editor and a player
 * component, and the library, publishing and LTI work without other changes.
 *
 * Editors receive inputs { content, changed }, players need no inputs: they
 * inject PlayStore.
 */
export interface LearningTypeUi {
  key: string;
  label: string;
  blurb: string;
  /** Tailwind classes for the small type tag. */
  tag: string;
  editor: () => Promise<Type<unknown>>;
  player: () => Promise<Type<unknown>>;
}

export const LEARNING_TYPES: LearningTypeUi[] = [
  {
    key: 'elearning',
    label: 'E-learning',
    blurb: 'A paged course in Markdown, with images and interactive elements.',
    tag: 'bg-info-soft text-info',
    editor: () => import('../editors/elearning-editor').then((m) => m.ElearningEditor),
    player: () => import('../player/elearning-player').then((m) => m.ElearningPlayer),
  },
  {
    key: 'quiz',
    label: 'Quiz',
    blurb: 'Scored questions with a pass mark. The grade goes back to the LMS.',
    tag: 'bg-warn-soft text-warn',
    editor: () => import('../editors/quiz-editor').then((m) => m.QuizEditor),
    player: () => import('../player/quiz-player').then((m) => m.QuizPlayer),
  },
  {
    key: 'scan',
    label: 'Scan',
    blurb: 'A self-assessment that gives a personal profile and advice.',
    tag: 'bg-accent-soft text-accent-dark',
    editor: () => import('../editors/scan-editor').then((m) => m.ScanEditor),
    player: () => import('../player/scan-player').then((m) => m.ScanPlayer),
  },
];

export function learningType(key: string): LearningTypeUi | undefined {
  return LEARNING_TYPES.find((t) => t.key === key);
}
