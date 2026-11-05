import { Component, inject } from '@angular/core';
import { Auth } from '../core/auth';
import { locale, LOCALES, setLocale, TPipe } from './i18n';

@Component({
  selector: 'app-lang-switch',
  imports: [TPipe],
  template: `
    <div class="flex gap-1 text-xs" role="group" [attr.aria-label]="'Language' | t">
      @for (l of locales; track l.code) {
        <button
          type="button"
          class="rounded px-1.5 py-0.5"
          [class]="current() === l.code ? 'bg-accent-soft font-semibold text-accent-dark' : 'text-muted hover:text-ink'"
          [attr.aria-pressed]="current() === l.code"
          [attr.lang]="l.code"
          (click)="choose(l.code)"
        >{{ l.label }}</button>
      }
    </div>
  `,
})
export class LangSwitch {
  private auth = inject(Auth);
  locales = LOCALES;
  current = locale;

  choose(code: string): void {
    setLocale(code);
    this.auth.saveLocale(code);
  }
}
