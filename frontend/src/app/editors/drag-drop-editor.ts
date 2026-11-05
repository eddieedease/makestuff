import { Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TPipe } from '../i18n/i18n';

const uid = (prefix: string) => prefix + crypto.randomUUID().slice(0, 8);

interface Card {
  id: string;
  text: string;
  feedback: string;
  categoryId: string;
  prompt: string;
}

@Component({
  imports: [FormsModule, TPipe],
  template: `
    <div class="grid max-w-5xl gap-6 lg:grid-cols-[1fr_15rem]">
      <div class="min-w-0 space-y-5 lg:order-1">
        <section class="grid gap-2 sm:grid-cols-3" role="group" [attr.aria-label]="'Kind of exercise' | t">
          @for (m of modes; track m.key) {
            <button
              type="button"
              class="card p-3 text-left text-sm transition-colors"
              [class]="mode() === m.key ? '!border-accent bg-accent-soft' : 'hover:border-line-strong'"
              [attr.aria-pressed]="mode() === m.key"
              (click)="setMode(m.key)"
            >
              <span class="block font-semibold">{{ m.label | t }}</span>
              <span class="mt-0.5 block text-xs text-muted">{{ m.hint | t }}</span>
            </button>
          }
        </section>

        <label class="label">{{ 'Instruction' | t }}
          <input class="input" [placeholder]="'Optional' | t" [(ngModel)]="content().intro" (ngModelChange)="changed()()" />
        </label>

        @if (mode() === 'sort') {
          <section>
            <h2 class="font-sans text-sm font-semibold">{{ 'Categories' | t }}</h2>
            <div class="mt-2 grid gap-2 sm:grid-cols-2">
              @for (c of content().categories; track c.id; let i = $index) {
                <div class="flex gap-1">
                  <input class="input" [attr.aria-label]="'Category {n}' | t: { n: i + 1 }" [placeholder]="'Category {n}' | t: { n: i + 1 }" [(ngModel)]="c.name" (ngModelChange)="touch()" />
                  <button type="button" class="btn-quiet !px-2" [attr.aria-label]="'Delete category {n}' | t: { n: i + 1 }" (click)="removeCategory(i)">✕</button>
                </div>
              }
            </div>
            <button type="button" class="btn-quiet mt-1 !px-2 !py-1" (click)="addCategory()">{{ 'Add category' | t }}</button>
          </section>
        }

        <section>
          <h2 class="font-sans text-sm font-semibold">{{ 'Cards' | t }}</h2>
          @if (mode() === 'order') {
            <p class="hint">{{ 'Enter the steps in the right order. Learners get them shuffled.' | t }}</p>
          }
          <div class="mt-2 space-y-2">
            @for (item of items(); track item.id; let i = $index) {
              <div class="card space-y-2 p-3">
                <div class="flex items-center gap-2">
                  <span class="w-5 shrink-0 text-center text-xs tabular-nums text-muted">{{ i + 1 }}</span>
                  @if (mode() === 'match') {
                    <input class="input" [attr.aria-label]="'Matches with' | t" [placeholder]="'Matches with' | t" [(ngModel)]="item.prompt" (ngModelChange)="changed()()" />
                  }
                  <input class="input" [attr.aria-label]="'Card {n}' | t: { n: i + 1 }" [placeholder]="'Text on the card' | t" [(ngModel)]="item.text" (ngModelChange)="changed()()" />
                  @if (mode() === 'sort') {
                    <select class="input !w-44 shrink-0" [attr.aria-label]="'Category' | t" [(ngModel)]="item.categoryId" (ngModelChange)="changed()()">
                      <option value="">{{ 'Choose category' | t }}</option>
                      @for (c of content().categories; track c.id) {
                        <option [value]="c.id">{{ c.name || ('Unnamed' | t) }}</option>
                      }
                    </select>
                  }
                  @if (mode() === 'order') {
                    <button type="button" class="btn-quiet !px-2" [attr.aria-label]="'Move up' | t" [disabled]="i === 0" (click)="move(i, -1)">↑</button>
                    <button type="button" class="btn-quiet !px-2" [attr.aria-label]="'Move down' | t" [disabled]="i === items().length - 1" (click)="move(i, 1)">↓</button>
                  }
                  <button type="button" class="btn-quiet !px-2" [attr.aria-label]="'Delete card {n}' | t: { n: i + 1 }" (click)="remove(i)">✕</button>
                </div>
                <input class="input" [attr.aria-label]="'Feedback for card {n}' | t: { n: i + 1 }" [placeholder]="'Feedback (optional)' | t" [(ngModel)]="item.feedback" (ngModelChange)="changed()()" />
              </div>
            } @empty {
              <p class="card px-4 py-8 text-center text-sm text-muted">{{ 'No cards yet.' | t }}</p>
            }
          </div>
          <button type="button" class="btn-ghost mt-2" (click)="add()">{{ 'Add card' | t }}</button>
        </section>
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
        <label class="flex items-start gap-2 text-sm">
          <input type="checkbox" class="mt-1 accent-accent" [(ngModel)]="content().settings.showAnswers" (ngModelChange)="changed()()" />
          <span>{{ 'Show answers afterwards' | t }}<span class="hint">{{ 'Turn off if learners may retake it.' | t }}</span></span>
        </label>
      </aside>
    </div>
  `,
})
export class DragDropEditor {
  content = input.required<any>();
  changed = input.required<() => void>();
  private version = signal(0);

  modes = [
    { key: 'sort', label: 'Sort', hint: 'Cards go into categories.' },
    { key: 'match', label: 'Match', hint: 'Each card goes with one other.' },
    { key: 'order', label: 'Order', hint: 'Cards go in the right sequence.' },
  ];

  mode = computed<string>(() => {
    this.version();
    return this.content().settings.mode;
  });

  items = computed<Card[]>(() => {
    this.version();
    return this.content().items;
  });

  touch(): void {
    this.version.update((v) => v + 1);
    this.changed()();
  }

  /** Cards stay when switching mode, so trying another mode loses nothing. */
  setMode(mode: string): void {
    this.content().settings.mode = mode;
    this.touch();
  }

  add(): void {
    this.content().items = [...this.content().items, { id: uid('i'), text: '', feedback: '', categoryId: this.content().categories.at(-1)?.id ?? '', prompt: '' }];
    this.touch();
  }

  remove(index: number): void {
    this.content().items = this.content().items.filter((_: Card, i: number) => i !== index);
    this.touch();
  }

  move(index: number, delta: number): void {
    const items = [...this.content().items];
    const [item] = items.splice(index, 1);
    items.splice(index + delta, 0, item);
    this.content().items = items;
    this.touch();
  }

  addCategory(): void {
    this.content().categories.push({ id: uid('c'), name: '' });
    this.touch();
  }

  removeCategory(index: number): void {
    const [category] = this.content().categories.splice(index, 1);
    for (const item of this.content().items as Card[]) {
      if (item.categoryId === category.id) item.categoryId = '';
    }
    this.touch();
  }
}
