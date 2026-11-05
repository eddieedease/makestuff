import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { errorMessage } from '../core/auth';
import { AuthLayout } from './auth-layout';
import { TPipe } from '../i18n/i18n';

@Component({
  imports: [FormsModule, RouterLink, AuthLayout, TPipe],
  template: `
    <app-auth-layout [heading]="'Choose a new password' | t">
      @if (done()) {
        <p class="alert-ok">{{ 'Your password has been changed.' | t }}</p>
        <a class="btn-primary mt-4 w-full" routerLink="/login">{{ 'Sign in' | t }}</a>
      } @else {
        <form class="space-y-4" (ngSubmit)="submit()">
          @if (error()) {
            <p class="alert-error" role="alert">{{ error() }}</p>
          }
          <label class="label">{{ 'New password' | t }}
            <input class="input" name="password" type="password" autocomplete="new-password" minlength="8" required [(ngModel)]="password" />
            <span class="hint">{{ 'At least 8 characters.' | t }}</span>
          </label>
          <button class="btn-primary w-full">{{ 'Change password' | t }}</button>
        </form>
      }
    </app-auth-layout>
  `,
})
export class ResetPassword {
  private api = inject(Api);
  token = input.required<string>();
  password = '';
  done = signal(false);
  error = signal('');

  async submit(): Promise<void> {
    try {
      await this.api.reset(this.token(), this.password);
      this.done.set(true);
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }
}
