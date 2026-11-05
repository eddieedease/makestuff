import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { errorMessage } from '../core/auth';
import { NumPipe, TPipe } from '../i18n/i18n';
import { CategoryScores } from '../shared/category-scores';
import { PlayStore } from './play-store';
import { ResultFooter } from './result-footer';

interface Card { id: string; text: string }
interface Target { id: string; label: string }

const DRAG_THRESHOLD = 5;
/** The tray is a target too, so cards can be taken back. */
const TRAY = '';

/**
 * Uses pointer events rather than the HTML drag API, which does not work on
 * touch screens. Choosing a card and then a spot does the same as dragging,
 * so it also works by keyboard and for people who cannot drag.
 */
@Component({
  imports: [CategoryScores, NgTemplateOutlet, NumPipe, ResultFooter, TPipe],
  template: `
    <ng-template #cardTpl let-card>
      <button
        type="button"
        class="touch-none select-none rounded-lg border bg-surface px-3 py-2 text-left text-sm font-medium shadow-sm transition-colors"
        [class]="selectedId() === card.id ? 'border-accent ring-2 ring-accent' : 'border-line-strong hover:border-accent'"
        [class.relative]="drag()?.id === card.id"
        [class.z-50]="drag()?.id === card.id"
        [class.cursor-grabbing]="drag()?.id === card.id"
        [class.cursor-grab]="drag()?.id !== card.id"
        [style.transform]="drag()?.id === card.id ? 'translate(' + drag()!.dx + 'px,' + drag()!.dy + 'px) rotate(1deg)' : null"
        [attr.aria-pressed]="selectedId() === card.id"
        [attr.data-dragging]="drag()?.id === card.id ? '' : null"
        (pointerdown)="down($event, card.id)"
        (pointermove)="moveDrag($event)"
        (pointerup)="up($event)"
        (pointercancel)="cancel()"
        (click)="clickCard($event, card.id)"
      >{{ card.text }}</button>
    </ng-template>

    @if (result(); as r) {
      <section class="card p-6">
        <p class="font-display text-5xl font-semibold tabular-nums">{{ r.percentage | num }}%</p>
        <p class="mt-1 font-semibold" [class]="passed() ? 'text-accent' : 'text-danger'">{{ (passed() ? 'You passed' : 'Not passed yet') | t }}</p>
        <p class="text-sm text-muted">{{ '{correct} of {total} in the right place.' | t: { correct: r.correct, total: r.total } }}</p>
        <app-result-footer />
      </section>
      @if (r.categories?.length) {
        <h2 class="mt-8 text-xl font-semibold">{{ 'Score per category' | t }}</h2>
        <div class="mt-3"><app-category-scores [categories]="r.categories" /></div>
      }
      <h2 class="mt-8 text-xl font-semibold">{{ 'Your answers' | t }}</h2>
      <ul class="mt-3 space-y-2">
        @for (c of r.cards; track $index) {
          <li class="card flex gap-3 p-3 text-sm">
            <span class="font-semibold" [class]="c.correct ? 'text-accent' : 'text-danger'">{{ c.correct ? '✓' : '✕' }}</span>
            <span class="sr-only">{{ (c.correct ? 'Correct' : 'Not quite') | t }}</span>
            <span class="min-w-0">
              <span class="font-medium">{{ c.text }}</span>
              @if (c.answer && !c.correct) {
                <span class="block text-muted">{{ 'Belongs with: {answer}' | t: { answer: c.answer } }}</span>
              }
              @if (c.feedback) { <span class="block text-muted">{{ c.feedback }}</span> }
            </span>
          </li>
        }
      </ul>
    } @else {
      @if (content().intro) { <p class="mb-3 text-sm text-muted">{{ content().intro }}</p> }

      <section class="rounded-xl border border-dashed border-line-strong p-3" [attr.data-target]="tray" (click)="clickZone(tray)" [attr.aria-label]="'Cards to place' | t">
        <div class="flex min-h-11 flex-wrap gap-2">
          @for (c of loose(); track c.id) {
            <ng-container [ngTemplateOutlet]="cardTpl" [ngTemplateOutletContext]="{ $implicit: c }" />
          } @empty {
            <p class="self-center text-sm text-muted">{{ 'All cards are placed.' | t }}</p>
          }
        </div>
      </section>

      <p class="mt-2 min-h-5 text-xs text-muted" aria-live="polite">
        {{ selectedCard() ? ('"{card}" selected. Choose where it goes.' | t: { card: selectedCard()!.text }) : ('Drag a card, or select it and then select a spot.' | t) }}
      </p>

      <div class="mt-2 gap-3" [class]="mode() === 'sort' ? 'grid sm:grid-cols-2 lg:grid-cols-3' : 'space-y-2'">
        @for (target of content().targets; track target.id) {
          <section
            class="rounded-xl border bg-surface p-3 transition-colors"
            [class]="(overId() === target.id ? 'border-accent bg-accent-soft/50' : 'border-line') + (mode() === 'sort' ? '' : ' flex items-center gap-3')"
            [attr.data-target]="target.id"
            (click)="clickZone(target.id)"
          >
            <h3 class="font-sans text-sm font-semibold" [class]="mode() === 'match' ? 'w-2/5 shrink-0' : mode() === 'order' ? 'w-6 shrink-0 text-center tabular-nums text-muted' : ''">{{ target.label }}</h3>
            <div class="flex min-h-11 flex-1 flex-wrap items-center gap-2" [class.mt-2]="mode() === 'sort'">
              @for (c of cardsIn(target.id); track c.id) {
                <ng-container [ngTemplateOutlet]="cardTpl" [ngTemplateOutletContext]="{ $implicit: c }" />
              } @empty {
                <span class="text-xs text-muted">{{ 'Drop here' | t }}</span>
              }
              @if (selectedId() && placements()[selectedId()] !== target.id) {
                <button type="button" class="btn-ghost !px-2 !py-1 !text-xs" (click)="placeSelected($event, target.id)">{{ 'Place here' | t }}</button>
              }
            </div>
          </section>
        }
      </div>

      @if (error()) { <p class="alert-error mt-3" role="alert">{{ error() }}</p> }
      <div class="mt-4 flex justify-end">
        <button type="button" class="btn-primary" [disabled]="busy() || loose().length > 0" (click)="submit()">{{ 'Check my answers' | t }}</button>
      </div>
    }
  `,
})
export class DragDropPlayer {
  store = inject(PlayStore);
  content = computed(() => this.store.session()!.object.content);
  mode = computed<string>(() => this.content().settings.mode);
  cards = computed<Card[]>(() => this.content().cards);
  result = computed(() => this.store.session()!.attempt.result?.detail ?? null);
  passed = computed(() => this.store.session()!.attempt.result?.passed === true);
  tray = TRAY;

  /** card id to target id; loose cards have no entry. */
  placements = signal<Record<string, string>>({});
  selectedId = signal('');
  drag = signal<{ id: string; dx: number; dy: number } | null>(null);
  overId = signal<string | null>(null);
  busy = signal(false);
  error = signal('');

  loose = computed(() => this.cards().filter((c) => !this.placements()[c.id]));
  selectedCard = computed(() => this.cards().find((c) => c.id === this.selectedId()) ?? null);

  private press: { id: string; x: number; y: number } | null = null;
  private justDragged = false;

  constructor() {
    // Runs for the first load and again after a retake starts a fresh attempt.
    effect(() => {
      const attempt = this.store.session()!.attempt;
      untracked(() => {
        this.placements.set(attempt.status === 'in_progress' ? (attempt.state?.placements ?? {}) : {});
        this.selectedId.set('');
      });
    });
  }

  cardsIn(targetId: string): Card[] {
    const placed = this.placements();
    return this.cards().filter((c) => placed[c.id] === targetId);
  }

  private place(cardId: string, targetId: string): void {
    const next = { ...this.placements() };
    if (targetId === TRAY) {
      delete next[cardId];
    } else {
      // Match and order take one card per spot: the previous card returns to the tray.
      if (this.mode() !== 'sort') {
        for (const [id, target] of Object.entries(next)) {
          if (target === targetId) delete next[id];
        }
      }
      next[cardId] = targetId;
    }
    this.placements.set(next);
    this.selectedId.set('');
    this.store.save({ placements: next }, Object.keys(next).length / this.cards().length);
  }

  private targetAt(x: number, y: number): string | null {
    for (const element of document.elementsFromPoint(x, y)) {
      // The dragged card is under the pointer but still lives in its old spot.
      if (element.closest('[data-dragging]')) continue;
      const zone = element.closest<HTMLElement>('[data-target]');
      if (zone) return zone.dataset['target'] ?? null;
    }
    return null;
  }

  down(event: PointerEvent, id: string): void {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.press = { id, x: event.clientX, y: event.clientY };
  }

  moveDrag(event: PointerEvent): void {
    const press = this.press;
    if (!press) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (!this.drag() && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    this.drag.set({ id: press.id, dx, dy });
    this.overId.set(this.targetAt(event.clientX, event.clientY));
  }

  up(event: PointerEvent): void {
    const dragged = this.drag();
    if (dragged) {
      const target = this.targetAt(event.clientX, event.clientY);
      if (target !== null) this.place(dragged.id, target);
      this.justDragged = true;
    }
    this.cancel();
  }

  cancel(): void {
    this.press = null;
    this.drag.set(null);
    this.overId.set(null);
  }

  clickCard(event: Event, id: string): void {
    event.stopPropagation();
    if (this.justDragged) {
      this.justDragged = false;
      return;
    }
    this.selectedId.set(this.selectedId() === id ? '' : id);
  }

  clickZone(targetId: string): void {
    if (this.selectedId()) this.place(this.selectedId(), targetId);
  }

  placeSelected(event: Event, targetId: string): void {
    event.stopPropagation();
    this.place(this.selectedId(), targetId);
  }

  async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.store.submit({ placements: this.placements() });
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
