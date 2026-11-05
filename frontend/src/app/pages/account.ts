import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { Auth, errorMessage } from '../core/auth';

@Component({
  imports: [FormsModule],
  template: `
    <div class="mx-auto max-w-md px-4 py-8 md:px-8">
      <h1 class="text-3xl font-semibold">Your account</h1>
      <form class="mt-6 space-y-4" (ngSubmit)="save()">
        @if (error()) { <p class="alert-error" role="alert">{{ error() }}</p> }
        @if (saved()) { <p class="alert-ok" role="status">Saved.</p> }
        <label class="label">Name <input class="input" name="name" required [(ngModel)]="name" /></label>
        <label class="label">Email <input class="input" name="email" type="email" required [(ngModel)]="email" /></label>
        <h2 class="pt-3 text-lg font-semibold">Change password</h2>
        <label class="label">Current password <input class="input" name="current" type="password" autocomplete="current-password" [(ngModel)]="current" /></label>
        <label class="label">New password <input class="input" name="next" type="password" autocomplete="new-password" [(ngModel)]="next" /></label>
        <button class="btn-primary">Save</button>
      </form>
    </div>
  `,
})
export class Account {
  private api = inject(Api);
  private auth = inject(Auth);
  name = this.auth.user()?.name ?? '';
  email = this.auth.user()?.email ?? '';
  current = '';
  next = '';
  saved = signal(false);
  error = signal('');

  async save(): Promise<void> {
    this.saved.set(false);
    this.error.set('');
    try {
      this.auth.user.set(await this.api.updateAccount({ name: this.name, email: this.email, current_password: this.current, new_password: this.next }));
      this.current = this.next = '';
      this.saved.set(true);
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }
}
