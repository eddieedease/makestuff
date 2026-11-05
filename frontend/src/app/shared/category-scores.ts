import { Component, input } from '@angular/core';
import { NumPipe } from '../i18n/i18n';

export interface CategoryScore {
  id: string;
  name: string;
  percentage: number;
  band?: { title: string; advice: string } | null;
}

/** Score per category, shared by quiz and scan results. */
@Component({
  selector: 'app-category-scores',
  imports: [NumPipe],
  template: `
    <div class="space-y-3">
      @for (c of categories(); track c.id) {
        <section class="card p-4">
          <div class="flex items-baseline justify-between gap-3">
            <h3 class="font-sans text-sm font-semibold">{{ c.name }}</h3>
            <span class="text-sm tabular-nums text-muted">{{ c.percentage | num }}%</span>
          </div>
          <div class="mt-2 h-2 overflow-hidden rounded-full bg-line" role="img" [attr.aria-label]="c.name + ': ' + c.percentage + '%'">
            <div class="h-full rounded-full bg-accent" [style.width.%]="c.percentage"></div>
          </div>
          @if (c.band; as b) {
            <p class="mt-2 text-sm"><span class="font-semibold">{{ b.title }}.</span> {{ b.advice }}</p>
          }
        </section>
      }
    </div>
  `,
})
export class CategoryScores {
  categories = input.required<CategoryScore[]>();
}
