import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../core/auth';
import { learningType } from '../core/learning-types';
import { TPipe } from '../i18n/i18n';

interface Pickable { public_id: string; type: string; title: string; description: string }

/** LTI 1.3 Deep Linking: shown inside the LMS when a teacher adds an activity. */
@Component({
  imports: [TPipe],
  template: `
    <main class="mx-auto max-w-2xl px-4 py-6">
      <h1 class="text-2xl font-semibold">{{ 'Choose an activity' | t }}</h1>
      @if (context()) { <p class="mt-1 text-sm text-muted">{{ 'For {course}' | t: { course: context() ?? '' } }}</p> }
      @if (error()) { <p class="alert-error mt-4" role="alert">{{ error() }}</p> }
      <ul class="mt-4 space-y-2">
        @for (o of objects(); track o.public_id) {
          <li>
            <button type="button" class="card w-full p-4 text-left hover:border-accent disabled:opacity-60" [disabled]="busy()" (click)="choose(o)">
              <span class="pill" [class]="tag(o.type)">{{ label(o.type) | t }}</span>
              <span class="mt-1 block font-medium">{{ o.title }}</span>
              @if (o.description) { <span class="block text-sm text-muted">{{ o.description }}</span> }
            </button>
          </li>
        } @empty {
          @if (loaded()) { <li class="text-sm text-muted">{{ 'Nothing is published yet.' | t }}</li> }
        }
      </ul>
    </main>
  `,
})
export class Pick implements OnInit {
  private http = inject(HttpClient);
  token = input.required<string>();
  objects = signal<Pickable[]>([]);
  context = signal<string | null>(null);
  loaded = signal(false);
  busy = signal(false);
  error = signal('');

  label = (key: string) => learningType(key)?.label ?? key;
  tag = (key: string) => learningType(key)?.tag ?? 'bg-line text-muted';

  private headers(): HttpHeaders {
    return new HttpHeaders({ 'X-Launch-Token': this.token() });
  }

  async ngOnInit(): Promise<void> {
    try {
      const res = await firstValueFrom(this.http.get<{ objects: Pickable[]; context: string | null }>('api/pick', { headers: this.headers() }));
      this.objects.set(res.objects);
      this.context.set(res.context);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loaded.set(true);
    }
  }

  async choose(object: Pickable): Promise<void> {
    this.busy.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{ return_url: string; jwt: string }>('api/pick', { public_ids: [object.public_id] }, { headers: this.headers() }),
      );
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = res.return_url;
      const field = document.createElement('input');
      field.type = 'hidden';
      field.name = 'JWT';
      field.value = res.jwt;
      form.append(field);
      document.body.append(form);
      form.submit();
    } catch (e) {
      this.error.set(errorMessage(e));
      this.busy.set(false);
    }
  }
}
