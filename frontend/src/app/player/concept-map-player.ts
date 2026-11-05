import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { errorMessage } from '../core/auth';
import { TPipe } from '../i18n/i18n';
import { MapCanvas, MapEdge, MapNode } from '../shared/map-canvas';
import { MarkdownPipe } from '../shared/markdown';
import { PlayStore } from './play-store';
import { ResultFooter } from './result-footer';

@Component({
  imports: [MapCanvas, MarkdownPipe, ResultFooter, TPipe],
  template: `
    @if (result(); as r) {
      <section class="card p-6">
        <h2 class="text-2xl font-semibold">{{ 'Map explored' | t }}</h2>
        <p class="mt-2 text-sm">{{ 'You opened {visited} of {total} ideas.' | t: { visited: r.visited, total: r.total } }}</p>
        <app-result-footer />
      </section>
    } @else {
      @if (content().intro) { <p class="mb-3 text-sm text-muted">{{ content().intro }}</p> }
      <p class="mb-2 text-sm text-muted" aria-live="polite">{{ '{visited} of {total} ideas opened' | t: { visited: visited().size, total: nodes().length } }}</p>

      <app-map-canvas
        [nodes]="nodes()"
        [edges]="edges()"
        [categories]="content().categories"
        [selectedId]="selectedId()"
        [visible]="visible()"
        [visited]="visited()"
        (picked)="open($event)"
      />

      @if (selected(); as n) {
        <article class="card mt-3 p-5" aria-live="polite">
          <h2 class="text-xl font-semibold">{{ n.title }}</h2>
          <div class="prose prose-stone mt-1 max-w-none prose-img:rounded-lg" [innerHTML]="n.text | markdown"></div>
          @if (links().length) {
            <h3 class="mt-4 font-sans text-sm font-semibold">{{ 'Connected to' | t }}</h3>
            <ul class="mt-1 space-y-1">
              @for (l of links(); track l.id) {
                <li>
                  <button type="button" class="w-full rounded-lg border border-line px-3 py-2 text-left text-sm hover:border-accent" (click)="open(l.node.id)">
                    <span class="text-muted">{{ l.arrow }} {{ l.label }}</span>
                    <span class="font-medium"> {{ l.node.title }}</span>
                  </button>
                </li>
              }
            </ul>
          }
        </article>
      } @else {
        <p class="mt-3 text-sm text-muted">{{ 'Select an idea to read about it.' | t }}</p>
      }

      @if (error()) { <p class="alert-error mt-3" role="alert">{{ error() }}</p> }
      <div class="mt-4 flex justify-end">
        <button type="button" class="btn-primary" [disabled]="busy() || !canFinish()" (click)="finish()">{{ 'Finish' | t }}</button>
      </div>
    }
  `,
})
export class ConceptMapPlayer {
  store = inject(PlayStore);
  content = computed(() => this.store.session()!.object.content);
  nodes = computed<MapNode[]>(() => this.content().nodes);
  edges = computed<MapEdge[]>(() => this.content().edges);
  result = computed(() => this.store.session()!.attempt.result?.detail ?? null);

  selectedId = signal('');
  visited = signal(new Set<string>());
  busy = signal(false);
  error = signal('');
  selected = computed(() => this.nodes().find((n) => n.id === this.selectedId()) ?? null);

  /** Null shows everything. Progressive maps grow outwards from what has been opened. */
  visible = computed<Set<string> | null>(() => {
    if (this.content().settings.reveal !== 'progressive') return null;
    const shown = new Set([this.content().startId, ...this.visited()]);
    for (const edge of this.edges()) {
      if (this.visited().has(edge.from)) shown.add(edge.to);
      if (this.visited().has(edge.to)) shown.add(edge.from);
    }
    return shown;
  });

  links = computed(() => {
    const id = this.selectedId();
    const shown = this.visible();
    return this.edges().flatMap((edge) => {
      const outgoing = edge.from === id;
      if (!outgoing && edge.to !== id) return [];
      const node = this.nodes().find((n) => n.id === (outgoing ? edge.to : edge.from));
      if (!node || (shown && !shown.has(node.id))) return [];
      return [{ id: edge.id, node, label: edge.label, arrow: outgoing ? '→' : '←' }];
    });
  });

  canFinish = computed(() => {
    const required = this.content().settings.requireAll ? this.nodes().length : 1;
    return this.visited().size >= required;
  });

  constructor() {
    // Runs for the first load and again after a retake starts a fresh attempt.
    effect(() => {
      const attempt = this.store.session()!.attempt;
      untracked(() => {
        const saved = attempt.status === 'in_progress' ? (attempt.state ?? {}) : {};
        this.visited.set(new Set(saved.visited ?? []));
        this.selectedId.set(saved.selected ?? '');
      });
    });
  }

  open(id: string): void {
    this.selectedId.set(id);
    this.visited.update((set) => new Set(set).add(id));
    this.store.save({ visited: [...this.visited()], selected: id }, this.visited().size / this.nodes().length);
  }

  async finish(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.store.submit({ visited: [...this.visited()] });
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
