import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { Api } from '../core/api';
import { Attempt } from '../core/models';

@Component({
  selector: 'app-results-panel',
  imports: [DatePipe, DecimalPipe],
  template: `
    @if (!loading() && !attempts().length) {
      <p class="text-sm text-muted">No results yet. Learners appear here after they open this item from an LMS. Previews are not recorded.</p>
    } @else if (attempts().length) {
      <dl class="mb-4 grid max-w-xl grid-cols-3 gap-3">
        <div class="card p-3"><dt class="text-xs text-muted">Started</dt><dd class="font-display text-2xl font-semibold">{{ attempts().length }}</dd></div>
        <div class="card p-3"><dt class="text-xs text-muted">Completed</dt><dd class="font-display text-2xl font-semibold">{{ completed().length }}</dd></div>
        <div class="card p-3"><dt class="text-xs text-muted">Average score</dt><dd class="font-display text-2xl font-semibold">{{ average() === null ? '–' : (average()! * 100 | number: '1.0-0') + '%' }}</dd></div>
      </dl>
      <div class="card overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-line text-xs text-muted">
            <tr><th class="px-4 py-2 font-medium">Learner</th><th class="px-4 py-2 font-medium">Course</th><th class="px-4 py-2 font-medium">Status</th><th class="px-4 py-2 font-medium">Score</th><th class="px-4 py-2 font-medium">Sent to LMS</th><th class="px-4 py-2 font-medium">Started</th></tr>
          </thead>
          <tbody class="divide-y divide-line">
            @for (a of attempts(); track a.id) {
              <tr>
                <td class="px-4 py-2">{{ a.learner }}</td>
                <td class="px-4 py-2 text-muted">{{ a.course ?? '–' }}<span class="block text-xs">{{ a.lms }}</span></td>
                <td class="px-4 py-2">{{ a.status === 'completed' ? 'Completed' : 'In progress (' + (a.progress * 100 | number: '1.0-0') + '%)' }}</td>
                <td class="px-4 py-2 tabular-nums">{{ a.score === null ? '–' : (a.score * 100 | number: '1.0-0') + '%' }}</td>
                <td class="px-4 py-2">
                  @switch (a.passback_status) {
                    @case ('sent') { <span class="text-accent">Sent</span> }
                    @case ('failed') { <span class="text-danger" [title]="a.passback_error ?? ''">Failed</span> }
                    @default { <span class="text-muted">–</span> }
                  }
                </td>
                <td class="px-4 py-2 whitespace-nowrap text-muted">{{ a.started_at + 'Z' | date: 'd MMM y, HH:mm' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class ResultsPanel implements OnInit {
  private api = inject(Api);
  objectId = input.required<number>();
  attempts = signal<Attempt[]>([]);
  loading = signal(true);
  completed = computed(() => this.attempts().filter((a) => a.status === 'completed'));
  average = computed(() => {
    const scores = this.completed().map((a) => a.score ?? 0);
    return scores.length ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null;
  });

  async ngOnInit(): Promise<void> {
    this.attempts.set(await this.api.results(this.objectId()));
    this.loading.set(false);
  }
}
