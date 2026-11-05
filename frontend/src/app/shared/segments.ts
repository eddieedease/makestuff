import { Component, input, output, signal } from '@angular/core';
import { Question, QuestionReview, Segment } from '../core/models';
import { MarkdownPipe } from './markdown';
import { QuestionCard } from './question-card';
import { TPipe } from '../i18n/i18n';

@Component({
  imports: [TPipe],
  selector: 'app-flipcards',
  template: `
    <div class="my-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      @for (card of cards(); track $index) {
        <button
          type="button"
          class="min-h-32 rounded-xl border p-4 text-left text-sm transition-colors"
          [class]="flipped().has($index) ? 'border-accent bg-accent-soft' : 'border-line bg-paper hover:border-line-strong'"
          [attr.aria-pressed]="flipped().has($index)"
          (click)="flip($index)"
        >
          @if (flipped().has($index)) {
            {{ card.back }}
          } @else {
            <span class="font-display text-lg font-semibold">{{ card.front }}</span>
            <span class="mt-2 block text-xs text-muted">{{ 'Select to flip' | t }}</span>
          }
        </button>
      }
    </div>
  `,
})
export class Flipcards {
  cards = input.required<{ front: string; back: string }[]>();
  flipped = signal(new Set<number>());

  flip(index: number): void {
    const next = new Set(this.flipped());
    if (!next.delete(index)) next.add(index);
    this.flipped.set(next);
  }
}

/** Renders e-learning segments. To add an interactive element, add a case here and in Directives.php. */
@Component({
  selector: 'app-segments',
  imports: [MarkdownPipe, QuestionCard, Flipcards, TPipe],
  template: `
    @for (segment of segments(); track $index) {
      @switch (segment.kind) {
        @case ('markdown') {
          <div class="prose prose-stone max-w-none prose-headings:font-display prose-img:rounded-lg" [innerHTML]="segment.text | markdown"></div>
        }
        @case ('reveal') {
          <details class="group my-5 rounded-xl border border-line bg-paper px-4 py-3">
            <summary class="cursor-pointer text-sm font-semibold">{{ segment.title }}</summary>
            <div class="prose prose-stone prose-sm mt-2 max-w-none" [innerHTML]="segment.text | markdown"></div>
          </details>
        }
        @case ('callout') {
          <aside class="my-5 rounded-xl border-l-4 px-4 py-3 text-sm" [class]="calloutClass(segment.variant)">
            <div class="prose prose-stone prose-sm max-w-none" [innerHTML]="segment.text | markdown"></div>
          </aside>
        }
        @case ('flipcards') {
          <app-flipcards [cards]="segment.cards" />
        }
        @case ('question') {
          <div class="my-6 rounded-xl border border-line bg-paper p-4">
            <app-question-card
              [question]="segment.question"
              [answer]="answers()[segment.question.id]"
              [review]="reviews()[segment.question.id]"
              [locked]="readonly() || !!reviews()[segment.question.id]"
              (answered)="answered.emit({ id: segment.question.id, answer: $event })"
            />
            @if (!readonly() && !reviews()[segment.question.id]) {
              <button type="button" class="btn-ghost mt-3" [disabled]="!hasAnswer(segment.question)" (click)="check.emit(segment.question.id)">{{ 'Check answer' | t }}</button>
            }
          </div>
        }
        @case ('error') {
          <p class="alert-error my-4">{{ segment.message }}</p>
        }
      }
    }
  `,
})
export class Segments {
  segments = input.required<Segment[]>();
  answers = input<Record<string, any>>({});
  reviews = input<Record<string, QuestionReview>>({});
  readonly = input(false);
  answered = output<{ id: string; answer: any }>();
  check = output<string>();

  calloutClass(variant: string): string {
    return { tip: 'border-accent bg-accent-soft', warning: 'border-warn bg-warn-soft', info: 'border-info bg-info-soft' }[variant] ?? '';
  }

  hasAnswer(question: Question): boolean {
    const answer = this.answers()[question.id];
    return Array.isArray(answer) ? answer.length > 0 : !!answer;
  }
}
