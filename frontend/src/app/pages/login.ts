import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth, errorMessage } from '../core/auth';
import { AuthLayout } from './auth-layout';

@Component({
  imports: [FormsModule, RouterLink, AuthLayout],
  template: `
    <app-auth-layout heading="Sign in">
      <form class="space-y-4" (ngSubmit)="submit()">
        @if (error()) {
          <p class="alert-error" role="alert">{{ error() }}</p>
        }
        <label class="label">Username or email
          <input class="input" name="username" autocomplete="username" required [(ngModel)]="username" />
        </label>
        <label class="label">Password
          <input class="input" name="password" type="password" autocomplete="current-password" required [(ngModel)]="password" />
        </label>
        <button class="btn-primary w-full" [disabled]="busy()">{{ busy() ? 'Signing in…' : 'Sign in' }}</button>
        <a class="block text-center text-sm text-muted underline" routerLink="/forgot-password">Forgot your password?</a>
      </form>
    </app-auth-layout>
  `,
})
export class Login {
  private auth = inject(Auth);
  private router = inject(Router);
  username = '';
  password = '';
  busy = signal(false);
  error = signal('');

  async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.username, this.password);
      await this.router.navigate(['/library']);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
