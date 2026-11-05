import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PlayAttempt, PlaySession, QuestionReview } from '../core/models';

const SAVE_DELAY_MS = 800;

/** The player's connection to the backend, shared by every type of player. */
@Injectable()
export class PlayStore {
  private http = inject(HttpClient);
  private token = '';
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: { state: unknown; progress: number };

  readonly session = signal<PlaySession | null>(null);
  readonly saveFailed = signal(false);

  private headers(): HttpHeaders {
    return new HttpHeaders({ 'X-Launch-Token': this.token });
  }

  async load(token: string): Promise<void> {
    this.token = token;
    this.session.set(await firstValueFrom(this.http.get<PlaySession>('api/play/session', { headers: this.headers() })));
  }

  check(id: string, answer: unknown): Promise<QuestionReview> {
    return firstValueFrom(this.http.post<QuestionReview>('api/play/check', { id, answer }, { headers: this.headers() }));
  }

  /** Debounced: players call this on every change so a closed tab loses little. */
  save(state: unknown, progress: number): void {
    this.pending = { state, progress };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
  }

  private async flush(): Promise<void> {
    const pending = this.pending;
    this.pending = undefined;
    if (!pending) return;
    try {
      await firstValueFrom(this.http.post('api/play/progress', pending, { headers: this.headers() }));
      this.saveFailed.set(false);
    } catch {
      this.saveFailed.set(true);
    }
  }

  async submit(answers: Record<string, unknown>): Promise<void> {
    clearTimeout(this.timer);
    this.pending = undefined;
    const res = await firstValueFrom(
      this.http.post<{ attempt: PlayAttempt; can_retake: boolean }>('api/play/submit', { answers }, { headers: this.headers() }),
    );
    this.apply(res);
  }

  async restart(): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<{ attempt: PlayAttempt; can_retake: boolean }>('api/play/restart', {}, { headers: this.headers() }),
    );
    this.apply(res);
  }

  private apply(res: { attempt: PlayAttempt; can_retake: boolean }): void {
    this.session.update((s) => (s ? { ...s, attempt: res.attempt, can_retake: res.can_retake } : s));
  }
}
