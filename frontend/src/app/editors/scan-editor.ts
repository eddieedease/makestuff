import { Component, input } from '@angular/core';
import { FormsModule } from '@angular/forms';

const uid = (prefix: string) => prefix + crypto.randomUUID().slice(0, 8);

@Component({
  imports: [FormsModule],
  template: `
    <div class="max-w-4xl space-y-8">
      <section>
        <label class="label">Introduction
          <textarea class="input" rows="3" placeholder="What is this scan for, and how long does it take?" [(ngModel)]="content().intro" (ngModelChange)="changed()()"></textarea>
        </label>
      </section>

      <section>
        <h2 class="text-xl font-semibold">Dimensions</h2>
        <p class="text-sm text-muted">The themes of the profile. Each statement belongs to one.</p>
        <div class="mt-3 space-y-2">
          @for (d of content().dimensions; track d.id; let i = $index) {
            <div class="flex gap-2">
              <input class="input" [attr.aria-label]="'Dimension ' + (i + 1)" placeholder="For example: Teamwork" [(ngModel)]="d.name" (ngModelChange)="changed()()" />
              <button type="button" class="btn-quiet hover:!text-danger" (click)="remove(content().dimensions, i)">Delete</button>
            </div>
          }
        </div>
        <button type="button" class="btn-ghost mt-2" (click)="addDimension()">Add dimension</button>
      </section>

      <section>
        <h2 class="text-xl font-semibold">Statements</h2>
        <p class="text-sm text-muted">Learners rate each one. Mark a statement as reversed when agreeing with it is a low score.</p>
        <div class="mt-3 space-y-2">
          @for (q of content().questions; track q.id; let i = $index) {
            <div class="card grid gap-2 p-3 sm:grid-cols-[1fr_11rem_auto] sm:items-center">
              <input class="input" [attr.aria-label]="'Statement ' + (i + 1)" placeholder="I can…" [(ngModel)]="q.text" (ngModelChange)="changed()()" />
              <select class="input" aria-label="Dimension" [(ngModel)]="q.dimensionId" (ngModelChange)="changed()()">
                <option value="">Choose dimension</option>
                @for (d of content().dimensions; track d.id) {
                  <option [value]="d.id">{{ d.name || 'Unnamed' }}</option>
                }
              </select>
              <div class="flex items-center gap-1">
                <label class="flex items-center gap-1 text-xs text-muted">
                  <input type="checkbox" class="accent-accent" [(ngModel)]="q.reversed" (ngModelChange)="changed()()" /> Reversed
                </label>
                <button type="button" class="btn-quiet !px-2 !py-1 hover:!text-danger" [attr.aria-label]="'Delete statement ' + (i + 1)" (click)="remove(content().questions, i)">✕</button>
              </div>
            </div>
          }
        </div>
        <button type="button" class="btn-ghost mt-2" (click)="addStatement()">Add statement</button>
      </section>

      <section>
        <h2 class="text-xl font-semibold">Advice</h2>
        <p class="text-sm text-muted">Text shown for a score range, overall or per dimension.</p>
        <div class="mt-3 space-y-2">
          @for (b of content().bands; track b.id; let i = $index) {
            <div class="card space-y-2 p-3">
              <div class="flex flex-wrap items-center gap-2">
                <select class="input !w-auto" aria-label="Applies to" [(ngModel)]="b.dimensionId" (ngModelChange)="changed()()">
                  <option value="">Overall score</option>
                  @for (d of content().dimensions; track d.id) {
                    <option [value]="d.id">{{ d.name || 'Unnamed' }}</option>
                  }
                </select>
                <label class="flex items-center gap-1 text-xs text-muted">From
                  <input class="input !w-20 !py-1" type="number" min="0" max="100" [(ngModel)]="b.min" (ngModelChange)="changed()()" />
                </label>
                <label class="flex items-center gap-1 text-xs text-muted">to
                  <input class="input !w-20 !py-1" type="number" min="0" max="100" [(ngModel)]="b.max" (ngModelChange)="changed()()" /> %
                </label>
                <button type="button" class="btn-quiet ml-auto !px-2 !py-1 hover:!text-danger" (click)="remove(content().bands, i)">Delete</button>
              </div>
              <input class="input" aria-label="Heading" placeholder="Heading" [(ngModel)]="b.title" (ngModelChange)="changed()()" />
              <textarea class="input" rows="2" aria-label="Advice" placeholder="Advice" [(ngModel)]="b.advice" (ngModelChange)="changed()()"></textarea>
            </div>
          }
        </div>
        <button type="button" class="btn-ghost mt-2" (click)="addBand()">Add advice</button>
      </section>

      <section>
        <h2 class="text-xl font-semibold">Rating scale</h2>
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          @for (s of content().scale; track $index; let i = $index) {
            <label class="flex items-center gap-2 text-sm">
              <span class="w-4 text-muted tabular-nums">{{ s.value }}</span>
              <input class="input" [attr.aria-label]="'Label for value ' + s.value" [(ngModel)]="s.label" (ngModelChange)="changed()()" />
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

  addDimension(): void {
    this.content().dimensions.push({ id: uid('d'), name: '' });
    this.changed()();
  }

  addStatement(): void {
    const dimensions = this.content().dimensions;
    this.content().questions.push({ id: uid('s'), text: '', dimensionId: dimensions.at(-1)?.id ?? '', reversed: false });
    this.changed()();
  }

  addBand(): void {
    this.content().bands.push({ id: uid('b'), dimensionId: '', min: 0, max: 100, title: '', advice: '' });
    this.changed()();
  }

  remove(list: unknown[], index: number): void {
    list.splice(index, 1);
    this.changed()();
  }
}
