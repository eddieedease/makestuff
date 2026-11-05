import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { errorMessage } from '../core/auth';
import { Question, QuestionReview } from '../core/models';
import { QuestionCard } from '../shared/question-card';
import { PlayStore } from './play-store';
import { ResultFooter } from './result-footer';

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

@Component({
  imports: [QuestionCard, ResultFooter],
  template: `
    @if (result(); as r) {
      <section class="card p-6">
        <p class="font-display text-5xl font-semibold tabular-nums">{{ r.detail.percentage }}%</p>
        <p class="mt-1 font-semibold" [class]="r.passed ? 'text-accent' : 'text-danger'">{{ r.passed ? 'You passed' : 'Not passed yet' }}</p>
        <p class="text-sm text-muted">The pass mark is {{ settings().passPercentage }}%.</p>
        <app-result-footer />
      </section>
      @if (r.detail.review) {
        <h2 class="mt-8 text-xl font-semibold">Your answers</h2>
        <div class="mt-3 space-y-3">
          @for (q of allQuestions(); track q.id) {
            <section class="card p-5">
              <app-question-card [question]="q" [answer]="finalAnswers()[q.id]" [review]="reviewFor(q.id)" [locked]="true" />
            </section>
          }
        </div>
      }
    } @else if (question(); as q) {
      <p class="text-sm text-muted">Question {{ index() + 1 }} of {{ order().length }}</p>
      <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div class="h-full bg-accent transition-all" [style.width.%]="((index() + 1) / order().length) * 100"></div>
      </div>
      <section class="card mt-4 p-5 sm:p-6">
        <app-question-card [question]="q" [answer]="answers()[q.id]" [review]="reviews()[q.id]" [locked]="!!reviews()[q.id]" (answered)="setAnswer(q.id, $event)" />
        @if (settings().immediateFeedback && !reviews()[q.id]) {
          <button type="button" class="btn-ghost mt-3" [disabled]="!answered(q.id)" (click)="check(q.id)">Check answer</button>
        }
      </section>
      @if (error()) { <p class="alert-error mt-3" role="alert">{{ error() }}</p> }
      <div class="mt-4 flex justify-between">
        <button type="button" class="btn-ghost" [disabled]="index() === 0" (click)="go(index() - 1)">Previous</button>
        @if (index() < order().length - 1) {
          <button type="button" class="btn-primary" (click)="go(index() + 1)">Next</button>
        } @else {
          <button type="button" class="btn-primary" [disabled]="busy()" (click)="submit()">Submit</button>
        }
      </div>
    }
  `,
})
export class QuizPlayer {
  store = inject(PlayStore);

  private content = computed(() => this.store.session()!.object.content);
  settings = computed(() => this.content().settings);
  allQuestions = computed<Question[]>(() => this.content().questions);
  result = computed(() => this.store.session()!.attempt.result);
  finalAnswers = computed<Record<string, any>>(() => this.store.session()!.attempt.state?.answers ?? {});

  order = signal<string[]>([]);
  index = signal(0);
  answers = signal<Record<string, any>>({});
  reviews = signal<Record<string, QuestionReview>>({});
  busy = signal(false);
  error = signal('');
  question = computed(() => this.allQuestions().find((q) => q.id === this.order()[this.index()]));

  constructor() {
    // Runs for the first load and again after a retake starts a fresh attempt.
    effect(() => {
      const attempt = this.store.session()!.attempt;
      untracked(() => {
        const saved = attempt.status === 'in_progress' ? (attempt.state ?? {}) : {};
        const ids = this.allQuestions().map((q) => q.id);
        this.order.set(saved.order ?? (this.settings().shuffleQuestions ? shuffled(ids) : ids));
        this.index.set(saved.index ?? 0);
        this.answers.set(saved.answers ?? {});
        this.reviews.set(saved.reviews ?? {});
      });
    });
  }

  reviewFor(id: string): QuestionReview | null {
    return this.result()?.detail.review?.find((r: QuestionReview) => r.id === id) ?? null;
  }

  answered(id: string): boolean {
    const answer = this.answers()[id];
    return Array.isArray(answer) ? answer.length > 0 : !!answer;
  }

  setAnswer(id: string, answer: any): void {
    this.answers.update((a) => ({ ...a, [id]: answer }));
    this.persist();
  }

  go(index: number): void {
    this.index.set(index);
    this.persist();
  }

  async check(id: string): Promise<void> {
    try {
      const review = await this.store.check(id, this.answers()[id]);
      this.reviews.update((r) => ({ ...r, [id]: review }));
      this.persist();
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  private persist(): void {
    const done = this.order().filter((id) => this.answered(id)).length;
    this.store.save(
      { order: this.order(), index: this.index(), answers: this.answers(), reviews: this.reviews() },
      done / Math.max(1, this.order().length),
    );
  }

  async submit(): Promise<void> {
    const open = this.order().filter((id) => !this.answered(id)).length;
    if (open && !confirm(`You have ${open} unanswered question(s). Submit anyway?`)) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.store.submit(this.answers());
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
