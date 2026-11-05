import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { errorMessage } from '../core/auth';
import { PlayStore } from './play-store';
import { ResultFooter } from './result-footer';

@Component({
  imports: [ResultFooter],
  template: `
    @if (result(); as r) {
      <section class="card p-6">
        <p class="text-sm text-muted">Your overall score</p>
        <p class="font-display text-5xl font-semibold tabular-nums">{{ r.overall }}%</p>
        @if (r.overallBand; as b) {
          <h2 class="mt-3 text-xl font-semibold">{{ b.title }}</h2>
          <p class="mt-1 text-sm">{{ b.advice }}</p>
        }
      </section>

      <h2 class="mt-6 text-xl font-semibold">Your profile</h2>
      <div class="mt-3 space-y-3">
        @for (d of r.dimensions; track d.id) {
          <section class="card p-4">
            <div class="flex items-baseline justify-between gap-3">
              <h3 class="font-sans text-sm font-semibold">{{ d.name }}</h3>
              <span class="text-sm tabular-nums text-muted">{{ d.percentage }}%</span>
            </div>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-line" role="img" [attr.aria-label]="d.name + ': ' + d.percentage + ' percent'">
              <div class="h-full rounded-full bg-accent" [style.width.%]="d.percentage"></div>
            </div>
            @if (d.band; as b) {
              <p class="mt-2 text-sm"><span class="font-semibold">{{ b.title }}.</span> {{ b.advice }}</p>
            }
          </section>
        }
      </div>
      <app-result-footer />
    } @else {
      @if (content().intro) { <p class="text-sm text-muted">{{ content().intro }}</p> }
      <p class="mt-3 text-sm text-muted">{{ done() }} of {{ content().questions.length }} answered</p>
      <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
        <div class="h-full bg-accent transition-all" [style.width.%]="(done() / content().questions.length) * 100"></div>
      </div>

      <div class="mt-4 space-y-3">
        @for (q of content().questions; track q.id; let i = $index) {
          <fieldset class="card min-w-0 p-4">
            <legend class="float-left mb-3 w-full text-sm font-medium">{{ i + 1 }}. {{ q.text }}</legend>
            <div class="clear-both grid gap-1.5" [style.grid-template-columns]="columns()">
              @for (s of content().scale; track s.value) {
                <label class="cursor-pointer rounded-lg border px-2 py-2 text-center text-xs transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
                  [class]="answers()[q.id] === s.value ? 'border-accent bg-accent-soft font-semibold text-accent-dark' : 'border-line text-muted hover:border-line-strong'">
                  <input type="radio" class="sr-only" [name]="q.id" [value]="s.value" [checked]="answers()[q.id] === s.value" (change)="answer(q.id, s.value)" />
                  {{ s.label }}
                </label>
              }
            </div>
          </fieldset>
        }
      </div>

      @if (error()) { <p class="alert-error mt-3" role="alert">{{ error() }}</p> }
      <button type="button" class="btn-primary mt-4" [disabled]="busy() || done() < content().questions.length" (click)="submit()">See my results</button>
    }
  `,
})
export class ScanPlayer {
  store = inject(PlayStore);
  content = computed(() => this.store.session()!.object.content);
  result = computed(() => this.store.session()!.attempt.result?.detail ?? null);
  answers = signal<Record<string, number>>({});
  done = computed(() => Object.keys(this.answers()).length);
  columns = computed(() => `repeat(auto-fit, minmax(5.5rem, 1fr))`);
  busy = signal(false);
  error = signal('');

  constructor() {
    effect(() => {
      const attempt = this.store.session()!.attempt;
      untracked(() => this.answers.set(attempt.status === 'in_progress' ? (attempt.state?.answers ?? {}) : {}));
    });
  }

  answer(id: string, value: number): void {
    this.answers.update((a) => ({ ...a, [id]: value }));
    this.store.save({ answers: this.answers() }, this.done() / this.content().questions.length);
  }

  async submit(): Promise<void> {
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
