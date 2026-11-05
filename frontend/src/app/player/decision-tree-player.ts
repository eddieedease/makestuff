import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { errorMessage } from '../core/auth';
import { NumPipe, t, TPipe } from '../i18n/i18n';
import { MarkdownPipe } from '../shared/markdown';
import { PlayStore } from './play-store';
import { ResultFooter } from './result-footer';

interface TreeStep {
  id: string;
  kind: 'step' | 'end';
  title: string;
  text: string;
  choices: { id: string; text: string }[];
}

/** Only ever holds the current step: the server decides where a path leads. */
@Component({
  imports: [MarkdownPipe, NumPipe, ResultFooter, TPipe],
  template: `
    @if (result(); as r) {
      <section class="card p-6">
        <p class="text-sm text-muted">{{ 'Your ending' | t }}</p>
        <h2 class="text-2xl font-semibold">{{ r.ending.title }}</h2>
        <div class="prose prose-stone prose-sm mt-2 max-w-none" [innerHTML]="r.ending.text | markdown"></div>
        @if (r.graded) {
          <p class="mt-3 text-sm font-semibold" [class]="passed() ? 'text-accent' : 'text-danger'">
            {{ 'Score: {percent}%' | t: { percent: r.percentage | num } }}. {{ (passed() ? 'You passed.' : 'That is below the pass mark.') | t }}
          </p>
        }
        <app-result-footer />
      </section>

      @if (r.trail.length) {
        <h2 class="mt-8 text-xl font-semibold">{{ 'The path you took' | t }}</h2>
        <ol class="mt-3 space-y-2">
          @for (s of r.trail; track $index) {
            <li class="card p-4 text-sm">
              <p class="text-xs text-muted">{{ s.step }}</p>
              <p class="font-medium">{{ s.choice }}</p>
              @if (s.feedback) { <p class="mt-1 text-muted">{{ s.feedback }}</p> }
            </li>
          }
        </ol>
      }
    } @else if (node(); as n) {
      @if (feedback()) {
        <p class="mb-3 rounded-lg bg-info-soft px-3 py-2 text-sm text-info" role="status">{{ feedback() }}</p>
      }
      <section class="card p-5 sm:p-7">
        @if (n.title) { <h2 class="mb-2 text-xl font-semibold">{{ n.title }}</h2> }
        <div class="prose prose-stone max-w-none prose-img:rounded-lg" [innerHTML]="n.text | markdown"></div>
        @if (n.kind === 'step') {
          <div class="mt-5 space-y-2">
            @for (c of n.choices; track c.id) {
              <button type="button" class="w-full rounded-lg border border-line-strong px-4 py-3 text-left text-sm font-medium transition-colors hover:border-accent hover:bg-accent-soft/50 disabled:opacity-60" [disabled]="busy()" (click)="choose(c.id)">{{ c.text }}</button>
            }
          </div>
        }
      </section>
      @if (error()) { <p class="alert-error mt-3" role="alert">{{ error() }}</p> }
      <div class="mt-4 flex justify-between gap-2">
        @if (canGoBack()) {
          <button type="button" class="btn-ghost" [disabled]="busy()" (click)="back()">{{ 'Go back' | t }}</button>
        } @else {
          <span></span>
        }
        @if (n.kind === 'end') {
          <button type="button" class="btn-primary" [disabled]="busy()" (click)="finish()">{{ 'Finish' | t }}</button>
        }
      </div>
    } @else if (error()) {
      <p class="alert-error" role="alert">{{ error() }}</p>
    }
  `,
})
export class DecisionTreePlayer {
  store = inject(PlayStore);
  private content = computed(() => this.store.session()!.object.content);
  result = computed(() => this.store.session()!.attempt.result?.detail ?? null);
  passed = computed(() => this.store.session()!.attempt.result?.passed === true);

  path = signal<string[]>([]);
  node = signal<TreeStep | null>(null);
  feedback = signal('');
  busy = signal(false);
  error = signal('');
  canGoBack = computed(() => !!this.content().settings.allowBack && this.path().length > 0);

  constructor() {
    // Runs for the first load and again after a retake starts a fresh attempt.
    effect(() => {
      const attempt = this.store.session()!.attempt;
      untracked(() => {
        if (attempt.status !== 'in_progress') return;
        this.restart(attempt.state?.path ?? []);
      });
    });
  }

  private async restart(path: string[]): Promise<void> {
    if (!path.length) {
      this.path.set([]);
      this.feedback.set('');
      this.node.set(this.content().start);
      if (!this.content().start) this.error.set(t('This scenario has no starting step yet.'));
      return;
    }
    // A saved path can stop existing when the author republishes: start over then.
    if (!(await this.walk(path))) {
      this.error.set('');
      await this.restart([]);
    }
  }

  private async walk(path: string[]): Promise<boolean> {
    this.busy.set(true);
    this.error.set('');
    try {
      const res = await this.store.check<{ node: TreeStep; feedback: string }>('walk', path);
      this.path.set(path);
      this.node.set(res.node);
      this.feedback.set(res.feedback);
      this.store.save({ path }, path.length / (path.length + 1));
      return true;
    } catch (e) {
      this.error.set(errorMessage(e));
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  choose(choiceId: string): void {
    this.walk([...this.path(), choiceId]);
  }

  back(): void {
    this.walk(this.path().slice(0, -1));
  }

  async finish(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.store.submit({ path: this.path() });
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
