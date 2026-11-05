import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { Auth, errorMessage } from '../core/auth';
import { User } from '../core/models';
import { LocalDatePipe, TPipe, t } from '../i18n/i18n';

@Component({
  imports: [FormsModule, LocalDatePipe, TPipe],
  template: `
    <div class="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <div class="flex items-end justify-between gap-3">
        <h1 class="text-3xl font-semibold">{{ 'Users' | t }}</h1>
        <button type="button" class="btn-primary" (click)="startNew()">{{ 'New user' | t }}</button>
      </div>
      @if (error()) { <p class="alert-error mt-4" role="alert">{{ error() }}</p> }

      @if (form(); as f) {
        <form class="card mt-4 grid gap-4 p-5 md:grid-cols-2" (ngSubmit)="save()">
          <label class="label">{{ 'Name' | t }} <input class="input" name="name" required [(ngModel)]="f.name" /></label>
          <label class="label">{{ 'Username' | t }} <input class="input" name="username" required [disabled]="!!f.id" [(ngModel)]="f.username" /></label>
          <label class="label">{{ 'Email' | t }} <input class="input" name="email" type="email" required [(ngModel)]="f.email" /></label>
          <label class="label">{{ (f.id ? 'New password (optional)' : 'Password') | t }}
            <input class="input" name="password" type="password" autocomplete="new-password" [(ngModel)]="f.password" />
          </label>
          <label class="label">{{ 'Role' | t }}
            <select class="input" name="role" [(ngModel)]="f.role">
              <option value="user">{{ 'User: works on their own items' | t }}</option>
              <option value="admin">{{ 'Admin: full access' | t }}</option>
            </select>
          </label>
          <label class="label flex items-center gap-2 self-end pb-2"><input type="checkbox" class="accent-accent" name="active" [(ngModel)]="f.is_active" /> {{ 'Can sign in' | t }}</label>
          <div class="flex gap-2 md:col-span-2">
            <button class="btn-primary">{{ 'Save' | t }}</button>
            <button type="button" class="btn-ghost" (click)="form.set(null)">{{ 'Cancel' | t }}</button>
          </div>
        </form>
      }

      <div class="card mt-4 overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-line text-xs text-muted">
            <tr><th class="px-4 py-2 font-medium">{{ 'Name' | t }}</th><th class="px-4 py-2 font-medium">{{ 'Role' | t }}</th><th class="px-4 py-2 font-medium">{{ 'Items' | t }}</th><th class="px-4 py-2 font-medium">{{ 'Last sign-in' | t }}</th><th></th></tr>
          </thead>
          <tbody class="divide-y divide-line">
            @for (u of users(); track u.id) {
              <tr>
                <td class="px-4 py-2">{{ u.name }}<span class="block text-xs text-muted">{{ u.username }} · {{ u.email }}</span></td>
                <td class="px-4 py-2">{{ (u.role === 'admin' ? 'Admin' : 'User') | t }}@if (!u.is_active) { <span class="pill ml-1 bg-line text-muted">{{ 'Inactive' | t }}</span> }</td>
                <td class="px-4 py-2">{{ u.object_count }}</td>
                <td class="px-4 py-2 text-muted">{{ u.last_login_at ? (u.last_login_at | localDate) : ('Never' | t) }}</td>
                <td class="px-4 py-2 text-right whitespace-nowrap">
                  <button type="button" class="btn-quiet !px-2 !py-1" (click)="edit(u)">{{ 'Edit' | t }}</button>
                  @if (u.id !== auth.user()?.id) {
                    <button type="button" class="btn-quiet !px-2 !py-1 hover:!text-danger" (click)="remove(u)">{{ 'Delete' | t }}</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class Users implements OnInit {
  private api = inject(Api);
  auth = inject(Auth);
  users = signal<User[]>([]);
  form = signal<any>(null);
  error = signal('');

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.users.set(await this.api.users());
  }

  startNew(): void {
    this.form.set({ id: 0, name: '', username: '', email: '', password: '', role: 'user', is_active: true });
  }

  edit(user: User): void {
    this.form.set({ ...user, password: '' });
  }

  async save(): Promise<void> {
    const f = this.form();
    this.error.set('');
    try {
      if (f.id) await this.api.updateUser(f.id, f);
      else await this.api.createUser(f);
      this.form.set(null);
      await this.load();
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  async remove(user: User): Promise<void> {
    const question = user.object_count ? 'Delete {name}? Their {count} item(s) move to you.' : 'Delete {name}?';
    if (!confirm(t(question, { name: user.name, count: user.object_count ?? 0 }))) return;
    try {
      await this.api.deleteUser(user.id);
      await this.load();
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }
}
