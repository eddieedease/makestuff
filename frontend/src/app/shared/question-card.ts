import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Question, QuestionReview } from '../core/models';
import { MarkdownPipe } from './markdown';
import { TPipe } from '../i18n/i18n';

/** One question. Used by the quiz player, the e-learning player and result reviews. */
@Component({
  selector: 'app-question-card',
  imports: [FormsModule, MarkdownPipe, TPipe],
  template: `
    <fieldset class="min-w-0">
      <legend class="prose prose-stone max-w-none font-medium" [innerHTML]="question().text | markdown"></legend>
      @if (question().type === 'multiple') {
        <p class="mt-1 text-xs text-muted">{{ 'Choose all that apply.' | t }}</p>
      }

      @if (question().type === 'text') {
        <input class="input mt-3" [attr.aria-label]="'Your answer' | t" [ngModel]="answer()" (ngModelChange)="answered.emit($event)" [disabled]="locked()" />
      } @else {
        <div class="mt-3 space-y-2">
          @for (option of question().options; track option.id) {
            <label class="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors" [class]="optionClass(option.id)">
              <input
                class="mt-0.5 accent-accent"
                [type]="question().type === 'multiple' ? 'checkbox' : 'radio'"
                [name]="question().id"
                [checked]="isSelected(option.id)"
                [disabled]="locked()"
                (change)="toggle(option.id)"
              />
              <span class="min-w-0">
                {{ option.text }}
                @if (review()?.optionFeedback?.[option.id]; as note) {
                  <span class="mt-1 block text-xs text-muted">{{ note }}</span>
                }
              </span>
            </label>
          }
        </div>
      }

      @if (review(); as r) {
        <p class="mt-3 text-sm font-semibold" [class]="r.correct ? 'text-accent' : 'text-danger'">
          {{ (r.correct ? 'Correct' : 'Not quite') | t }}
        </p>
        @if (question().type === 'text' && !r.correct && r.accepted.length) {
          <p class="text-sm text-muted">{{ 'Accepted answer: {answer}' | t: { answer: r.accepted[0] } }}</p>
        }
        @if (r.feedback) {
          <p class="mt-1 text-sm text-muted">{{ r.feedback }}</p>
        }
      }
    </fieldset>
  `,
})
export class QuestionCard {
  question = input.required<Question>();
  answer = input<any>(null);
  review = input<QuestionReview | null>(null);
  locked = input(false);
  answered = output<any>();

  private selected = computed<string[]>(() => {
    const a = this.answer();
    return Array.isArray(a) ? a : a ? [a] : [];
  });

  isSelected(id: string): boolean {
    return this.selected().includes(id);
  }

  toggle(id: string): void {
    if (this.question().type !== 'multiple') {
      this.answered.emit(id);
      return;
    }
    const current = this.selected();
    this.answered.emit(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  }

  optionClass(id: string): string {
    const review = this.review();
    if (review?.correctOptions.includes(id)) return 'border-accent bg-accent-soft';
    if (review && this.isSelected(id)) return 'border-danger bg-danger-soft';
    return this.isSelected(id) ? 'border-accent bg-accent-soft/50' : 'border-line hover:border-line-strong';
  }
}
