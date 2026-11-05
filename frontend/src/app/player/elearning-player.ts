import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { errorMessage } from '../core/auth';
import { QuestionReview, Segment } from '../core/models';
import { Segments } from '../shared/segments';
import { PlayStore } from './play-store';
import { ResultFooter } from './result-footer';
import { NumPipe, TPipe } from '../i18n/i18n';

interface Page { id: string; title: string; segments: Segment[] }

@Component({
  imports: [Segments, ResultFooter, TPipe, NumPipe],
  template: `
    @if (store.session()!.attempt.result; as result) {
      <section class="card p-6">
        <h2 class="text-2xl font-semibold">{{ 'Course finished' | t }}</h2>
        @if (result.detail.graded) {
          <p class="mt-2 text-sm">{{ 'You answered {correct} of {total} questions correctly ({percent}%).' | t: { correct: result.detail.correct, total: result.detail.total, percent: result.detail.percentage | num } }}
            {{ (result.passed ? 'You passed.' : 'That is below the pass mark.') | t }}</p>
        } @else {
          <p class="mt-2 text-sm">{{ 'Well done, you have completed this course.' | t }}</p>
        }
        <app-result-footer />
      </section>
    } @else {
      <nav class="mb-5" [attr.aria-label]="'Course pages' | t">
        <div class="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" [attr.aria-valuenow]="percent()" aria-valuemin="0" aria-valuemax="100">
          <div class="h-full bg-accent transition-all" [style.width.%]="percent()"></div>
        </div>
        <ol class="mt-2 flex flex-wrap gap-1">
          @for (p of pages(); track p.id; let i = $index) {
            <li>
              <button
                type="button"
                class="rounded-md px-2 py-1 text-xs font-medium"
                [class]="i === index() ? 'bg-accent text-surface' : visited().has(i) ? 'bg-accent-soft text-accent-dark' : 'text-muted hover:bg-line/50'"
                [attr.aria-current]="i === index() ? 'page' : null"
                (click)="go(i)"
              >{{ i + 1 }}. {{ p.title }}</button>
            </li>
          }
        </ol>
      </nav>

      <article class="card p-5 sm:p-7">
        <app-segments [segments]="pages()[index()].segments" [answers]="answers()" [reviews]="reviews()" (answered)="setAnswer($event)" (check)="check($event)" />
      </article>

      @if (error()) { <p class="alert-error mt-3" role="alert">{{ error() }}</p> }
      <div class="mt-4 flex justify-between">
        <button type="button" class="btn-ghost" [disabled]="index() === 0" (click)="go(index() - 1)">{{ 'Previous' | t }}</button>
        @if (index() < pages().length - 1) {
          <button type="button" class="btn-primary" (click)="go(index() + 1)">{{ 'Next' | t }}</button>
        } @else {
          <button type="button" class="btn-primary" [disabled]="busy()" (click)="finish()">{{ 'Finish' | t }}</button>
        }
      </div>
    }
  `,
})
export class ElearningPlayer {
  store = inject(PlayStore);

  pages = computed<Page[]>(() => this.store.session()!.object.content.pages);
  index = signal(0);
  visited = signal(new Set<number>());
  answers = signal<Record<string, any>>({});
  reviews = signal<Record<string, QuestionReview>>({});
  percent = computed(() => Math.round((this.visited().size / this.pages().length) * 100));
  busy = signal(false);
  error = signal('');

  constructor() {
    // Runs for the first load and again after a retake starts a fresh attempt.
    effect(() => {
      const attempt = this.store.session()!.attempt;
      untracked(() => {
        const saved = attempt.status === 'in_progress' ? (attempt.state ?? {}) : {};
        const page = Math.min(saved.page ?? 0, this.pages().length - 1);
        this.index.set(page);
        this.visited.set(new Set<number>([...(saved.visited ?? []), page]));
        this.answers.set(saved.answers ?? {});
        this.reviews.set(saved.reviews ?? {});
      });
    });
  }

  go(index: number): void {
    this.index.set(index);
    this.visited.update((set) => new Set(set).add(index));
    this.persist();
    window.scrollTo({ top: 0 });
  }

  setAnswer(event: { id: string; answer: any }): void {
    this.answers.update((a) => ({ ...a, [event.id]: event.answer }));
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
    this.store.save(
      { page: this.index(), visited: [...this.visited()], answers: this.answers(), reviews: this.reviews() },
      this.visited().size / this.pages().length,
    );
  }

  async finish(): Promise<void> {
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
