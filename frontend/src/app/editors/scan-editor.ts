import { Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TPipe } from '../i18n/i18n';

const uid = (prefix: string) => prefix + crypto.randomUUID().slice(0, 8);

@Component({
  imports: [FormsModule, TPipe],
  template: `
    <div class="max-w-4xl space-y-8">
      <section>
        <label class="label">{{ 'Introduction' | t }}
          <textarea class="input" rows="3" [placeholder]="'What is this scan for, and how long does it take?' | t" [(ngModel)]="content().intro" (ngModelChange)="touch()"></textarea>
        </label>
      </section>

      <section>
        <h2 class="text-xl font-semibold">{{ 'Categories' | t }}</h2>
        <p class="text-sm text-muted">{{ 'The themes of the scan. Each statement belongs to one, and learners get a percentage per category.' | t }}</p>
        <div class="mt-3 space-y-2">
          @for (c of content().categories; track c.id; let i = $index) {
            <div class="flex gap-2">
              <input class="input" [attr.aria-label]="'Category {n}' | t: { n: i + 1 }" [placeholder]="'For example: Teamwork' | t" [(ngModel)]="c.name" (ngModelChange)="touch()" />
              <button type="button" class="btn-quiet hover:!text-danger" (click)="removeCategory(i)">{{ 'Delete' | t }}</button>
            </div>
          }
        </div>
        <button type="button" class="btn-ghost mt-2" (click)="addCategory()">{{ 'Add category' | t }}</button>
      </section>

      <section>
        <h2 class="text-xl font-semibold">{{ 'Statements' | t }}</h2>
        <p class="text-sm text-muted">{{ 'Learners rate each one from 1 to 5. Mark a statement as reversed when agreeing with it is a low score.' | t }}</p>
        <div class="mt-3 space-y-2">
          @for (q of content().questions; track q.id; let i = $index) {
            <div class="card grid gap-2 p-3 sm:grid-cols-[1fr_11rem_auto] sm:items-center">
              <input class="input" [attr.aria-label]="'Statement {n}' | t: { n: i + 1 }" [placeholder]="'I can…' | t" [(ngModel)]="q.text" (ngModelChange)="touch()" />
              <select class="input" [attr.aria-label]="'Category' | t" [(ngModel)]="q.categoryId" (ngModelChange)="touch()">
                <option value="">{{ 'Choose category' | t }}</option>
                @for (c of content().categories; track c.id) {
                  <option [value]="c.id">{{ c.name || ('Unnamed' | t) }}</option>
                }
              </select>
              <div class="flex items-center gap-1">
                <label class="flex items-center gap-1 text-xs text-muted">
                  <input type="checkbox" class="accent-accent" [(ngModel)]="q.reversed" (ngModelChange)="touch()" /> {{ 'Reversed' | t }}
                </label>
                <button type="button" class="btn-quiet !px-2 !py-1 hover:!text-danger" [attr.aria-label]="'Delete statement {n}' | t: { n: i + 1 }" (click)="remove(content().questions, i)">✕</button>
              </div>
            </div>
          }
        </div>
        <button type="button" class="btn-ghost mt-2" (click)="addStatement()">{{ 'Add statement' | t }}</button>
      </section>

      <section>
        <h2 class="text-xl font-semibold">{{ 'Feedback per score range' | t }}</h2>
        <p class="text-sm text-muted">{{ 'Choose the percentages yourself. Ranges may touch, and a score on the boundary counts as the higher range.' | t }}</p>
        <div class="mt-3 space-y-5">
          @for (group of groups(); track group.id) {
            <div>
              <h3 class="font-sans text-sm font-semibold">{{ group.overall ? ('Overall score' | t) : group.name || ('Unnamed' | t) }}</h3>
              <div class="mt-2 space-y-2">
                @for (b of group.bands; track b.id) {
                  <div class="card space-y-2 p-3">
                    <div class="flex flex-wrap items-center gap-2">
                      <label class="flex items-center gap-1 text-xs text-muted">{{ 'From' | t }}
                        <input class="input !w-20 !py-1" type="number" min="0" max="100" [(ngModel)]="b.min" (ngModelChange)="touch()" />
                      </label>
                      <label class="flex items-center gap-1 text-xs text-muted">{{ 'to' | t }}
                        <input class="input !w-20 !py-1" type="number" min="0" max="100" [(ngModel)]="b.max" (ngModelChange)="touch()" /> %
                      </label>
                      <button type="button" class="btn-quiet ml-auto !px-2 !py-1 hover:!text-danger" (click)="removeBand(b)">{{ 'Delete' | t }}</button>
                    </div>
                    <input class="input" [attr.aria-label]="'Heading' | t" [placeholder]="'Heading' | t" [(ngModel)]="b.title" (ngModelChange)="touch()" />
                    <textarea class="input" rows="2" [attr.aria-label]="'Feedback' | t" [placeholder]="'Feedback for this range' | t" [(ngModel)]="b.advice" (ngModelChange)="touch()"></textarea>
                  </div>
                }
              </div>
              <button type="button" class="btn-quiet mt-1 !px-2 !py-1" (click)="addBand(group.id)">{{ 'Add range' | t }}</button>
            </div>
          }
        </div>
      </section>

      <section>
        <h2 class="text-xl font-semibold">{{ 'Rating scale' | t }}</h2>
        <p class="text-sm text-muted">{{ 'Always 1 to 5. You can change the labels.' | t }}</p>
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          @for (s of content().scale; track s.value) {
            <label class="flex items-center gap-2 text-sm">
              <span class="w-4 tabular-nums text-muted">{{ s.value }}</span>
              <input class="input" [attr.aria-label]="'Label for value {n}' | t: { n: s.value }" [(ngModel)]="s.label" (ngModelChange)="touch()" />
            </label>
          }
        </div>
      </section>
    </div>
  `,
})
export class ScanEditor {
  content = input.required<any>();
  changed = input.required<() => void>();
  private version = signal(0);

  /** Overall first, then one group per category, each sorted by percentage. */
  groups = computed(() => {
    this.version();
    const { categories, bands } = this.content();
    const of = (id: string) => bands.filter((b: any) => (b.categoryId ?? '') === id).sort((a: any, b: any) => a.min - b.min);
    return [
      { id: '', name: '', overall: true, bands: of('') },
      ...categories.map((c: any) => ({ id: c.id, name: c.name, overall: false, bands: of(c.id) })),
    ];
  });

  touch(): void {
    this.version.update((v) => v + 1);
    this.changed()();
  }

  addCategory(): void {
    this.content().categories.push({ id: uid('c'), name: '' });
    this.touch();
  }

  removeCategory(index: number): void {
    const [category] = this.content().categories.splice(index, 1);
    this.content().bands = this.content().bands.filter((b: any) => b.categoryId !== category.id);
    for (const question of this.content().questions) {
      if (question.categoryId === category.id) question.categoryId = '';
    }
    this.touch();
  }

  addStatement(): void {
    this.content().questions.push({ id: uid('s'), text: '', categoryId: this.content().categories.at(-1)?.id ?? '', reversed: false });
    this.touch();
  }

  addBand(categoryId: string): void {
    const last = this.groups().find((g) => g.id === categoryId)?.bands.at(-1);
    const min = last ? Math.min(last.max, 99) : 0;
    this.content().bands.push({ id: uid('b'), categoryId, min, max: 100, title: '', advice: '' });
    this.touch();
  }

  removeBand(band: any): void {
    this.content().bands = this.content().bands.filter((b: any) => b !== band);
    this.touch();
  }

  remove(list: unknown[], index: number): void {
    list.splice(index, 1);
    this.touch();
  }
}
