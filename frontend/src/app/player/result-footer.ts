import { Component, inject, signal } from '@angular/core';
import { errorMessage } from '../core/auth';
import { PlayStore } from './play-store';

/** Shared end of every player: grade delivery status and the retake button. */
@Component({
  selector: 'app-result-footer',
  template: `
    @if (store.session(); as s) {
      @switch (s.attempt.passback_status) {
        @case ('sent') { <p class="alert-ok mt-5">Your result has been sent to your course.</p> }
        @case ('failed') { <p class="alert-error mt-5">Your result is saved here, but it could not be sent to your course. Let your teacher know.</p> }
      }
      @if (error()) { <p class="alert-error mt-3" role="alert">{{ error() }}</p> }
      @if (s.can_retake) {
        <button type="button" class="btn-ghost mt-5" [disabled]="busy()" (click)="retake()">Start again</button>
      }
    }
  `,
})
export class ResultFooter {
  store = inject(PlayStore);
  busy = signal(false);
  error = signal('');

  async retake(): Promise<void> {
    this.busy.set(true);
    try {
      await this.store.restart();
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
