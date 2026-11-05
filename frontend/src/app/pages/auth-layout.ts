import { Component, input } from '@angular/core';
import { LangSwitch } from '../i18n/lang-switch';

@Component({
  selector: 'app-auth-layout',
  imports: [LangSwitch],
  template: `
    <main class="flex min-h-dvh items-center justify-center px-4 py-10">
      <div class="w-full max-w-sm">
        <div class="flex items-center justify-between">
          <p class="font-display text-2xl font-semibold">Makestuff</p>
          <app-lang-switch />
        </div>
        <h1 class="mt-6 text-3xl font-semibold">{{ heading() }}</h1>
        <div class="mt-6"><ng-content /></div>
      </div>
    </main>
  `,
})
export class AuthLayout {
  heading = input.required<string>();
}
