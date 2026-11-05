import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from '../core/auth';
import { LangSwitch } from '../i18n/lang-switch';
import { TPipe } from '../i18n/i18n';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LangSwitch, TPipe],
  template: `
    <div class="min-h-dvh md:grid md:grid-cols-[13.5rem_1fr]">
      <header class="flex flex-col border-b border-line bg-surface md:sticky md:top-0 md:h-dvh md:border-b-0 md:border-r">
        <div class="flex items-center justify-between px-5 py-4">
          <a routerLink="/library" class="font-display text-xl font-semibold">Makestuff</a>
          <button type="button" class="btn-quiet md:hidden" [attr.aria-expanded]="open()" (click)="open.set(!open())">{{ 'Menu' | t }}</button>
        </div>
        <nav class="flex-1 flex-col gap-0.5 px-3 pb-3 md:flex" [class]="open() ? 'flex' : 'hidden'" [attr.aria-label]="'Main' | t">
          <a routerLink="/library" [routerLinkActive]="active" [class]="link" (click)="open.set(false)">{{ 'Library' | t }}</a>
          @if (auth.isAdmin()) {
            <p class="mt-5 px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">{{ 'Admin' | t }}</p>
            <a routerLink="/users" [routerLinkActive]="active" [class]="link" (click)="open.set(false)">{{ 'Users' | t }}</a>
            <a routerLink="/connections" [routerLinkActive]="active" [class]="link" (click)="open.set(false)">{{ 'LMS connections' | t }}</a>
          }
          <div class="mt-auto border-t border-line pt-3">
            <div class="px-3 pb-2"><app-lang-switch /></div>
            <a routerLink="/account" [routerLinkActive]="active" [class]="link" (click)="open.set(false)">{{ auth.user()?.name }}</a>
            <button type="button" [class]="link + ' w-full text-left'" (click)="logout()">{{ 'Sign out' | t }}</button>
          </div>
        </nav>
      </header>
      <main class="min-w-0"><router-outlet /></main>
    </div>
  `,
})
export class Shell {
  auth = inject(Auth);
  private router = inject(Router);
  open = signal(false);
  link = 'block rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-line/50 hover:text-ink';
  active = 'bg-accent-soft !text-accent-dark';

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
