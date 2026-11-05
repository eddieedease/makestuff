import { NgComponentOutlet } from '@angular/common';
import { Component, inject, input, OnInit, signal, Type } from '@angular/core';
import { errorMessage } from '../core/auth';
import { learningType } from '../core/learning-types';
import { TPipe, setLocale } from '../i18n/i18n';
import { PlayStore } from './play-store';

/** Entry point for learners. This is what an LMS shows in its iframe. */
@Component({
  imports: [NgComponentOutlet, TPipe],
  providers: [PlayStore],
  template: `
    @if (store.session(); as s) {
      @if (s.preview) {
        <p class="bg-warn-soft px-4 py-1.5 text-center text-xs font-medium text-warn">{{ 'Preview of your draft. Nothing is recorded.' | t }}</p>
      }
      <div class="mx-auto max-w-3xl px-4 py-6">
        <h1 class="text-2xl font-semibold sm:text-3xl">{{ s.object.title }}</h1>
        @if (store.saveFailed()) {
          <p class="alert-error mt-3" role="alert">{{ 'Your progress could not be saved. Check your connection.' | t }}</p>
        }
        <div class="mt-5">
          @if (player(); as component) {
            <ng-container *ngComponentOutlet="component" />
          }
        </div>
      </div>
    } @else if (error()) {
      <main class="mx-auto max-w-md px-4 py-16 text-center">
        <h1 class="text-2xl font-semibold">{{ "This activity can't be opened" | t }}</h1>
        <p class="mt-2 text-sm text-muted">{{ error() }}</p>
      </main>
    } @else {
      <p class="px-4 py-16 text-center text-sm text-muted">{{ 'Loading…' | t }}</p>
    }
  `,
})
export class PlayerPage implements OnInit {
  store = inject(PlayStore);
  token = input.required<string>();
  player = signal<Type<unknown> | null>(null);
  error = signal('');

  async ngOnInit(): Promise<void> {
    try {
      await this.store.load(this.token());
      setLocale(this.store.session()!.locale, false);
      this.player.set((await learningType(this.store.session()!.object.type)?.player()) ?? null);
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }
}
