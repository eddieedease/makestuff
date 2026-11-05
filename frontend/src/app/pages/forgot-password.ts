import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { errorMessage } from '../core/auth';
import { AuthLayout } from './auth-layout';

@Component({
  imports: [FormsModule, RouterLink, AuthLayout],
  template: `
    <app-auth-layout heading="Reset your password">
      @if (sent()) {
        <p class="alert-ok">If that address has an account, a reset link is on its way.</p>
      } @else {
        <form class="space-y-4" (ngSubmit)="submit()">
          @if (error()) {
            <p class="alert-error" role="alert">{{ error() }}</p>
          }
          <label class="label">Email
            <input class="input" name="email" type="email" required [(ngModel)]="email" />
          </label>
          <button class="btn-primary w-full">Send reset link</button>
        </form>
      }
      <a class="mt-4 block text-center text-sm text-muted underline" routerLink="/login">Back to sign in</a>
    </app-auth-layout>
  `,
})
export class ForgotPassword {
  private api = inject(Api);
  email = '';
  sent = signal(false);
  error = signal('');

  async submit(): Promise<void> {
    try {
      await this.api.forgot(this.email);
      this.sent.set(true);
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }
}
