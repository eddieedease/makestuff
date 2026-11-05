import { Component, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Question } from '../core/models';
import { TPipe, t } from '../i18n/i18n';

const uid = (prefix: string) => prefix + crypto.randomUUID().slice(0, 8);

@Component({
  imports: [FormsModule, TPipe],
  template: `
    <div class="grid max-w-5xl gap-6 lg:grid-cols-[1fr_15rem]">
      <div class="min-w-0 space-y-3 lg:order-1">
        @for (q of content().questions; track q.id; let i = $index) {
          <section class="card p-4">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="font-sans text-sm font-semibold">{{ 'Question {n}' | t: { n: i + 1 } }}</h2>
              <select class="input !w-auto !py-1" [attr.aria-label]="'Question type' | t" [ngModel]="q.type" (ngModelChange)="setType(q, $event)">
                <option value="single">{{ 'One answer' | t }}</option>
                <option value="multiple">{{ 'Several answers' | t }}</option>
                <option value="truefalse">{{ 'True or false' | t }}</option>
                <option value="text">{{ 'Typed answer' | t }}</option>
              </select>
              <label class="ml-auto flex items-center gap-1 text-xs text-muted">{{ 'Points' | t }}
                <input class="input !w-16 !py-1" type="number" min="0" [(ngModel)]="q.points" (ngModelChange)="changed()()" />
              </label>
              <button type="button" class="btn-quiet !px-2 !py-1" [attr.aria-label]="'Move up' | t" [disabled]="i === 0" (click)="move(i, -1)">↑</button>
              <button type="button" class="btn-quiet !px-2 !py-1" [attr.aria-label]="'Move down' | t" [disabled]="i === content().questions.length - 1" (click)="move(i, 1)">↓</button>
              <button type="button" class="btn-quiet !px-2 !py-1 hover:!text-danger" (click)="remove(i)">{{ 'Delete' | t }}</button>
            </div>
            <textarea class="input mt-3" rows="2" [attr.aria-label]="'Question text' | t" [placeholder]="'Write the question. Markdown works here.' | t" [(ngModel)]="q.text" (ngModelChange)="changed()()"></textarea>

            @if (q.type === 'text') {
              <label class="label mt-3">{{ 'Accepted answers' | t }}
                <textarea class="input" rows="2" [ngModel]="q.accepted?.join('\n')" (ngModelChange)="setAccepted(q, $event)"></textarea>
                <span class="hint">{{ 'One per line. Capitals and extra spaces are ignored.' | t }}</span>
              </label>
            } @else {
              <div class="mt-3 space-y-2">
                @for (o of q.options; track o.id; let oi = $index) {
                  <div class="flex items-start gap-2">
                    <input
                      class="mt-2.5 accent-accent"
                      [type]="q.type === 'multiple' ? 'checkbox' : 'radio'"
                      [name]="'correct-' + q.id"
                      [attr.aria-label]="'Option {n} is correct' | t: { n: oi + 1 }"
                      [checked]="o.correct"
                      (change)="mark(q, o, $event)"
                    />
                    <div class="grid min-w-0 flex-1 gap-1 sm:grid-cols-2">
                      <input class="input" [attr.aria-label]="'Option {n}' | t: { n: oi + 1 }" [placeholder]="'Answer' | t" [disabled]="q.type === 'truefalse'" [(ngModel)]="o.text" (ngModelChange)="changed()()" />
                      <input class="input" [attr.aria-label]="'Feedback for option {n}' | t: { n: oi + 1 }" [placeholder]="'Feedback (optional)' | t" [(ngModel)]="o.feedback" (ngModelChange)="changed()()" />
                    </div>
                    @if (q.type !== 'truefalse') {
                      <button type="button" class="btn-quiet !px-2" [attr.aria-label]="'Remove option {n}' | t: { n: oi + 1 }" (click)="removeOption(q, oi)">✕</button>
                    }
                  </div>
                }
                @if (q.type !== 'truefalse') {
                  <button type="button" class="btn-quiet !px-2 !py-1" (click)="addOption(q)">{{ 'Add option' | t }}</button>
                }
              </div>
            }
            <label class="label mt-3">{{ 'Feedback after answering' | t }}
              <input class="input" [placeholder]="'Optional' | t" [(ngModel)]="q.feedback" (ngModelChange)="changed()()" />
            </label>
          </section>
        } @empty {
          <p class="card px-4 py-10 text-center text-sm text-muted">{{ 'No questions yet.' | t }}</p>
        }
        <button type="button" class="btn-ghost" (click)="add()">{{ 'Add question' | t }}</button>
      </div>

      <aside class="space-y-3 lg:order-2">
        <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">{{ 'Settings' | t }}</h2>
        <label class="label">{{ 'Pass mark (%)' | t }}
          <input class="input" type="number" min="0" max="100" [(ngModel)]="content().settings.passPercentage" (ngModelChange)="changed()()" />
        </label>
        <label class="label">{{ 'Attempts allowed' | t }}
          <input class="input" type="number" min="0" [(ngModel)]="content().settings.maxAttempts" (ngModelChange)="changed()()" />
          <span class="hint">{{ '0 means unlimited. The LMS gets the best score.' | t }}</span>
        </label>
        @for (s of toggles; track s.key) {
          <label class="flex items-start gap-2 text-sm">
            <input type="checkbox" class="mt-1 accent-accent" [(ngModel)]="content().settings[s.key]" (ngModelChange)="changed()()" />
            <span>{{ s.label | t }}<span class="hint">{{ s.hint | t }}</span></span>
          </label>
        }
      </aside>
    </div>
  `,
})
export class QuizEditor {
  content = input.required<any>();
  changed = input.required<() => void>();
  toggles = [
    { key: 'shuffleQuestions', label: 'Shuffle questions', hint: 'Each attempt gets its own order.' },
    { key: 'immediateFeedback', label: 'Feedback per question', hint: 'Learners see if they are right as they go.' },
    { key: 'showAnswers', label: 'Show answers afterwards', hint: 'Turn off if learners may retake it.' },
  ];

  private blankOptions(): Question['options'] {
    return [
      { id: uid('o'), text: '', correct: true, feedback: '' },
      { id: uid('o'), text: '', correct: false, feedback: '' },
    ];
  }

  add(): void {
    this.content().questions.push({ id: uid('q'), type: 'single', text: '', points: 1, feedback: '', options: this.blankOptions(), accepted: [] });
    this.changed()();
  }

  remove(index: number): void {
    if (!confirm(t('Delete question {n}?', { n: index + 1 }))) return;
    this.content().questions.splice(index, 1);
    this.changed()();
  }

  move(index: number, delta: number): void {
    const questions = this.content().questions;
    const [question] = questions.splice(index, 1);
    questions.splice(index + delta, 0, question);
    this.changed()();
  }

  setType(question: Question, type: Question['type']): void {
    question.type = type;
    if (type === 'truefalse') {
      question.options = [
        { id: uid('o'), text: t('True'), correct: true, feedback: '' },
        { id: uid('o'), text: t('False'), correct: false, feedback: '' },
      ];
    } else if (type !== 'text' && question.options.length < 2) {
      question.options = this.blankOptions();
    } else if (type === 'single') {
      let found = false;
      for (const option of question.options) {
        option.correct = !!option.correct && !found;
        found ||= option.correct;
      }
    }
    this.changed()();
  }

  mark(question: Question, option: Question['options'][number], event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (question.type !== 'multiple') question.options.forEach((o) => (o.correct = false));
    option.correct = checked;
    this.changed()();
  }

  addOption(question: Question): void {
    question.options.push({ id: uid('o'), text: '', correct: false, feedback: '' });
    this.changed()();
  }

  removeOption(question: Question, index: number): void {
    question.options.splice(index, 1);
    this.changed()();
  }

  setAccepted(question: Question, text: string): void {
    question.accepted = text.split('\n').map((line) => line.trim()).filter(Boolean);
    this.changed()();
  }
}
